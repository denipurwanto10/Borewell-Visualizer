package config

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	AppEnv               string `mapstructure:"APP_ENV"`
	AppPort              string `mapstructure:"APP_PORT"`
	DatabaseURL          string `mapstructure:"DATABASE_URL"`
	MigrationDatabaseURL string `mapstructure:"MIGRATION_DATABASE_URL"`
	DatabaseMaxConns     int32  `mapstructure:"DATABASE_MAX_CONNECTIONS"`
	DatabaseMinConns     int32  `mapstructure:"DATABASE_MIN_CONNECTIONS"`
	DatabaseMaxLifetime  string `mapstructure:"DATABASE_MAX_LIFETIME"`
	DatabaseMaxIdleTime  string `mapstructure:"DATABASE_MAX_IDLE_TIME"`
	LogLevel             string `mapstructure:"LOG_LEVEL"`
	FileStoragePath      string `mapstructure:"FILE_STORAGE_PATH"`
	JWTSecret            string `mapstructure:"JWT_SECRET"`
	RefreshTokenSecret   string `mapstructure:"REFRESH_TOKEN_SECRET"`
	Argon2Time           uint32 `mapstructure:"ARGON2_TIME"`
	Argon2Memory         uint32 `mapstructure:"ARGON2_MEMORY"`
	Argon2Threads        uint8  `mapstructure:"ARGON2_THREADS"`
	Argon2KeyLen         uint32 `mapstructure:"ARGON2_KEYLEN"`
}

func Load() (*Config, error) {
	v := viper.New()

	v.SetConfigFile(".env")
	v.SetConfigType("env")
	v.AddConfigPath(".")
	v.AddConfigPath("./backend")
	v.AddConfigPath("../")
	v.AutomaticEnv()

	v.SetDefault("APP_ENV", "development")
	v.SetDefault("APP_PORT", "8080")
	v.SetDefault("DATABASE_MAX_CONNECTIONS", 20)
	v.SetDefault("DATABASE_MIN_CONNECTIONS", 5)
	v.SetDefault("DATABASE_MAX_LIFETIME", "1h")
	v.SetDefault("DATABASE_MAX_IDLE_TIME", "30m")
	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("FILE_STORAGE_PATH", "./data/files")
	v.SetDefault("ARGON2_TIME", 3)
	v.SetDefault("ARGON2_MEMORY", 65536)
	v.SetDefault("ARGON2_THREADS", 4)
	v.SetDefault("ARGON2_KEYLEN", 32)

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	if err := validate(&cfg); err != nil {
		return nil, err
	}

	cfg.FileStoragePath = expandPath(cfg.FileStoragePath)

	return &cfg, nil
}

func validate(cfg *Config) error {
	var missing []string

	if cfg.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	if cfg.JWTSecret == "" {
		missing = append(missing, "JWT_SECRET")
	}
	if cfg.RefreshTokenSecret == "" {
		missing = append(missing, "REFRESH_TOKEN_SECRET")
	}

	if len(missing) > 0 {
		return &ValidationError{Missing: missing}
	}

	if cfg.AppEnv == "production" {
		if strings.Contains(strings.ToLower(cfg.JWTSecret), "dev") || len(cfg.JWTSecret) < 32 {
			return &ValidationError{Missing: []string{"JWT_SECRET (must be 32+ chars, no 'dev' in production)"}}
		}
		if strings.Contains(strings.ToLower(cfg.RefreshTokenSecret), "dev") || len(cfg.RefreshTokenSecret) < 32 {
			return &ValidationError{Missing: []string{"REFRESH_TOKEN_SECRET (must be 32+ chars, no 'dev' in production)"}}
		}
	}

	return nil
}

type ValidationError struct {
	Missing []string
}

func (e *ValidationError) Error() string {
	return "configuration validation failed: missing required values: " + strings.Join(e.Missing, ", ")
}

func expandPath(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[2:])
	}
	return path
}