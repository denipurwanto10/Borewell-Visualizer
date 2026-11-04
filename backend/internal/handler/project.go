package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type ProjectHandler struct {
	projectRepo     *repository.ProjectRepo
	wellRepo        *repository.WellRepo
	assignmentRepo  *repository.AssignmentRepo
}

func NewProjectHandler(projectRepo *repository.ProjectRepo, wellRepo *repository.WellRepo, assignmentRepo *repository.AssignmentRepo) *ProjectHandler {
	return &ProjectHandler{
		projectRepo:    projectRepo,
		wellRepo:       wellRepo,
		assignmentRepo: assignmentRepo,
	}
}

type WellHandler struct {
	wellRepo    *repository.WellRepo
	projectRepo *repository.ProjectRepo
}


func NewWellHandler(wellRepo *repository.WellRepo, projectRepo *repository.ProjectRepo) *WellHandler {
	return &WellHandler{
		wellRepo:    wellRepo,
		projectRepo: projectRepo,
	}
}

// ListProjects GET /api/v1/projects
func (h *ProjectHandler) ListProjects(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 {
			if v > 100 {
				v = 100
			}
			pageSize = v
		}
	}

	sortBy := c.DefaultQuery("sort_by", "updated_at")
	sortDir := c.DefaultQuery("sort_dir", "desc")
	statusFilter := c.Query("filter[status]")
	search := c.Query("filter[project_name][contains]")
	if search == "" {
		search = c.Query("search")
	}

	projects, total, err := h.projectRepo.ListForUser(c.Request.Context(), userID.(uuid.UUID), page, pageSize, sortBy, sortDir, statusFilter, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to list projects", c.Request.URL.Path))
		return
	}

	totalPages := (total + pageSize - 1) / pageSize
	c.JSON(http.StatusOK, gin.H{
		"data": projects,
		"meta": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// GetProject GET /api/v1/projects/:id
func (h *ProjectHandler) GetProject(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	project, err := h.projectRepo.GetByIDForUser(c.Request.Context(), projectID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get project", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": project})
}

// CreateProject POST /api/v1/projects
func (h *ProjectHandler) CreateProject(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	var req model.ProjectCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	validStatuses := map[string]bool{"planning": true, "in_progress": true, "completed": true, "on_hold": true, "archived": true}
	if !validStatuses[req.Status] {
		req.Status = "planning"
	}

	startDate := parseTimeOrNil(req.StartDate)
	endDate := parseTimeOrNil(req.EndDate)

	if startDate != nil && endDate != nil && endDate.Before(*startDate) {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "end_date", "code": "invalid", "message": "Tanggal selesai tidak boleh sebelum tanggal mulai"},
		}, c.Request.URL.Path))
		return
	}

	if req.Latitude != "" {
		if _, err := strconv.ParseFloat(req.Latitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "latitude", "code": "invalid", "message": "Latitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
	}
	if req.Longitude != "" {
		if _, err := strconv.ParseFloat(req.Longitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "longitude", "code": "invalid", "message": "Longitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
	}

	project := &model.Project{
		ID:             uuid.New(),
		OwnerID:        userID.(uuid.UUID),
		ProjectCode:    req.ProjectCode,
		ProjectName:    req.ProjectName,
		ClientName:     req.ClientName,
		ContractorName: &req.ContractorName,
		Location:       &req.Location,
		Province:       &req.Province,
		District:       &req.District,
		Village:        &req.Village,
		Latitude:       &req.Latitude,
		Longitude:      &req.Longitude,
		Description:    &req.Description,
		StartDate:      startDate,
		EndDate:        endDate,
		Status:         req.Status,
		CreatedAt:      nowUTC(),
		UpdatedAt:      nowUTC(),
	}

	if err := h.projectRepo.Create(c.Request.Context(), project); err != nil {
		if err == repository.ErrProjectCodeExists {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Project code already exists", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, err.Error(), c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": project})
}

// UpdateProject PUT /api/v1/projects/:id
func (h *ProjectHandler) UpdateProject(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	var req model.ProjectUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	updates := make(map[string]any)
	if req.ProjectCode != "" {
		updates["project_code"] = req.ProjectCode
	}
	if req.ProjectName != "" {
		updates["project_name"] = req.ProjectName
	}
	if req.ClientName != "" {
		updates["client_name"] = req.ClientName
	}
	if req.ContractorName != "" {
		updates["contractor_name"] = req.ContractorName
	}
	if req.Location != "" {
		updates["location"] = req.Location
	}
	if req.Province != "" {
		updates["province"] = req.Province
	}
	if req.District != "" {
		updates["district"] = req.District
	}
	if req.Village != "" {
		updates["village"] = req.Village
	}
	if req.Latitude != "" {
		if _, err := strconv.ParseFloat(req.Latitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "latitude", "code": "invalid", "message": "Latitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
		updates["latitude"] = req.Latitude
	}
	if req.Longitude != "" {
		if _, err := strconv.ParseFloat(req.Longitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "longitude", "code": "invalid", "message": "Longitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
		updates["longitude"] = req.Longitude
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	if req.StartDate != nil {
		updates["start_date"] = parseTimeOrNil(*req.StartDate)
	}
	if req.EndDate != nil {
		updates["end_date"] = parseTimeOrNil(*req.EndDate)
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}

	project, err := h.projectRepo.Update(c.Request.Context(), projectID, userID.(uuid.UUID), updates)
	if err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to update project", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": project})
}

// DeleteProject DELETE /api/v1/projects/:id
func (h *ProjectHandler) DeleteProject(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	if err := h.projectRepo.Delete(c.Request.Context(), projectID, userID.(uuid.UUID)); err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete project", c.Request.URL.Path))
		}
		return
	}

	c.Status(http.StatusNoContent)
}

