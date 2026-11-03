package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/logger"
	"github.com/pressly/goose/v3"
	_ "github.com/jackc/pgx/v5/stdlib"
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

	dir := flag.String("dir", "migrations", "migrations directory")
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		printUsage()
		os.Exit(1)
	}

	command := args[0]

	migrationURL := cfg.MigrationDatabaseURL
	if migrationURL == "" {
		migrationURL = cfg.DatabaseURL
	}

	db, err := goose.OpenDBWithDriver("pgx", migrationURL)
	if err != nil {
		logger.Fatal("failed to open database", logger.Field("error", err))
	}
	defer db.Close()

	goose.SetBaseFS(nil)

	if err := goose.SetDialect("postgres"); err != nil {
		logger.Fatal("failed to set dialect", logger.Field("error", err))
	}

	switch command {
	case "up":
		if err := goose.Up(db, *dir); err != nil {
			logger.Fatal("migration up failed", logger.Field("error", err))
		}
		logger.Info("migrations applied successfully")

	case "down":
		if err := goose.Down(db, *dir); err != nil {
			logger.Fatal("migration down failed", logger.Field("error", err))
		}
		logger.Info("migration rolled back successfully")

	case "status":
		if err := goose.Status(db, *dir); err != nil {
			logger.Fatal("migration status failed", logger.Field("error", err))
		}

	case "version":
		v, err := goose.GetDBVersion(db)
		if err != nil {
			logger.Fatal("failed to get version", logger.Field("error", err))
		}
		fmt.Printf("Current migration version: %d\n", v)

	case "create":
		if len(args) < 2 {
			fmt.Println("Usage: migrate create <name>")
			os.Exit(1)
		}
		name := args[1]
		if err := goose.Create(db, *dir, name, "sql"); err != nil {
			logger.Fatal("failed to create migration", logger.Field("error", err))
		}
		logger.Info("migration created", logger.Field("name", name))

	default:
		fmt.Printf("Unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Usage: migrate <command> [args]")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  up           Apply all pending migrations")
	fmt.Println("  down         Roll back the last migration")
	fmt.Println("  status       Show migration status")
	fmt.Println("  version      Show current migration version")
	fmt.Println("  create <name> Create a new migration file")
	fmt.Println()
	fmt.Println("Flags:")
	fmt.Println("  -dir string  Migrations directory (default: migrations)")
}