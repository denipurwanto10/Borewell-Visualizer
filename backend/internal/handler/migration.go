package handler

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type MigrationHandler struct {
	db         *database.DB
	projectRepo *repository.ProjectRepo
	wellRepo    *repository.WellRepo
	moduleRepo  *repository.ModuleRepo
	docRepo     *repository.DocumentationRepo
	fileStoragePath string
}

func NewMigrationHandler(db *database.DB, projectRepo *repository.ProjectRepo, wellRepo *repository.WellRepo, moduleRepo *repository.ModuleRepo, docRepo *repository.DocumentationRepo, fileStoragePath string) *MigrationHandler {
	return &MigrationHandler{
		db:            db,
		projectRepo:   projectRepo,
		wellRepo:      wellRepo,
		moduleRepo:    moduleRepo,
		docRepo:       docRepo,
		fileStoragePath: fileStoragePath,
	}
}

// ============ REQUEST/RESPONSE TYPES ============

// Legacy data structures from frontend localStorage/IndexedDB

type legacyProject struct {
	ID              string `json:"id"`
	ProjectCode     string `json:"projectCode"`
	ProjectName     string `json:"projectName"`
	ClientName      string `json:"clientName"`
	ContractorName  string `json:"contractorName"`
	Location        string `json:"location"`
	Province        string `json:"province"`
	District        string `json:"district"`
	Village         string `json:"village"`
	Latitude        string `json:"latitude"`
	Longitude       string `json:"longitude"`
	Description     string `json:"description"`
	StartDate       string `json:"startDate"`
	EndDate         string `json:"endDate"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	ArchivedAt      string `json:"archivedAt"`
	Wells           []string `json:"wells"`
}

type legacyWell struct {
	Well struct {
		ID               string `json:"id"`
		ProjectID        string `json:"projectId"`
		WellCode         string `json:"wellCode"`
		WellName         string `json:"wellName"`
		WellType         string `json:"wellType"`
		Location         string `json:"location"`
		Latitude         string `json:"latitude"`
		Longitude        string `json:"longitude"`
		PlannedDepth     string `json:"plannedDepth"`
		ActualDepth      string `json:"actualDepth"`
		DrillingDate     string `json:"drillingDate"`
		CompletionDate   string `json:"completionDate"`
		Status           string `json:"status"`
		Description      string `json:"description"`
		CreatedAt        string `json:"createdAt"`
		UpdatedAt        string `json:"updatedAt"`
		CompanyName      string `json:"companyName"`
		ShallowWellNumber string `json:"shallowWellNumber"`
		Address          string `json:"address"`
		Province         string `json:"province"`
		City             string `json:"city"`
		District         string `json:"district"`
		Village          string `json:"village"`
		BoreholeDate     string `json:"boreholeDate"`
		WellNumber       string `json:"wellNumber"`
		PiezoDistance    string `json:"piezoDistance"`
		PumpType         string `json:"pumpType"`
		PumpPosition     string `json:"pumpPosition"`
		BoreholeImages   map[string]string `json:"boreholeImages"`
	} `json:"well"`
	Model struct {
		Designer struct {
			Version   int         `json:"version"`
			Components any        `json:"components"`
			Config    any        `json:"config"`
		} `json:"designer"`
		GeologicalLog struct {
			Version int             `json:"version"`
			Layers  any            `json:"layers"`
		} `json:"geologicalLog"`
		GroundwaterMonitoring struct {
			Version      int                    `json:"version"`
			Measurements any                    `json:"measurements"`
		} `json:"groundwaterMonitoring"`
		Pipes   []interface{} `json:"pipes"`
		Screens []interface{} `json:"screens"`
		Ground  interface{}   `json:"ground"`
		Mat     interface{}   `json:"mat"`
	} `json:"model"`
	Activity struct {
		Doc1 []legacyDocItem `json:"doc1"`
		Doc2 []legacyDocItem `json:"doc2"`
		Doc3 []legacyDocItem `json:"doc3"`
		Doc4 []legacyDocItem `json:"doc4"`
		Doc5 []legacyDocItem `json:"doc5"`
		Doc6 []legacyDocItem `json:"doc6"`
	} `json:"activity"`
}

type legacyDocItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DataURL     string `json:"dataUrl"`
	CreatedAt   string `json:"createdAt"`
	Description string `json:"description"`
	FileName    string `json:"fileName"`
	FileType    string `json:"fileType"`
	FileSize    int    `json:"fileSize"`
}

type legacyProjectDocs struct {
	Photos    []legacyPhotoDoc `json:"photos"`
	Documents []legacyDocDoc   `json:"documents"`
}

type legacyPhotoDoc struct {
	ID            string `json:"id"`
	ProjectID     string `json:"projectId"`
	WellID        string `json:"wellId"`
	Name          string `json:"name"`
	Category      string `json:"category"`
	Description   string `json:"description"`
	DocumentedAt  string `json:"documentedAt"`
	FileRef       string `json:"fileRef"`
	FileName      string `json:"fileName"`
	FileType      string `json:"fileType"`
	FileSize      int    `json:"fileSize"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type legacyDocDoc struct {
	ID            string `json:"id"`
	ProjectID     string `json:"projectId"`
	WellID        string `json:"wellId"`
	Title         string `json:"title"`
	Category      string `json:"category"`
	Description   string `json:"description"`
	DocumentDate  string `json:"documentDate"`
	FileRef       string `json:"fileRef"`
	FileName      string `json:"fileName"`
	FileType      string `json:"fileType"`
	FileSize      int    `json:"fileSize"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

type legacyWellDocs struct {
	Photos    []legacyPhotoDoc `json:"photos"`
	Documents []legacyDocDoc   `json:"documents"`
}

// Preview request/response

type migrationPreviewRequest struct {
	UserID string `json:"user_id"`
}

type migrationPreviewResponse struct {
	Data struct {
		Projects []previewProject `json:"projects"`
		TotalWells int `json:"total_wells"`
		TotalPhotos int `json:"total_photos"`
		TotalDocuments int `json:"total_documents"`
		IndexedDBFiles struct {
			Photos int `json:"photos"`
			Documents int `json:"documents"`
		} `json:"indexeddb_files"`
		EstimatedSizeMB int `json:"estimated_size_mb"`
		Warnings []string `json:"warnings"`
	} `json:"data"`
}

type previewProject struct {
	ID          string `json:"id"`
	ProjectCode string `json:"project_code"`
	ProjectName string `json:"project_name"`
	WellCount   int    `json:"well_count"`
}

// Import request/response

type migrationImportRequest struct {
	UserID  string `json:"user_id"`
	Options struct {
		SkipConflicts bool `json:"skip_conflicts"`
		DryRun        bool `json:"dry_run"`
	} `json:"options"`
}

type migrationImportResponse struct {
	Data struct {
		Status string `json:"status"` // COMPLETED, PARTIAL, FAILED, NEEDS_REVIEW
		Imported struct {
			Projects int `json:"projects"`
			Wells int `json:"wells"`
			DesignerStates int `json:"designer_states"`
			GeologicalLogs int `json:"geological_logs"`
			MonitoringData int `json:"monitoring_data"`
			Photos int `json:"photos"`
			Documents int `json:"documents"`
			Files int `json:"files"`
		} `json:"imported"`
		Skipped struct {
			Projects int `json:"projects"`
			Wells int `json:"wells"`
			Photos int `json:"photos"`
			Documents int `json:"documents"`
		} `json:"skipped"`
		Errors []string `json:"errors"`
		Warnings []string `json:"warnings"`
	} `json:"data"`
}

// ============ HELPER FUNCTIONS ============

func parseISODate(s string) *time.Time {
	if s == "" {
		return nil
	}
	// Try multiple formats
	formats := []string{
		time.RFC3339,
		"2006-01-02",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05.000Z",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return &t
		}
	}
	return nil
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func intPtr(i int) *int {
	return &i
}

func parseTimeOrDefault(s string) time.Time {
	if t := parseISODate(s); t != nil {
		return *t
	}
	return time.Now()
}

func parseFloat(s string) *float64 {
	if s == "" {
		return nil
	}
	var f float64
	if _, err := fmt.Sscanf(s, "%f", &f); err == nil {
		return &f
	}
	return nil
}

func computeSHA256(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func saveFileToDisk(fileStoragePath, subdir, originalName, mimeType string, data []byte) (string, string, error) {
	// Generate UUID filename with original extension
	ext := filepath.Ext(originalName)
	if ext == "" {
		// Guess from mime type
		switch mimeType {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "image/webp":
			ext = ".webp"
		case "application/pdf":
			ext = ".pdf"
		default:
			ext = ".bin"
		}
	}
	
	fileName := uuid.New().String() + ext
	relPath := filepath.Join(subdir, fileName)
	absPath := filepath.Join(fileStoragePath, relPath)
	
	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return "", "", err
	}
	
	// Write file
	if err := os.WriteFile(absPath, data, 0644); err != nil {
		return "", "", err
	}
	
	// Verify by reading back
	written, err := os.ReadFile(absPath)
	if err != nil {
		return "", "", err
	}
	if !equalBytes(written, data) {
		os.Remove(absPath)
		return "", "", fmt.Errorf("file verification failed: checksum mismatch")
	}
	
	return relPath, computeSHA256(data), nil
}

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func decodeDataURL(dataURL string) ([]byte, string, error) {
	// Format: data:image/jpeg;base64,...
	if !strings.HasPrefix(dataURL, "data:") {
		return nil, "", fmt.Errorf("not a data URL")
	}
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("invalid data URL format")
	}
	
	meta := parts[0]
	data := parts[1]
	
	// Extract mime type
	mimeType := ""
	if strings.HasPrefix(meta, "data:") {
		mimeType = strings.TrimPrefix(meta, "data:")
		if idx := strings.Index(mimeType, ";"); idx >= 0 {
			mimeType = mimeType[:idx]
		}
	}
	
	// Decode base64
	decoded, err := decodeBase64(data)
	if err != nil {
		return nil, "", err
	}
	
	return decoded, mimeType, nil
}

func decodeBase64(s string) ([]byte, error) {
	// Handle possible whitespace
	s = strings.TrimSpace(s)
	return decodeBase64Std(s)
}

func decodeBase64Std(s string) ([]byte, error) {
	// Use standard library
	return base64.StdEncoding.DecodeString(s)
}

// ============ PREVIEW ENDPOINT ============

// PreviewMigration POST /api/v1/migration/preview
func (h *MigrationHandler) PreviewMigration(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}
	
	uid := userID.(uuid.UUID)
	
	// Scan localStorage keys from request body (sent by frontend)
	var req migrationPreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// If no body, try to get from query
		req.UserID = uid.String()
	}
	
	// For preview, we need the frontend to send the localStorage data
	// since backend cannot access browser localStorage directly
	// This endpoint expects the frontend to pass the detected legacy data
	
	var legacyData struct {
		Projects []legacyProject `json:"projects"`
		Wells    []legacyWell    `json:"wells"`
		ProjectDocs map[string]legacyProjectDocs `json:"project_docs"`
		WellDocs    map[string]legacyWellDocs    `json:"well_docs"`
		IndexedDBPhotos int `json:"indexeddb_photos"`
		IndexedDBDocuments int `json:"indexeddb_documents"`
	}
	
	if err := c.ShouldBindJSON(&legacyData); err != nil {
		// If no legacy data provided, return empty preview
		c.JSON(http.StatusOK, gin.H{"data": migrationPreviewResponse{}})
		return
	}
	
	// Check for conflicts with existing data
	warnings := []string{}
	
	existingProjects, _, err := h.projectRepo.ListForUser(c.Request.Context(), uid, 1, 1000, "updated_at", "desc", "", "")
	if err == nil {
		existingCodes := make(map[string]bool)
		for _, p := range existingProjects {
			existingCodes[p.ProjectCode] = true
		}
		for _, lp := range legacyData.Projects {
			if existingCodes[lp.ProjectCode] {
				warnings = append(warnings, fmt.Sprintf("Project code '%s' already exists for this user", lp.ProjectCode))
			}
		}
	}
	
	response := migrationPreviewResponse{}
	response.Data.TotalWells = len(legacyData.Wells)
	
	for _, lp := range legacyData.Projects {
		wellCount := 0
		for _, lw := range legacyData.Wells {
			if lw.Well.ProjectID == lp.ID {
				wellCount++
			}
		}
		response.Data.Projects = append(response.Data.Projects, previewProject{
			ID:          lp.ID,
			ProjectCode: lp.ProjectCode,
			ProjectName: lp.ProjectName,
			WellCount:   wellCount,
		})
	}
	
	// Count photos/documents
	for _, pd := range legacyData.ProjectDocs {
		response.Data.TotalPhotos += len(pd.Photos)
		response.Data.TotalDocuments += len(pd.Documents)
	}
	for _, wd := range legacyData.WellDocs {
		response.Data.TotalPhotos += len(wd.Photos)
		response.Data.TotalDocuments += len(wd.Documents)
	}
	
	response.Data.IndexedDBFiles.Photos = legacyData.IndexedDBPhotos
	response.Data.IndexedDBFiles.Documents = legacyData.IndexedDBDocuments
	
	// Rough estimate: 1MB per photo, 0.5MB per doc, plus JSON
	response.Data.EstimatedSizeMB = (response.Data.TotalPhotos + legacyData.IndexedDBPhotos) + (response.Data.TotalDocuments + legacyData.IndexedDBDocuments)/2
	if response.Data.EstimatedSizeMB < 1 {
		response.Data.EstimatedSizeMB = 1
	}
	
	response.Data.Warnings = warnings
	
	c.JSON(http.StatusOK, gin.H{"data": response.Data})
}

// ============ IMPORT ENDPOINT ============

// ImportMigration POST /api/v1/migration/import
func (h *MigrationHandler) ImportMigration(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}
	
	uid := userID.(uuid.UUID)
	
	// Parse multipart form for file uploads
	if err := c.Request.ParseMultipartForm(100 << 20); err != nil { // 100MB max
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Failed to parse multipart form", c.Request.URL.Path))
		return
	}
	
	// Get JSON data from form field
	jsonData := c.PostForm("data")
	if jsonData == "" {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Missing 'data' field with legacy JSON", c.Request.URL.Path))
		return
	}
	
	var req migrationImportRequest
	if err := json.Unmarshal([]byte(jsonData), &req); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid JSON in 'data' field", c.Request.URL.Path))
		return
	}
	req.UserID = uid.String()
	
	// Parse legacy data from form field
	legacyJSON := c.PostForm("legacy")
	if legacyJSON == "" {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Missing 'legacy' field with legacy data", c.Request.URL.Path))
		return
	}
	
	var legacyData struct {
		Projects []legacyProject `json:"projects"`
		Wells    []legacyWell    `json:"wells"`
		ProjectDocs map[string]legacyProjectDocs `json:"project_docs"`
		WellDocs    map[string]legacyWellDocs    `json:"well_docs"`
	}
	if err := json.Unmarshal([]byte(legacyJSON), &legacyData); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid legacy data JSON", c.Request.URL.Path))
		return
	}
	
	// Get uploaded files from form
	files := c.Request.MultipartForm.File
	
	response := migrationImportResponse{}
	response.Data.Status = "COMPLETED"
	
	// Use transaction for atomicity
	tx, err := h.db.Pool.Begin(c.Request.Context())
	if err != nil {
		response.Data.Status = "FAILED"
		response.Data.Errors = append(response.Data.Errors, "Failed to start transaction: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"data": response.Data})
		return
	}
	defer tx.Rollback(c.Request.Context())
	
	// Set user context for RLS
	if _, err := tx.Exec(c.Request.Context(), "SET LOCAL app.current_user_id = $1", uid); err != nil {
		response.Data.Status = "FAILED"
		response.Data.Errors = append(response.Data.Errors, "Failed to set RLS context: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"data": response.Data})
		return
	}
	
	// Map legacy project IDs to new backend UUIDs
	projectIDMap := make(map[string]uuid.UUID)
	
	// Process projects
	for _, lp := range legacyData.Projects {
		// Check conflict
		existing, err := h.projectRepo.GetByCodeForUser(c.Request.Context(), uid, lp.ProjectCode)
		if err == nil && existing != nil {
			if req.Options.SkipConflicts {
				response.Data.Skipped.Projects++
				response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Skipped project '%s' (code exists)", lp.ProjectCode))
				continue
			}
			// Generate new code
			lp.ProjectCode = lp.ProjectCode + "-IMPORT"
		}
		
		// Create project
		project := &model.Project{
			ProjectCode:    lp.ProjectCode,
			ProjectName:    lp.ProjectName,
			ClientName:     lp.ClientName,
			ContractorName: stringPtr(lp.ContractorName),
			Location:       stringPtr(lp.Location),
			Province:       stringPtr(lp.Province),
			District:       stringPtr(lp.District),
			Village:        stringPtr(lp.Village),
			Latitude:       stringPtr(lp.Latitude),
			Longitude:      stringPtr(lp.Longitude),
			Description:    stringPtr(lp.Description),
			StartDate:      parseISODate(lp.StartDate),
			EndDate:        parseISODate(lp.EndDate),
			Status:         lp.Status,
			CreatedAt:      parseTimeOrDefault(lp.CreatedAt),
			UpdatedAt:      parseTimeOrDefault(lp.UpdatedAt),
			ArchivedAt:     parseISODate(lp.ArchivedAt),
		}
		
		// project.CreatedAt and UpdatedAt are time.Time (not pointers), parseTimeOrDefault ensures they have values
		
		if err := h.projectRepo.CreateWithTx(c.Request.Context(), tx, project); err != nil {
			response.Data.Status = "FAILED"
			response.Data.Errors = append(response.Data.Errors, fmt.Sprintf("Failed to create project '%s': %v", lp.ProjectCode, err))
			continue
		}
		
		projectIDMap[lp.ID] = project.ID
		response.Data.Imported.Projects++
		
		// Process project-level documentation
		if pd, ok := legacyData.ProjectDocs[lp.ID]; ok {
			for _, ph := range pd.Photos {
				if err := h.importPhoto(c.Request.Context(), tx, uid, project.ID, uuid.Nil, ph, files); err != nil {
					response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import photo '%s': %v", ph.Name, err))
				} else {
					response.Data.Imported.Photos++
				}
			}
			for _, dc := range pd.Documents {
				if err := h.importDocument(c.Request.Context(), tx, uid, project.ID, uuid.Nil, dc, files); err != nil {
					response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import document '%s': %v", dc.Title, err))
				} else {
					response.Data.Imported.Documents++
				}
			}
		}
	}
	
	// Process wells
	for _, lw := range legacyData.Wells {
		newProjectID, ok := projectIDMap[lw.Well.ProjectID]
		if !ok {
			response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Well '%s' references unknown project, skipping", lw.Well.WellCode))
			response.Data.Skipped.Wells++
			continue
		}
		
		// Check well code conflict
		existingWell, err := h.wellRepo.GetByCodeForProject(c.Request.Context(), newProjectID, lw.Well.WellCode)
		if err == nil && existingWell != nil {
			if req.Options.SkipConflicts {
				response.Data.Skipped.Wells++
				response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Skipped well '%s' (code exists in project)", lw.Well.WellCode))
				continue
			}
			lw.Well.WellCode = lw.Well.WellCode + "-IMPORT"
		}
		
		// Create well
		well := &model.Well{
			ProjectID:      newProjectID,
			WellCode:       lw.Well.WellCode,
			WellName:       lw.Well.WellName,
			WellType:       lw.Well.WellType,
			Location:       stringPtr(lw.Well.Location),
			Latitude:       stringPtr(lw.Well.Latitude),
			Longitude:      stringPtr(lw.Well.Longitude),
			PlannedDepth:   parseFloat(lw.Well.PlannedDepth),
			ActualDepth:    parseFloat(lw.Well.ActualDepth),
			DrillingDate:   parseISODate(lw.Well.DrillingDate),
			CompletionDate: parseISODate(lw.Well.CompletionDate),
			Status:         lw.Well.Status,
			Description:    stringPtr(lw.Well.Description),
			CreatedAt:      parseTimeOrDefault(lw.Well.CreatedAt),
			UpdatedAt:      parseTimeOrDefault(lw.Well.UpdatedAt),
		}
		
		// well.CreatedAt and UpdatedAt are time.Time (not pointers), parseTimeOrDefault ensures they have values
		
		if err := h.wellRepo.CreateWithTx(c.Request.Context(), tx, well); err != nil {
			response.Data.Status = "FAILED"
			response.Data.Errors = append(response.Data.Errors, fmt.Sprintf("Failed to create well '%s': %v", lw.Well.WellCode, err))
			continue
		}
		
		response.Data.Imported.Wells++
		
		// Import Designer
		hasComponents := lw.Model.Designer.Components != nil
		hasConfig := lw.Model.Designer.Config != nil
		if hasComponents || hasConfig {
			designer := &model.DesignerState{
				WellID:      well.ID,
				Version:     lw.Model.Designer.Version,
				Components:  lw.Model.Designer.Components,
				Config:      lw.Model.Designer.Config,
			}
			if designer.Version == 0 { designer.Version = 1 }
			if err := h.moduleRepo.UpsertDesignerWithTx(c.Request.Context(), tx, designer); err != nil {
				response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import designer for well '%s': %v", well.WellCode, err))
			} else {
				response.Data.Imported.DesignerStates++
			}
		}
		
		// Import Geology
		hasLayers := lw.Model.GeologicalLog.Layers != nil
		if hasLayers {
			geology := &model.GeologyLog{
				WellID: well.ID,
				Version: lw.Model.GeologicalLog.Version,
				Layers:  lw.Model.GeologicalLog.Layers,
			}
			if geology.Version == 0 { geology.Version = 1 }
			if err := h.moduleRepo.UpsertGeologyWithTx(c.Request.Context(), tx, geology); err != nil {
				response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import geology for well '%s': %v", well.WellCode, err))
			} else {
				response.Data.Imported.GeologicalLogs++
			}
		}
		
		// Import Monitoring
		hasMeasurements := lw.Model.GroundwaterMonitoring.Measurements != nil
		if hasMeasurements {
			monitoring := &model.MonitoringData{
				WellID:       well.ID,
				Version:      lw.Model.GroundwaterMonitoring.Version,
				Measurements: lw.Model.GroundwaterMonitoring.Measurements,
			}
			if monitoring.Version == 0 { monitoring.Version = 1 }
			if err := h.moduleRepo.UpsertMonitoringWithTx(c.Request.Context(), tx, monitoring); err != nil {
				response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import monitoring for well '%s': %v", well.WellCode, err))
			} else {
				response.Data.Imported.MonitoringData++
			}
		}
		
		// Import borehole images from well data
		for key, dataURL := range lw.Well.BoreholeImages {
			if dataURL != "" && strings.HasPrefix(dataURL, "data:") {
				name := ""
				switch key {
				case "borehole1": name = "Ujung Pipa Awal"
				case "borehole2": name = "Muka Air Tanah"
				case "borehole3": name = "Batas Pipa"
				case "borehole4": name = "Screen Perforasi"
				case "borehole5": name = "Dasar Sumur Bor"
				default: name = "Gambar Borehole " + key
				}
				ph := legacyPhotoDoc{
					ID:           uuid.New().String(),
					ProjectID:    newProjectID.String(),
					WellID:       well.ID.String(),
					Name:         name,
					Category:     "well_construction",
					Description:  "Foto migrasi: " + name,
					DocumentedAt: time.Now().UTC().Format(time.RFC3339),
					FileRef:      dataURL,
					FileName:     key + ".jpg",
					FileType:     "image/jpeg",
					FileSize:     len(dataURL) * 3 / 4,
				}
				if err := h.importPhoto(c.Request.Context(), tx, uid, newProjectID, well.ID, ph, files); err != nil {
					response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import borehole image '%s': %v", name, err))
				} else {
					response.Data.Imported.Photos++
				}
			}
		}
		
		// Import activity images
		activityCategories := map[string]string{
			"Doc1": "site_condition",
			"Doc2": "well_construction",
			"Doc3": "drilling_process",
			"Doc4": "drilling_process",
			"Doc5": "casing_installation",
			"Doc6": "pump_installation",
		}
		for actKey, category := range activityCategories {
			items := []legacyDocItem{}
			switch actKey {
			case "Doc1": items = lw.Activity.Doc1
			case "Doc2": items = lw.Activity.Doc2
			case "Doc3": items = lw.Activity.Doc3
			case "Doc4": items = lw.Activity.Doc4
			case "Doc5": items = lw.Activity.Doc5
			case "Doc6": items = lw.Activity.Doc6
			}
			for i, item := range items {
				if item.DataURL != "" && strings.HasPrefix(item.DataURL, "data:") {
					ph := legacyPhotoDoc{
						ID:           item.ID,
						ProjectID:    newProjectID.String(),
						WellID:       well.ID.String(),
						Name:         item.Name,
						Category:     category,
						Description:  item.Description,
						DocumentedAt: item.CreatedAt,
						FileRef:      item.DataURL,
						FileName:     item.FileName,
						FileType:     item.FileType,
						FileSize:     item.FileSize,
					}
					if ph.Name == "" { ph.Name = fmt.Sprintf("Foto %d", i+1) }
					if ph.FileName == "" { ph.FileName = fmt.Sprintf("activity-%s-%d.jpg", strings.ToLower(actKey), i) }
					if ph.FileType == "" { ph.FileType = "image/jpeg" }
					if err := h.importPhoto(c.Request.Context(), tx, uid, newProjectID, well.ID, ph, files); err != nil {
						response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import activity image: %v", err))
					} else {
						response.Data.Imported.Photos++
					}
				}
			}
		}
		
		// Import well-level documentation
		if wd, ok := legacyData.WellDocs[well.ID.String()]; ok {
			for _, ph := range wd.Photos {
				if err := h.importPhoto(c.Request.Context(), tx, uid, newProjectID, well.ID, ph, files); err != nil {
					response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import photo '%s': %v", ph.Name, err))
				} else {
					response.Data.Imported.Photos++
				}
			}
			for _, dc := range wd.Documents {
				if err := h.importDocument(c.Request.Context(), tx, uid, newProjectID, well.ID, dc, files); err != nil {
					response.Data.Warnings = append(response.Data.Warnings, fmt.Sprintf("Failed to import document '%s': %v", dc.Title, err))
				} else {
					response.Data.Imported.Documents++
				}
			}
		}
	}
	
	// If dry run, rollback and return preview
	if req.Options.DryRun {
		response.Data.Status = "DRY_RUN"
		c.JSON(http.StatusOK, gin.H{"data": response.Data})
		return
	}
	
	// Commit transaction
	if err := tx.Commit(c.Request.Context()); err != nil {
		response.Data.Status = "FAILED"
		response.Data.Errors = append(response.Data.Errors, "Failed to commit transaction: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"data": response.Data})
		return
	}
	
	// Log activity
	h.logMigrationActivity(c.Request.Context(), uid, response.Data)
	
	c.JSON(http.StatusOK, gin.H{"data": response.Data})
}

func (h *MigrationHandler) importPhoto(ctx context.Context, tx pgx.Tx, ownerID, projectID, wellID uuid.UUID, ph legacyPhotoDoc, files map[string][]*multipart.FileHeader) error {
	var fileData []byte
	var mimeType string
	var fileName string
	
	if strings.HasPrefix(ph.FileRef, "data:") {
		// Base64 data URL
		data, mt, err := decodeDataURL(ph.FileRef)
		if err != nil {
			return err
		}
		fileData = data
		mimeType = mt
		fileName = ph.FileName
	} else if strings.HasPrefix(ph.FileRef, "indexeddb:") {
		// File should be in uploaded multipart files
		// Format: indexeddb:photos:uuid or indexeddb:documents:uuid
		parts := strings.Split(ph.FileRef, ":")
		if len(parts) == 3 {
			fileID := parts[2]
			// Look for file in multipart uploads
			for _, fhs := range files {
				for _, fh := range fhs {
					if strings.Contains(fh.Filename, fileID) {
						f, err := fh.Open()
						if err != nil {
							continue
						}
						fileData, _ = io.ReadAll(f)
						f.Close()
						mimeType = ph.FileType
						fileName = ph.FileName
						break
					}
				}
			}
		}
		if fileData == nil {
			return fmt.Errorf("IndexedDB file not found in upload: %s", ph.FileRef)
		}
	} else {
		return fmt.Errorf("unknown fileRef format: %s", ph.FileRef)
	}
	
	if fileData == nil || len(fileData) == 0 {
		return fmt.Errorf("empty file data")
	}
	
	// Validate mime type
	allowedMimes := map[string]bool{
		"image/jpeg": true, "image/png": true, "image/webp": true,
	}
	if !allowedMimes[mimeType] {
		mimeType = "image/jpeg" // default
	}
	
	// Save to disk
	relPath, checksum, err := saveFileToDisk(h.fileStoragePath, "photos", fileName, mimeType, fileData)
	if err != nil {
		return err
	}
	
	// Check for duplicate checksum
	existingFile, err := h.docRepo.GetFileByChecksum(ctx, tx, checksum)
	if err == nil && existingFile != nil {
		// Reuse existing file
		return h.docRepo.CreatePhotoWithTx(ctx, tx, &model.Photo{
			ProjectID:     projectID,
			WellID:        &wellID,
			FileID:        existingFile.ID,
			Name:          ph.Name,
			Category:      ph.Category,
			Description:   ph.Description,
			DocumentedAt:  parseTimeOrDefault(ph.DocumentedAt),
			Width:         intPtr(ph.Width),
			Height:        intPtr(ph.Height),
		})
	}
	
	// Create file record
	file := &model.File{
		OwnerID:      ownerID,
		ProjectID:    &projectID,
		WellID:       &wellID,
		OriginalName: fileName,
		MimeType:     mimeType,
		SizeBytes:    int64(len(fileData)),
		StoragePath:  relPath,
		ChecksumSHA256: checksum,
	}
	if err := h.docRepo.CreateFileWithTx(ctx, tx, file); err != nil {
		// Clean up file on error
		os.Remove(filepath.Join(h.fileStoragePath, relPath))
		return err
	}
	
	// Create photo record
	return h.docRepo.CreatePhotoWithTx(ctx, tx, &model.Photo{
		ProjectID:     projectID,
		WellID:        &wellID,
		FileID:        file.ID,
		Name:          ph.Name,
		Category:      ph.Category,
		Description:   ph.Description,
		DocumentedAt:  parseTimeOrDefault(ph.DocumentedAt),
		Width:         intPtr(ph.Width),
		Height:        intPtr(ph.Height),
	})
}

func (h *MigrationHandler) importDocument(ctx context.Context, tx pgx.Tx, ownerID, projectID, wellID uuid.UUID, dc legacyDocDoc, files map[string][]*multipart.FileHeader) error {
	var fileData []byte
	var mimeType string
	var fileName string
	
	if strings.HasPrefix(dc.FileRef, "data:") {
		data, mt, err := decodeDataURL(dc.FileRef)
		if err != nil {
			return err
		}
		fileData = data
		mimeType = mt
		fileName = dc.FileName
	} else if strings.HasPrefix(dc.FileRef, "indexeddb:") {
		parts := strings.Split(dc.FileRef, ":")
		if len(parts) == 3 {
			fileID := parts[2]
			for _, fhs := range files {
				for _, fh := range fhs {
					if strings.Contains(fh.Filename, fileID) {
						f, err := fh.Open()
						if err != nil {
							continue
						}
						fileData, _ = io.ReadAll(f)
						f.Close()
						mimeType = dc.FileType
						fileName = dc.FileName
						break
					}
				}
			}
		}
		if fileData == nil {
			return fmt.Errorf("IndexedDB file not found in upload: %s", dc.FileRef)
		}
	} else {
		return fmt.Errorf("unknown fileRef format: %s", dc.FileRef)
	}
	
	if fileData == nil || len(fileData) == 0 {
		return fmt.Errorf("empty file data")
	}
	
	allowedMimes := map[string]bool{
		"application/pdf": true, "image/jpeg": true, "image/png": true, "image/webp": true, "text/plain": true,
	}
	if !allowedMimes[mimeType] {
		mimeType = "application/pdf"
	}
	
	relPath, checksum, err := saveFileToDisk(h.fileStoragePath, "documents", fileName, mimeType, fileData)
	if err != nil {
		return err
	}
	
	existingFile, err := h.docRepo.GetFileByChecksum(ctx, tx, checksum)
	if err == nil && existingFile != nil {
		return h.docRepo.CreateDocumentWithTx(ctx, tx, &model.Document{
			ProjectID:     projectID,
			WellID:        &wellID,
			FileID:        existingFile.ID,
			Title:         dc.Title,
			Category:      dc.Category,
			Description:   dc.Description,
			DocumentDate:  parseTimeOrDefault(dc.DocumentDate),
		})
	}
	
	file := &model.File{
		OwnerID:      ownerID,
		ProjectID:    &projectID,
		WellID:       &wellID,
		OriginalName: fileName,
		MimeType:     mimeType,
		SizeBytes:    int64(len(fileData)),
		StoragePath:  relPath,
		ChecksumSHA256: checksum,
	}
	if err := h.docRepo.CreateFileWithTx(ctx, tx, file); err != nil {
		os.Remove(filepath.Join(h.fileStoragePath, relPath))
		return err
	}
	
	return h.docRepo.CreateDocumentWithTx(ctx, tx, &model.Document{
		ProjectID:     projectID,
		WellID:        &wellID,
		FileID:        file.ID,
		Title:         dc.Title,
		Category:      dc.Category,
		Description:   dc.Description,
		DocumentDate:  parseTimeOrDefault(dc.DocumentDate),
	})
}

func (h *MigrationHandler) logMigrationActivity(ctx context.Context, userID uuid.UUID, data struct {
	Status string `json:"status"`
	Imported struct {
		Projects int `json:"projects"`
		Wells int `json:"wells"`
		DesignerStates int `json:"designer_states"`
		GeologicalLogs int `json:"geological_logs"`
		MonitoringData int `json:"monitoring_data"`
		Photos int `json:"photos"`
		Documents int `json:"documents"`
		Files int `json:"files"`
	} `json:"imported"`
	Skipped struct {
		Projects int `json:"projects"`
		Wells int `json:"wells"`
		Photos int `json:"photos"`
		Documents int `json:"documents"`
	} `json:"skipped"`
	Errors []string `json:"errors"`
	Warnings []string `json:"warnings"`
}) {
	metadata := map[string]interface{}{
		"imported": data.Imported,
		"skipped":  data.Skipped,
		"errors":   data.Errors,
		"warnings": data.Warnings,
	}
	metadataJSON, _ := json.Marshal(metadata)
	
	_, _ = h.db.Pool.Exec(ctx, `
		INSERT INTO activity_logs (user_id, action, entity_type, metadata)
		VALUES ($1, $2, $3, $4)
	`, userID, "migration.import", "all", metadataJSON)
}