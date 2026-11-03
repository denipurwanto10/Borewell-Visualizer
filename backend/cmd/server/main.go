package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/handler"
	"github.com/borewell/visualizer/backend/internal/logger"
	"github.com/borewell/visualizer/backend/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("failed to load configuration", logger.Field("error", err))
	}

	_, err = logger.Init(cfg.LogLevel)
	if err != nil {
		logger.Fatal("failed to initialize logger", logger.Field("error", err))
	}
	defer logger.Sync()

	logger.Info("starting borewell visualizer backend",
		logger.Field("env", cfg.AppEnv),
		logger.Field("port", cfg.AppPort),
	)

	db, err := database.New(cfg)
	if err != nil {
		logger.Fatal("failed to connect to database", logger.Field("error", err))
	}
	defer db.Close()

	h := handler.New(db, cfg)
	r := router.New(cfg, h)

	srv := &http.Server{
		Addr:         ":" + cfg.AppPort,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("server listening", logger.Field("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server error", logger.Field("error", err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("server forced to shutdown", logger.Field("error", err))
	}

	logger.Info("server exited gracefully")
}