package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type BackupHandler struct {
	db         *database.DB
	projectRepo *repository.ProjectRepo
	wellRepo    *repository.WellRepo
	moduleRepo  *repository.ModuleRepo
	docRepo     *repository.DocumentationRepo
}

func NewBackupHandler(db *database.DB, projectRepo *repository.ProjectRepo, wellRepo *repository.WellRepo, moduleRepo *repository.ModuleRepo, docRepo *repository.DocumentationRepo) *BackupHandler {
	return &BackupHandler{db: db, projectRepo: projectRepo, wellRepo: wellRepo, moduleRepo: moduleRepo, docRepo: docRepo}
}

// backupWell represents a well with all its module data for export.
type backupWell struct {
	Well       *model.Well               `json:"well"`
	Designer   *model.DesignerState      `json:"designer,omitempty"`
	Geology    *model.GeologyLog         `json:"geology,omitempty"`
	Monitoring *model.MonitoringData     `json:"monitoring,omitempty"`
	Photos     []*model.PhotoWithFile    `json:"photos,omitempty"`
	Documents  []*model.DocumentWithFile `json:"documents,omitempty"`
}

// backupProject represents a project with all its wells for export.
type backupProject struct {
	Project *model.Project `json:"project"`
	Wells   []backupWell   `json:"wells"`
}

// backupManifest is the top-level export format.
type backupManifest struct {
	Format    string          `json:"format"`
	Version   int             `json:"version"`
	CreatedAt string          `json:"created_at"`
	OwnerID   string          `json:"owner_id"`
	Projects  []backupProject `json:"projects"`
}

// CreateBackup POST /api/v1/backup
// Exports all user data as JSON. Includes projects, wells, modules
// (designer, geology, monitoring), documentation metadata, and file references.
func (h *BackupHandler) CreateBackup(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	uid := userID.(uuid.UUID)

	projects, _, err := h.projectRepo.ListForUser(c.Request.Context(), uid, 1, 1000, "updated_at", "desc", "", "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to export projects", c.Request.URL.Path))
		return
	}

	manifest := backupManifest{
		Format:    "borewell-engineering-backup",
		Version:   1,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		OwnerID:   uid.String(),
	}

	totalWells := 0
	totalPhotos := 0
	totalDocuments := 0

	for _, p := range projects {
		bp := backupProject{Project: p}

		wells, _, err := h.wellRepo.ListForProject(c.Request.Context(), p.ID, uid, 1, 1000, "well_code", "asc", "", "", "")
		if err != nil {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to export wells", c.Request.URL.Path))
			return
		}

		for _, w := range wells {
			bw := backupWell{Well: w}
			totalWells++

			if designer, err := h.moduleRepo.GetDesignerForUser(c.Request.Context(), w.ID, uid); err == nil {
				bw.Designer = designer
			}
			if geology, err := h.moduleRepo.GetGeologyForUser(c.Request.Context(), w.ID, uid); err == nil {
				bw.Geology = geology
			}
			if monitoring, err := h.moduleRepo.GetMonitoringForUser(c.Request.Context(), w.ID, uid); err == nil {
				bw.Monitoring = monitoring
			}
			if photos, _, err := h.docRepo.ListPhotos(c.Request.Context(), uid, &p.ID, &w.ID, 1, 1000, "documented_at", "desc", "", ""); err == nil {
				bw.Photos = photos
				totalPhotos += len(photos)
			}
			if docs, _, err := h.docRepo.ListDocuments(c.Request.Context(), uid, &p.ID, &w.ID, 1, 1000, "document_date", "desc", "", ""); err == nil {
				bw.Documents = docs
				totalDocuments += len(docs)
			}

			bp.Wells = append(bp.Wells, bw)
		}

		manifest.Projects = append(manifest.Projects, bp)
	}

	manifestJSON, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to serialize backup", c.Request.URL.Path))
		return
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", `attachment; filename="borewell-backup-`+time.Now().UTC().Format("20060102-150405")+`.json"`)
	c.Header("X-Backup-Project-Count", fmt.Sprintf("%d", len(manifest.Projects)))
	c.Header("X-Backup-Well-Count", fmt.Sprintf("%d", totalWells))
	c.Header("X-Backup-Photo-Count", fmt.Sprintf("%d", totalPhotos))
	c.Header("X-Backup-Document-Count", fmt.Sprintf("%d", totalDocuments))
	c.String(http.StatusOK, string(manifestJSON))
}

// restoreManifest represents the incoming backup JSON for restore.
type restoreManifest struct {
	Format  string `json:"format"`
	Version int    `json:"version"`
	Projects []struct {
		Project *model.Project `json:"project"`
		Wells   []struct {
			Well       *model.Well               `json:"well"`
			Designer   *model.DesignerState      `json:"designer,omitempty"`
			Geology    *model.GeologyLog         `json:"geology,omitempty"`
			Monitoring *model.MonitoringData     `json:"monitoring,omitempty"`
			Photos     []*model.PhotoWithFile    `json:"photos,omitempty"`
			Documents  []*model.DocumentWithFile `json:"documents,omitempty"`
		} `json:"wells"`
	} `json:"projects"`
}

// restoreResult is the response for restore preview/execute.
type restoreResult struct {
	Mode     string `json:"mode"`
	Restored struct {
		Projects  int `json:"projects"`
		Wells     int `json:"wells"`
		Photos    int `json:"photos"`
		Documents int `json:"documents"`
	} `json:"restored"`
	Conflicts []interface{} `json:"conflicts"`
}

// RestoreBackup POST /api/v1/backup/restore
// Accepts JSON backup body. Mode: "replace" or "merge".
// Returns preview of what will be restored.
// Physical file restore is not handled here; files remain referenced by storage_path.
func (h *BackupHandler) RestoreBackup(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	_ = userID.(uuid.UUID)
	mode := c.PostForm("mode")
	if mode != "replace" && mode != "merge" {
		mode = "merge"
	}

	var manifest restoreManifest
	if err := json.NewDecoder(c.Request.Body).Decode(&manifest); err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid backup JSON: "+err.Error(), c.Request.URL.Path))
		return
	}

	if manifest.Format != "borewell-engineering-backup" {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid backup format", c.Request.URL.Path))
		return
	}

	result := restoreResult{Mode: mode}
	result.Conflicts = []interface{}{}

	// Count what would be restored (preview). Actual DB writes require
	// transactional inserts with conflict handling; for now we report counts.
	for _, bp := range manifest.Projects {
		if bp.Project == nil {
			continue
		}
		result.Restored.Projects++

		for _, bw := range bp.Wells {
			if bw.Well == nil {
				continue
			}
			result.Restored.Wells++
			if bw.Photos != nil {
				result.Restored.Photos += len(bw.Photos)
			}
			if bw.Documents != nil {
				result.Restored.Documents += len(bw.Documents)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}
