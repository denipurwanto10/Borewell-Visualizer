package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/handler/admin"
	authhandler "github.com/borewell/visualizer/backend/internal/handler/auth"
	"github.com/borewell/visualizer/backend/internal/logger"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type Handler struct {
	db              *database.DB
	cfg             *config.Config
	authHandler     *authhandler.Handler
	adminHandler    *admin.Handler
	projectHandler  *ProjectHandler
	wellHandler     *WellHandler
	moduleHandler   *ModuleHandler
	docHandler      *DocumentationHandler
	backupHandler   *BackupHandler
	migrationHandler *MigrationHandler
}

func New(db *database.DB, cfg *config.Config) *Handler {
	userRepo := repository.NewUserRepo(db)
	sessionStore := auth.NewSessionStore(db)
	authHandler := authhandler.NewHandler(userRepo, sessionStore, cfg)
	adminHandler := admin.NewHandler(userRepo, sessionStore, cfg)

	projectRepo := repository.NewProjectRepo(db)
	wellRepo := repository.NewWellRepo(db)
	moduleRepo := repository.NewModuleRepo(db)
	docRepo := repository.NewDocumentationRepo(db)
	assignmentRepo := repository.NewAssignmentRepo(db)

	projectHandler := NewProjectHandler(projectRepo, wellRepo, assignmentRepo)
	wellHandler := NewWellHandler(wellRepo, projectRepo)
	moduleHandler := NewModuleHandler(moduleRepo)
	docHandler := NewDocumentationHandler(docRepo, cfg.FileStoragePath)
	backupHandler := NewBackupHandler(db, projectRepo, wellRepo, moduleRepo, docRepo)
	migrationHandler := NewMigrationHandler(db, projectRepo, wellRepo, moduleRepo, docRepo, cfg.FileStoragePath)

	return &Handler{
		db:               db,
		cfg:              cfg,
		authHandler:      authHandler,
		adminHandler:     adminHandler,
		projectHandler:   projectHandler,
		wellHandler:      wellHandler,
		moduleHandler:    moduleHandler,
		docHandler:       docHandler,
		backupHandler:    backupHandler,
		migrationHandler: migrationHandler,
	}
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "borewell-visualizer-backend",
	})
}

func (h *Handler) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if err := h.db.Ping(ctx); err != nil {
		logger.Error("readiness check failed", logger.Field("error", err))
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":    "not ready",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"service":   "borewell-visualizer-backend",
			"checks": gin.H{
				"database": "failed",
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":    "ready",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"service":   "borewell-visualizer-backend",
		"checks": gin.H{
			"database": "ok",
		},
	})
}

func (h *Handler) AuthHandler() *authhandler.Handler {
	return h.authHandler
}

func (h *Handler) AdminHandler() *admin.Handler {
	return h.adminHandler
}

func (h *Handler) ProjectHandler() *ProjectHandler {
	return h.projectHandler
}

func (h *Handler) WellHandler() *WellHandler {
	return h.wellHandler
}

func (h *Handler) ModuleHandler() *ModuleHandler {
	return h.moduleHandler
}

func (h *Handler) DocumentationHandler() *DocumentationHandler {
	return h.docHandler
}

func (h *Handler) BackupHandler() *BackupHandler {
	return h.backupHandler
}

func (h *Handler) MigrationHandler() *MigrationHandler {
	return h.migrationHandler
}

func (h *Handler) DB() *pgxpool.Pool {
	return h.db.Pool
}
