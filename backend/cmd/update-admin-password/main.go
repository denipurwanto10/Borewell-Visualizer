package main

import (
	"context"
	"flag"
	"fmt"
	"os"

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

	oldEmail := flag.String("old-email", "", "current admin email")
	newEmail := flag.String("new-email", "", "new admin email (optional, defaults to old-email)")
	password := flag.String("password", "", "new password (if not provided, will prompt securely)")
	flag.Parse()

	if *oldEmail == "" {
		fmt.Println("Usage: update-admin-password --old-email <email> [--new-email <email>] [--password <password>]")
		fmt.Println("If --password is omitted, you will be prompted to enter it securely.")
		os.Exit(1)
	}

	if *newEmail == "" {
		*newEmail = *oldEmail
	}

	var pwd string
	if *password != "" {
		pwd = *password
		fmt.Println("WARNING: Password provided via command line argument. This is insecure and should only be used for development.")
	} else {
		fmt.Print("Enter new admin password: ")
		bytePassword, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err != nil {
			logger.Fatal("failed to read password", logger.Field("error", err))
		}
		pwd = string(bytePassword)

		fmt.Print("Confirm new admin password: ")
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

	// Get user by old email
	user, err := userRepo.GetByEmail(ctx, *oldEmail)
	if err != nil {
		if err == repository.ErrUserNotFound {
			logger.Fatal("user not found", logger.Field("email", *oldEmail))
		}
		logger.Fatal("failed to get user", logger.Field("error", err))
	}

	fmt.Printf("Found user: ID=%s, Email=%s, Role=%s, Status=%s\n", user.ID, user.Email, user.Role, user.Status)

	// Check if new email is unique (if changing email)
	if *newEmail != *oldEmail {
		existing, err := userRepo.GetByEmail(ctx, *newEmail)
		if err == nil && existing != nil {
			logger.Fatal("new email already exists", logger.Field("email", *newEmail))
		}
		if err != nil && err != repository.ErrUserNotFound {
			logger.Fatal("failed to check email uniqueness", logger.Field("error", err))
		}
	}

	// Verify current params
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

	// Hash new password
	passwordHash, err := auth.HashPassword(pwd, params)
	if err != nil {
		logger.Fatal("failed to hash password", logger.Field("error", err))
	}

	// Update email and password in a transaction
	tx, err := db.BeginTx(ctx)
	if err != nil {
		logger.Fatal("failed to begin transaction", logger.Field("error", err))
	}

	// Update email and password
	query := `UPDATE users SET email = $1, password_hash = $2, updated_at = now() WHERE id = $3`
	result, err := tx.Exec(ctx, query, *newEmail, passwordHash, user.ID)
	if err != nil {
		tx.Rollback(ctx)
		logger.Fatal("failed to update user", logger.Field("error", err))
	}
	if result.RowsAffected() == 0 {
		tx.Rollback(ctx)
		logger.Fatal("user not found during update")
	}

	if err := tx.Commit(ctx); err != nil {
		logger.Fatal("failed to commit transaction", logger.Field("error", err))
	}

	logger.Info("admin account updated successfully",
		logger.Field("user_id", user.ID),
		logger.Field("old_email", *oldEmail),
		logger.Field("new_email", *newEmail),
		logger.Field("role", user.Role),
		logger.Field("status", user.Status),
	)
}