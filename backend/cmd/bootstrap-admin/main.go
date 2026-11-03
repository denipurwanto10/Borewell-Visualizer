package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/logger"
	"github.com/borewell/visualizer/backend/internal/repository"
	"golang.org/x/term"
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

	email := flag.String("email", "", "admin email")
	password := flag.String("password", "", "admin password (if not provided, will prompt securely)")
	fullName := flag.String("name", "Administrator", "admin full name")
	flag.Parse()

	if *email == "" {
		fmt.Println("Usage: bootstrap-admin --email <email> [--password <password>] [--name <name>]")
		fmt.Println("If --password is omitted, you will be prompted to enter it securely.")
		os.Exit(1)
	}

	var pwd string
	if *password != "" {
		pwd = *password
		fmt.Println("WARNING: Password provided via command line argument. This is insecure and should only be used for development.")
	} else {
		fmt.Print("Enter admin password: ")
		bytePassword, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err != nil {
			logger.Fatal("failed to read password", logger.Field("error", err))
		}
		pwd = string(bytePassword)

		fmt.Print("Confirm admin password: ")
		bytePasswordConfirm, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err != nil {
			logger.Fatal("failed to read password confirmation", logger.Field("error", err))
		}
		if pwd != string(bytePasswordConfirm) {
			logger.Fatal("passwords do not match")
		}
	}

	if len(pwd) < 12 {
		logger.Fatal("password must be at least 12 characters")
	}

	db, err := database.New(cfg)
	if err != nil {
		logger.Fatal("failed to connect to database", logger.Field("error", err))
	}
	defer db.Close()

	ctx := context.Background()

	userRepo := repository.NewUserRepo(db)
	exists, err := userRepo.ExistsAdmin(ctx)
	if err != nil {
		logger.Fatal("failed to check existing admin", logger.Field("error", err))
	}

	if exists {
		logger.Fatal("admin user already exists, bootstrap not allowed")
	}

	params := auth.DefaultParams()
	if cfg.Argon2Time > 0 {
		params.Time = cfg.Argon2Time
	}
	if cfg.Argon2Memory > 0 {
		params.Memory = cfg.Argon2Memory
	}
	if cfg.Argon2Threads > 0 {
		params.Threads = cfg.Argon2Threads
	}
	if cfg.Argon2KeyLen > 0 {
		params.KeyLen = cfg.Argon2KeyLen
	}

	passwordHash, err := auth.HashPassword(pwd, params)
	if err != nil {
		logger.Fatal("failed to hash password", logger.Field("error", err))
	}

	approvedAt := time.Now().UTC()
	user := &repository.User{
		ID:             uuid.New(),
		Email:          *email,
		PasswordHash:   passwordHash,
		FullName:       *fullName,
		Role:           "admin",
		Status:         "approved",
		ApprovedAt:     &approvedAt,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}

	if err := userRepo.Create(ctx, user); err != nil {
		logger.Fatal("failed to create admin user", logger.Field("error", err))
	}

	logger.Info("admin user created successfully", logger.Field("email", *email))
}