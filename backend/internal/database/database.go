package database

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/logger"
)

type DB struct {
	Pool *pgxpool.Pool
}

func New(cfg *config.Config) (*DB, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	poolConfig.MaxConns = cfg.DatabaseMaxConns
	poolConfig.MinConns = cfg.DatabaseMinConns

	maxLifetime, err := time.ParseDuration(cfg.DatabaseMaxLifetime)
	if err != nil {
		return nil, fmt.Errorf("parse max lifetime: %w", err)
	}
	poolConfig.MaxConnLifetime = maxLifetime

	maxIdleTime, err := time.ParseDuration(cfg.DatabaseMaxIdleTime)
	if err != nil {
		return nil, fmt.Errorf("parse max idle time: %w", err)
	}
	poolConfig.MaxConnIdleTime = maxIdleTime

	poolConfig.HealthCheckPeriod = 1 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	logger.Info("database connection pool established",
		logger.Field("max_conns", cfg.DatabaseMaxConns),
		logger.Field("min_conns", cfg.DatabaseMinConns),
	)

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	db.Pool.Close()
	logger.Info("database connection pool closed")
}

func (db *DB) Ping(ctx context.Context) error {
	return db.Pool.Ping(ctx)
}

func (db *DB) BeginTx(ctx context.Context) (Tx, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return &pgxTx{tx: tx}, nil
}

// WithUserTx runs fn in a transaction with SET LOCAL app.current_user_id set to userID,
// so RLS policies are evaluated as that user.
func (db *DB) WithUserTx(ctx context.Context, userID uuid.UUID, fn func(ctx context.Context, tx Tx) error) error {
	tx, err := db.BeginTx(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+userID.String()+"'"); err != nil {
		tx.Rollback(ctx)
		return err
	}
	if err := fn(ctx, tx); err != nil {
		tx.Rollback(ctx)
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

// ServiceUserID is the reserved UUID used for service-mode operations (e.g. test cleanup,
// session lookup by token_hash). It does not correspond to any real user and is never
// settable via HTTP request. With fail-closed RLS, this context only permits access to
// tables that have a service-mode exception (currently refresh_sessions); all user-owned
// tables remain inaccessible (0 rows).
const ServiceUserID = "00000000-0000-0000-0000-000000000000"

// WithServiceTx runs fn in a transaction with SET LOCAL app.current_user_id set to the
// service UUID, activating service-mode RLS exceptions. Use only for internal operations
// that require service-level access (e.g. test cleanup). Never expose via HTTP.
func (db *DB) WithServiceTx(ctx context.Context, fn func(ctx context.Context, tx Tx) error) error {
	tx, err := db.BeginTx(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+ServiceUserID+"'"); err != nil {
		tx.Rollback(ctx)
		return err
	}
	if err := fn(ctx, tx); err != nil {
		tx.Rollback(ctx)
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

type Tx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

type pgxTx struct {
	tx pgx.Tx
}

func (t *pgxTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return t.tx.Exec(ctx, sql, args...)
}

func (t *pgxTx) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return t.tx.Query(ctx, sql, args...)
}

func (t *pgxTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return t.tx.QueryRow(ctx, sql, args...)
}

func (t *pgxTx) Commit(ctx context.Context) error {
	return t.tx.Commit(ctx)
}

func (t *pgxTx) Rollback(ctx context.Context) error {
	return t.tx.Rollback(ctx)
}