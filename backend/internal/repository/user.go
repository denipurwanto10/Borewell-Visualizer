package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/borewell/visualizer/backend/internal/database"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrEmailExists       = errors.New("email already exists")
	ErrInvalidUserStatus = errors.New("invalid user status")
)

type User struct {
	ID             uuid.UUID
	Email          string
	PasswordHash   string
	FullName       string
	Role           string
	Status         string
	ApprovedAt     *time.Time
	ApprovedBy     *uuid.UUID
	RejectionReason *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type UserRepo struct {
	db *database.DB
}

func NewUserRepo(db *database.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) GetDB() *database.DB {
	return r.db
}

func (r *UserRepo) Create(ctx context.Context, user *User) error {
	query := `
		INSERT INTO users (id, email, password_hash, full_name, role, status, approved_at, approved_by, rejection_reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.Pool.Exec(ctx, query,
		user.ID, user.Email, user.PasswordHash,
		user.FullName, user.Role, user.Status,
		user.ApprovedAt, user.ApprovedBy, user.RejectionReason,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrEmailExists
		}
		return err
	}
	return nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, status, approved_at, approved_by, rejection_reason, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	user := &User{}
	err := r.db.Pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.FullName, &user.Role, &user.Status,
		&user.ApprovedAt, &user.ApprovedBy, &user.RejectionReason,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return user, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, status, approved_at, approved_by, rejection_reason, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	user := &User{}
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.FullName, &user.Role, &user.Status,
		&user.ApprovedAt, &user.ApprovedBy, &user.RejectionReason,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return user, nil
}

func (r *UserRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, approvedBy *uuid.UUID, rejectionReason *string) error {
	query := `
		UPDATE users
		SET status = $1, approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
		    approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
		    rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END,
		    updated_at = now()
		WHERE id = $4
	`
	result, err := r.db.Pool.Exec(ctx, query, status, approvedBy, rejectionReason, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepo) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	query := `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`
	result, err := r.db.Pool.Exec(ctx, query, passwordHash, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepo) ListPending(ctx context.Context, page, pageSize int) ([]User, int, error) {
	offset := (page - 1) * pageSize

	countQuery := `SELECT COUNT(*) FROM users WHERE status = 'pending'`
	var total int
	if err := r.db.Pool.QueryRow(ctx, countQuery).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT id, email, password_hash, full_name, role, status, approved_at, approved_by, rejection_reason, created_at, updated_at
		FROM users
		WHERE status = 'pending'
		ORDER BY created_at ASC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.db.Pool.Query(ctx, query, pageSize, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.ID, &user.Email, &user.PasswordHash,
			&user.FullName, &user.Role, &user.Status,
			&user.ApprovedAt, &user.ApprovedBy, &user.RejectionReason,
			&user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		users = append(users, user)
	}
	return users, total, rows.Err()
}

func (r *UserRepo) ListAll(ctx context.Context, status, role string, page, pageSize int) ([]User, int, error) {
	offset := (page - 1) * pageSize

	whereClause := "WHERE 1=1"
	args := []any{}
	argIndex := 1

	if status != "" {
		whereClause += " AND status = $" + string(rune(argIndex+'0'))
		args = append(args, status)
		argIndex++
	}
	if role != "" {
		whereClause += " AND role = $" + string(rune(argIndex+'0'))
		args = append(args, role)
		argIndex++
	}

	countQuery := "SELECT COUNT(*) FROM users " + whereClause
	var total int
	if err := r.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT id, email, password_hash, full_name, role, status, approved_at, approved_by, rejection_reason, created_at, updated_at
		FROM users
	` + whereClause + `
		ORDER BY created_at DESC
		LIMIT $` + string(rune(argIndex+'0')) + ` OFFSET $` + string(rune(argIndex+1+'0'))
	args = append(args, pageSize, offset)

	rows, err := r.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.ID, &user.Email, &user.PasswordHash,
			&user.FullName, &user.Role, &user.Status,
			&user.ApprovedAt, &user.ApprovedBy, &user.RejectionReason,
			&user.CreatedAt, &user.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		users = append(users, user)
	}
	return users, total, rows.Err()
}

func (r *UserRepo) ExistsAdmin(ctx context.Context) (bool, error) {
	var exists bool
	err := r.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND status = 'approved')`).Scan(&exists)
	return exists, err
}