// ArchiveProject POST /api/v1/projects/:id/archive
func (h *ProjectHandler) ArchiveProject(c *gin.Context) {
	userID, _ := c.Get("user_id")
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	if err := h.projectRepo.Archive(c.Request.Context(), projectID, userID.(uuid.UUID)); err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to archive project", c.Request.URL.Path))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "archived"}})
}

// RestoreProject POST /api/v1/projects/:id/restore
func (h *ProjectHandler) RestoreProject(c *gin.Context) {
	userID, _ := c.Get("user_id")
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	if err := h.projectRepo.Restore(c.Request.Context(), projectID, userID.(uuid.UUID)); err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to restore project", c.Request.URL.Path))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"status": "planning"}})
}

// DuplicateProject POST /api/v1/projects/:id/duplicate
func (h *ProjectHandler) DuplicateProject(c *gin.Context) {
	userID, _ := c.Get("user_id")
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	project, err := h.projectRepo.GetByIDForUser(c.Request.Context(), projectID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get project", c.Request.URL.Path))
		}
		return
	}

	dup := &model.Project{
		ID:             uuid.New(),
		OwnerID:        userID.(uuid.UUID),
		ProjectCode:    project.ProjectCode + "-COPY",
		ProjectName:    project.ProjectName + " (Salinan)",
		ClientName:     project.ClientName,
		ContractorName: project.ContractorName,
		Location:       project.Location,
		Province:       project.Province,
		District:       project.District,
		Village:        project.Village,
		Latitude:       project.Latitude,
		Longitude:      project.Longitude,
		Description:    project.Description,
		StartDate:      nil,
		EndDate:        nil,
		Status:         "planning",
		CreatedAt:      nowUTC(),
		UpdatedAt:      nowUTC(),
	}

	if err := h.projectRepo.Create(c.Request.Context(), dup); err != nil {
		if err == repository.ErrProjectCodeExists {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Project code already exists", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to duplicate project", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": dup})
}

// Well Handlers

// ListWells GET /api/v1/projects/:id/wells
func (h *WellHandler) ListWells(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 {
			if v > 100 {
				v = 100
			}
			pageSize = v
		}
	}

	sortBy := c.DefaultQuery("sort_by", "well_code")
	sortDir := c.DefaultQuery("sort_dir", "asc")
	statusFilter := c.Query("filter[status]")
	typeFilter := c.Query("filter[well_type]")
	search := c.Query("filter[well_code][contains]")
	if search == "" {
		search = c.Query("search")
	}

	wells, total, err := h.wellRepo.ListForProject(c.Request.Context(), projectID, userID.(uuid.UUID), page, pageSize, sortBy, sortDir, statusFilter, typeFilter, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to list wells", c.Request.URL.Path))
		return
	}

	totalPages := (total + pageSize - 1) / pageSize
	c.JSON(http.StatusOK, gin.H{
		"data": wells,
		"meta": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// GetWell GET /api/v1/wells/:id
func (h *WellHandler) GetWell(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	well, err := h.wellRepo.GetByIDForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrWellNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Well not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get well", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": well})
}

// CreateWell POST /api/v1/projects/:id/wells
func (h *WellHandler) CreateWell(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}

	// Verify project ownership first
	_, err = h.projectRepo.GetByIDForUser(c.Request.Context(), projectID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrProjectNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Project not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to verify project", c.Request.URL.Path))
		}
		return
	}

	var req model.WellCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	if req.Latitude != "" {
		if _, err := strconv.ParseFloat(req.Latitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "latitude", "code": "invalid", "message": "Latitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
	}
	if req.Longitude != "" {
		if _, err := strconv.ParseFloat(req.Longitude, 64); err != nil {
			c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
				{"field": "longitude", "code": "invalid", "message": "Longitude harus berupa angka"},
			}, c.Request.URL.Path))
			return
		}
	}

	well := &model.Well{
		ID:             uuid.New(),
		ProjectID:      projectID,
		WellCode:       req.WellCode,
		WellName:       req.WellName,
		WellType:       req.WellType,
		Location:       &req.Location,
		Latitude:       &req.Latitude,
		Longitude:      &req.Longitude,
		PlannedDepth:   req.PlannedDepth,
		ActualDepth:    req.ActualDepth,
		DrillingDate:   parseTimeOrNilPtr(req.DrillingDate),
		CompletionDate: parseTimeOrNilPtr(req.CompletionDate),
		Status:         req.Status,
		Description:    &req.Description,
		CreatedAt:      nowUTC(),
		UpdatedAt:      nowUTC(),
	}

	if err := h.wellRepo.Create(c.Request.Context(), userID.(uuid.UUID), well); err != nil {
		if err == repository.ErrWellCodeExists {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Well code already exists in this project", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to create well", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": well})
}

// UpdateWell PUT /api/v1/wells/:id
func (h *WellHandler) UpdateWell(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	var req model.WellUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	updates := make(map[string]any)
	if req.WellCode != nil {
		updates["well_code"] = *req.WellCode
	}
	if req.WellName != nil {
		updates["well_name"] = *req.WellName
	}
	if req.WellType != nil {
		updates["well_type"] = *req.WellType
	}
	if req.Location != nil {
		updates["location"] = *req.Location
	}
	if req.Latitude != nil {
		updates["latitude"] = *req.Latitude
	}
	if req.Longitude != nil {
		updates["longitude"] = *req.Longitude
	}
	if req.PlannedDepth != nil {
		updates["planned_depth"] = *req.PlannedDepth
	}
	if req.ActualDepth != nil {
		updates["actual_depth"] = *req.ActualDepth
	}
	if req.DrillingDate != nil {
		updates["drilling_date"] = parseTimeOrNil(*req.DrillingDate)
	}
	if req.CompletionDate != nil {
		updates["completion_date"] = parseTimeOrNil(*req.CompletionDate)
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}

	well, err := h.wellRepo.Update(c.Request.Context(), wellID, userID.(uuid.UUID), updates)
	if err != nil {
		if err == repository.ErrWellNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Well not found", c.Request.URL.Path))
		} else if err == repository.ErrWellCodeExists {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Well code already exists in this project", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to update well", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": well})
}

// DeleteWell DELETE /api/v1/wells/:id
func (h *WellHandler) DeleteWell(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	if err := h.wellRepo.Delete(c.Request.Context(), wellID, userID.(uuid.UUID)); err != nil {
		if err == repository.ErrWellNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Well not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete well", c.Request.URL.Path))
		}
		return
	}

	c.Status(http.StatusNoContent)
}

// --- Project Assignment Handlers (Admin) ---

type AssignmentListItem struct {
	ID         uuid.UUID `json:"id"`
	ProjectID  uuid.UUID `json:"project_id"`
	UserID     uuid.UUID `json:"user_id"`
	Permission string    `json:"permission"`
	CreatedAt  string    `json:"created_at"`
}

func (h *ProjectHandler) ListAssignments(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	assignments, err := h.assignmentRepo.ListByProject(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to list assignments", c.Request.URL.Path))
		return
	}
	items := make([]AssignmentListItem, 0, len(assignments))
	for _, a := range assignments {
		items = append(items, AssignmentListItem{
			ID:         a.ID,
			ProjectID:  a.ProjectID,
			UserID:     a.UserID,
			Permission: a.Permission,
			CreatedAt:  a.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

type CreateAssignmentRequest struct {
	UserID     uuid.UUID `json:"user_id" binding:"required"`
	Permission string    `json:"permission" binding:"required"`
}

func (h *ProjectHandler) CreateAssignment(c *gin.Context) {
	adminID, _ := c.Get("user_id")
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	var req CreateAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, errorResponse("validation-failed", "Validation Failed", 422, "Invalid request body", c.Request.URL.Path))
		return
	}
	if req.Permission != "view" && req.Permission != "edit" {
		c.JSON(http.StatusUnprocessableEntity, errorResponse("validation-failed", "Validation Failed", 422, "Permission must be view or edit", c.Request.URL.Path))
		return
	}
	var assignedBy *uuid.UUID
	if id, ok := adminID.(uuid.UUID); ok {
		assignedBy = &id
	}
	a := &repository.ProjectAssignment{
		ID:         uuid.New(),
		ProjectID:  projectID,
		UserID:     req.UserID,
		Permission: req.Permission,
		AssignedBy: assignedBy,
	}
	if err := h.assignmentRepo.Create(c.Request.Context(), a); err != nil {
		if err == repository.ErrAssignmentExists {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Assignment already exists", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to create assignment", c.Request.URL.Path))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": a})
}

type UpdateAssignmentRequest struct {
	Permission string `json:"permission" binding:"required"`
}

func (h *ProjectHandler) UpdateAssignment(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid user ID", c.Request.URL.Path))
		return
	}
	var req UpdateAssignmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, errorResponse("validation-failed", "Validation Failed", 422, "Invalid request body", c.Request.URL.Path))
		return
	}
	if req.Permission != "view" && req.Permission != "edit" {
		c.JSON(http.StatusUnprocessableEntity, errorResponse("validation-failed", "Validation Failed", 422, "Permission must be view or edit", c.Request.URL.Path))
		return
	}
	if err := h.assignmentRepo.UpdatePermission(c.Request.Context(), projectID, userID, req.Permission); err != nil {
		if err == repository.ErrAssignmentNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Assignment not found", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to update assignment", c.Request.URL.Path))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"project_id": projectID, "user_id": userID, "permission": req.Permission}})
}

func (h *ProjectHandler) DeleteAssignment(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid project ID", c.Request.URL.Path))
		return
	}
	userID, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid user ID", c.Request.URL.Path))
		return
	}
	if err := h.assignmentRepo.Delete(c.Request.Context(), projectID, userID); err != nil {
		if err == repository.ErrAssignmentNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Assignment not found", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete assignment", c.Request.URL.Path))
		return
	}
	c.Status(http.StatusNoContent)
}

func parseTimeOrNilPtr(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	return parseTimeOrNil(*s)
}

func nowUTC() time.Time {
	return time.Now().UTC()
}
