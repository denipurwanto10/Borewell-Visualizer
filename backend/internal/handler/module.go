package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type ModuleHandler struct {
	moduleRepo     *repository.ModuleRepo
	projectRepo    *repository.ProjectRepo
	assignmentRepo *repository.AssignmentRepo
	wellRepo       *repository.WellRepo
}

func NewModuleHandler(moduleRepo *repository.ModuleRepo, projectRepo *repository.ProjectRepo, assignmentRepo *repository.AssignmentRepo, wellRepo *repository.WellRepo) *ModuleHandler {
	return &ModuleHandler{
		moduleRepo:     moduleRepo,
		projectRepo:    projectRepo,
		assignmentRepo: assignmentRepo,
		wellRepo:       wellRepo,
	}
}

// checkEditPermission verifies the user has EDIT permission on the project containing the well.
// Returns true if allowed, false if forbidden (and writes 403 response).
func (h *ModuleHandler) checkEditPermission(ctx context.Context, userID, wellID uuid.UUID, c *gin.Context) (uuid.UUID, bool) {
	// Get well to find project ID
	well, err := h.wellRepo.GetByIDForUser(ctx, wellID, userID)
	if err != nil {
		return uuid.Nil, false
	}

	// Admin bypasses permission check
	role, _ := c.Get("user_role")
	if role == "admin" {
		return well.ProjectID, true
	}

	canEdit, err := h.assignmentRepo.CanEdit(ctx, userID, well.ProjectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to check permissions", c.Request.URL.Path))
		return uuid.Nil, false
	}
	if !canEdit {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "Forbidden", 403, "EDIT permission required", c.Request.URL.Path))
		return uuid.Nil, false
	}
	return well.ProjectID, true
}

// Designer State

// GetDesigner GET /api/v1/wells/:wellId/designer
func (h *ModuleHandler) GetDesigner(c *gin.Context) {
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

	state, err := h.moduleRepo.GetDesignerForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.JSON(http.StatusOK, gin.H{"data": gin.H{
				"well_id":   wellID,
				"version":   1,
				"components": []any{},
				"config":    gin.H{},
			}})
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get designer state", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// UpsertDesigner PUT /api/v1/wells/:wellId/designer
func (h *ModuleHandler) UpsertDesigner(c *gin.Context) {
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

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	var req model.DesignerUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	componentsJSON, err := json.Marshal(req.Components)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to serialize components", c.Request.URL.Path))
		return
	}
	configJSON, err := json.Marshal(req.Config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to serialize config", c.Request.URL.Path))
		return
	}

	var components any
	var config any
	_ = json.Unmarshal(componentsJSON, &components)
	_ = json.Unmarshal(configJSON, &config)

	state, err := h.moduleRepo.UpsertDesigner(c.Request.Context(), wellID, userID.(uuid.UUID), req.Version, components, config)
	if err != nil {
		if errors.Is(err, repository.ErrVersionConflict) {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Record was modified by another user. Please refresh and try again.", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save designer state", c.Request.URL.Path))
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// DeleteDesigner DELETE /api/v1/wells/:wellId/designer
func (h *ModuleHandler) DeleteDesigner(c *gin.Context) {
	userID, _ := c.Get("user_id")
	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	_, err = h.moduleRepo.GetDesignerForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete designer state", c.Request.URL.Path))
		return
	}

	c.Status(http.StatusNoContent)
}

// Geology Log

// GetGeology GET /api/v1/wells/:wellId/geology
func (h *ModuleHandler) GetGeology(c *gin.Context) {
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

	state, err := h.moduleRepo.GetGeologyForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.JSON(http.StatusOK, gin.H{"data": gin.H{
				"well_id": wellID,
				"version": 1,
				"layers":  []any{},
			}})
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get geology log", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// UpsertGeology PUT /api/v1/wells/:wellId/geology
func (h *ModuleHandler) UpsertGeology(c *gin.Context) {
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

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	var req model.GeologyUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	layersJSON, err := json.Marshal(req.Layers)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to serialize layers", c.Request.URL.Path))
		return
	}
	var layers any
	_ = json.Unmarshal(layersJSON, &layers)

	state, err := h.moduleRepo.UpsertGeology(c.Request.Context(), wellID, userID.(uuid.UUID), req.Version, layers)
	if err != nil {
		if errors.Is(err, repository.ErrVersionConflict) {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Record was modified by another user. Please refresh and try again.", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save geology log", c.Request.URL.Path))
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// DeleteGeology DELETE /api/v1/wells/:wellId/geology
func (h *ModuleHandler) DeleteGeology(c *gin.Context) {
	userID, _ := c.Get("user_id")
	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	_, err = h.moduleRepo.GetGeologyForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete geology log", c.Request.URL.Path))
		return
	}

	c.Status(http.StatusNoContent)
}

// Groundwater Monitoring

// GetMonitoring GET /api/v1/wells/:wellId/monitoring
func (h *ModuleHandler) GetMonitoring(c *gin.Context) {
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

	state, err := h.moduleRepo.GetMonitoringForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.JSON(http.StatusOK, gin.H{"data": gin.H{
				"well_id":      wellID,
				"version":      1,
				"measurements": []any{},
			}})
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get monitoring data", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// UpsertMonitoring PUT /api/v1/wells/:wellId/monitoring
func (h *ModuleHandler) UpsertMonitoring(c *gin.Context) {
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

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	var req model.MonitoringUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	measurementsJSON, err := json.Marshal(req.Measurements)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to serialize measurements", c.Request.URL.Path))
		return
	}
	var measurements any
	_ = json.Unmarshal(measurementsJSON, &measurements)

	state, err := h.moduleRepo.UpsertMonitoring(c.Request.Context(), wellID, userID.(uuid.UUID), req.Version, measurements)
	if err != nil {
		if errors.Is(err, repository.ErrVersionConflict) {
			c.JSON(http.StatusConflict, errorResponse("conflict", "Conflict", 409, "Record was modified by another user. Please refresh and try again.", c.Request.URL.Path))
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save monitoring data", c.Request.URL.Path))
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": state})
}

// DeleteMonitoring DELETE /api/v1/wells/:wellId/monitoring
func (h *ModuleHandler) DeleteMonitoring(c *gin.Context) {
	userID, _ := c.Get("user_id")
	wellID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid well ID", c.Request.URL.Path))
		return
	}

	// Check EDIT permission (Admin bypasses)
	if _, ok := h.checkEditPermission(c.Request.Context(), userID.(uuid.UUID), wellID, c); !ok {
		return
	}

	_, err = h.moduleRepo.GetMonitoringForUser(c.Request.Context(), wellID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrModuleNotFound {
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete monitoring data", c.Request.URL.Path))
		return
	}

	c.Status(http.StatusNoContent)
}
