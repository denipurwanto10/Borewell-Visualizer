package router

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/handler"
	"github.com/borewell/visualizer/backend/internal/middleware"
	"github.com/borewell/visualizer/backend/internal/middleware/auth"
)

func New(cfg *config.Config, h *handler.Handler) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()

	r.Use(middleware.RequestID())
	r.Use(middleware.StructuredLogger())
	r.Use(middleware.Recovery())
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(middleware.BodySizeLimit(30 << 20))
	r.Use(middleware.SecurityHeaders())

	r.NoRoute(func(c *gin.Context) {
		c.JSON(404, gin.H{
			"type":   "https://example.com/errors/not-found",
			"title":  "Not Found",
			"status": 404,
			"detail": "Route not found",
			"instance": c.Request.URL.Path,
		})
	})

	r.NoMethod(func(c *gin.Context) {
		c.JSON(405, gin.H{
			"type":   "https://example.com/errors/method-not-allowed",
			"title":  "Method Not Allowed",
			"status": 405,
			"detail": "Method not allowed for this route",
			"instance": c.Request.URL.Path,
		})
	})

	api := r.Group("/api/v1")
	{
		api.GET("/health", h.Health)
		api.GET("/ready", h.Ready)

		authRoutes := api.Group("/auth")
		{
			// Public self-registration is disabled; accounts are created by admins.
			authRoutes.POST("/login", h.AuthHandler().Login)
			authRoutes.GET("/me", auth.AuthMiddleware(cfg), h.AuthHandler().Me)

			cookieAuth := authRoutes.Group("")
			cookieAuth.Use(middleware.Protect())
			{
				cookieAuth.POST("/logout", h.AuthHandler().Logout)
				cookieAuth.POST("/refresh", h.AuthHandler().Refresh)
			}
		}

		adminRoutes := api.Group("/admin")
		adminRoutes.Use(auth.AuthMiddleware(cfg))
		adminRoutes.Use(auth.RequireAdmin())
		{
			adminRoutes.GET("/users/pending", h.AdminHandler().ListPending)
			adminRoutes.GET("/users", h.AdminHandler().ListAll)
			adminRoutes.POST("/users", h.AdminHandler().CreateUser)
			adminRoutes.POST("/users/:id/approve", h.AdminHandler().Approve)
			adminRoutes.POST("/users/:id/reject", h.AdminHandler().Reject)
			adminRoutes.POST("/users/:id/suspend", h.AdminHandler().Suspend)
			adminRoutes.POST("/users/:id/unsuspend", h.AdminHandler().Unsuspend)

			adminRoutes.GET("/projects/:id/assignments", h.ProjectHandler().ListAssignments)
			adminRoutes.POST("/projects/:id/assignments", h.ProjectHandler().CreateAssignment)
			adminRoutes.PUT("/projects/:id/assignments/:userId", h.ProjectHandler().UpdateAssignment)
			adminRoutes.DELETE("/projects/:id/assignments/:userId", h.ProjectHandler().DeleteAssignment)
		}

		// Project Management API (FS3)
		projectRoutes := api.Group("/projects")
		projectRoutes.Use(auth.AuthMiddleware(cfg))
		{
			projectRoutes.GET("", h.ProjectHandler().ListProjects)
			projectRoutes.POST("", h.ProjectHandler().CreateProject)
			projectRoutes.GET("/:id", h.ProjectHandler().GetProject)
			projectRoutes.PUT("/:id", h.ProjectHandler().UpdateProject)
			projectRoutes.DELETE("/:id", h.ProjectHandler().DeleteProject)
			projectRoutes.POST("/:id/archive", h.ProjectHandler().ArchiveProject)
			projectRoutes.POST("/:id/restore", h.ProjectHandler().RestoreProject)
			projectRoutes.POST("/:id/duplicate", h.ProjectHandler().DuplicateProject)
		}

		// Well Management API (FS3)
		wellRoutes := api.Group("/projects/:id/wells")
		wellRoutes.Use(auth.AuthMiddleware(cfg))
		{
			wellRoutes.GET("", h.WellHandler().ListWells)
			wellRoutes.POST("", h.WellHandler().CreateWell)
		}

		wellByIDRoutes := api.Group("/wells/:id")
		wellByIDRoutes.Use(auth.AuthMiddleware(cfg))
		{
			wellByIDRoutes.GET("", h.WellHandler().GetWell)
			wellByIDRoutes.PUT("", h.WellHandler().UpdateWell)
			wellByIDRoutes.DELETE("", h.WellHandler().DeleteWell)
		}

		// Designer API (FS3)
		designerRoutes := api.Group("/wells/:id/designer")
		designerRoutes.Use(auth.AuthMiddleware(cfg))
		{
			designerRoutes.GET("", h.ModuleHandler().GetDesigner)
			designerRoutes.PUT("", h.ModuleHandler().UpsertDesigner)
			designerRoutes.DELETE("", h.ModuleHandler().DeleteDesigner)
		}

		// Geology API (FS3)
		geologyRoutes := api.Group("/wells/:id/geology")
		geologyRoutes.Use(auth.AuthMiddleware(cfg))
		{
			geologyRoutes.GET("", h.ModuleHandler().GetGeology)
			geologyRoutes.PUT("", h.ModuleHandler().UpsertGeology)
			geologyRoutes.DELETE("", h.ModuleHandler().DeleteGeology)
		}

		// Monitoring API (FS3)
		monitoringRoutes := api.Group("/wells/:id/monitoring")
		monitoringRoutes.Use(auth.AuthMiddleware(cfg))
		{
			monitoringRoutes.GET("", h.ModuleHandler().GetMonitoring)
			monitoringRoutes.PUT("", h.ModuleHandler().UpsertMonitoring)
			monitoringRoutes.DELETE("", h.ModuleHandler().DeleteMonitoring)
		}

		// Documentation API (FS4.2) — Photos
		photoRoutes := api.Group("")
		photoRoutes.Use(auth.AuthMiddleware(cfg))
		{
			photoRoutes.GET("/wells/:id/photos", h.DocumentationHandler().ListPhotos)
			photoRoutes.GET("/projects/:id/photos", h.DocumentationHandler().ListPhotos)
			photoRoutes.POST("/wells/:id/photos", h.DocumentationHandler().UploadPhoto)
			photoRoutes.POST("/projects/:id/photos", h.DocumentationHandler().UploadPhoto)
			photoRoutes.GET("/photos/:id", h.DocumentationHandler().GetPhoto)
			photoRoutes.PATCH("/photos/:id", h.DocumentationHandler().UpdatePhoto)
			photoRoutes.DELETE("/photos/:id", h.DocumentationHandler().DeletePhoto)
		}

		// Documentation API (FS4.2) — Documents
		docRoutes := api.Group("")
		docRoutes.Use(auth.AuthMiddleware(cfg))
		{
			docRoutes.GET("/wells/:id/documents", h.DocumentationHandler().ListDocuments)
			docRoutes.GET("/projects/:id/documents", h.DocumentationHandler().ListDocuments)
			docRoutes.POST("/wells/:id/documents", h.DocumentationHandler().UploadDocument)
			docRoutes.POST("/projects/:id/documents", h.DocumentationHandler().UploadDocument)
			docRoutes.GET("/documents/:id", h.DocumentationHandler().GetDocument)
			docRoutes.PATCH("/documents/:id", h.DocumentationHandler().UpdateDocument)
			docRoutes.DELETE("/documents/:id", h.DocumentationHandler().DeleteDocument)
		}

		// File download API (FS4.2)
		fileRoutes := api.Group("")
		fileRoutes.Use(auth.AuthMiddleware(cfg))
		{
			fileRoutes.GET("/files/:id", h.DocumentationHandler().DownloadFile)
		}

		// Backup API (FS4.2)
		backupRoutes := api.Group("/backup")
		backupRoutes.Use(auth.AuthMiddleware(cfg))
		{
			backupRoutes.GET("", h.BackupHandler().CreateBackup)
			backupRoutes.POST("/restore", h.BackupHandler().RestoreBackup)
		}

		// Migration API (FS4.3)
		migrationRoutes := api.Group("/migration")
		migrationRoutes.Use(auth.AuthMiddleware(cfg))
		{
			migrationRoutes.POST("/preview", h.MigrationHandler().PreviewMigration)
			migrationRoutes.POST("/import", h.MigrationHandler().ImportMigration)
		}
	}

	return r
}
