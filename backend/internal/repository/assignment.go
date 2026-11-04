package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/borewell/visualizer/backend/internal/database"
)

var (
	ErrAssignmentNotFound = errors.New("assignment not found")
	ErrAssignmentExists   = errors.New("assignment already exists")
)

type ProjectAssignment struct {
	ID         uuid.UUID
	ProjectID  uuid.UUID
	UserID     uuid.UUID
	Permission string
	AssignedBy *uuid.UUID
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type AssignmentRepo struct {
	db *database.DB
}

func NewAssignmentRepo(db *database.DB) *AssignmentRepo {
	return &AssignmentRepo{db: db}
}

func (r *AssignmentRepo) Create(ctx context.Context, a *ProjectAssignment) error {
	query := `
		INSERT INTO project_assignments (id, project_id, user_id, permission, assigned_by)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.Pool.Exec(ctx, query, a.ID, a.ProjectID, a.UserID, a.Permission, a.AssignedBy)
	if err != nil {
		var pgErr interface{ Code() string }
		_ = pgErr
		if isUniqueViolation(err) {
			return ErrAssignmentExists
		}
		return err
	}
	a.CreatedAt = time.Now().UTC()
	a.UpdatedAt = a.CreatedAt
	return nil
}

func (r *AssignmentRepo) UpdatePermission(ctx context.Context, projectID, userID uuid.UUID, permission string) error {
	result, err := r.db.Pool.Exec(ctx, `
		UPDATE project_assignments SET permission = $1, updated_at = now()
		WHERE project_id = $2 AND user_id = $3
	`, permission, projectID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrAssignmentNotFound
	}
	return nil
}

func (r *AssignmentRepo) Delete(ctx context.Context, projectID, userID uuid.UUID) error {
	result, err := r.db.Pool.Exec(ctx, `
		DELETE FROM project_assignments WHERE project_id = $1 AND user_id = $2
	`, projectID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrAssignmentNotFound
	}
	return nil
}

func (r *AssignmentRepo) GetPermission(ctx context.Context, projectID, userID uuid.UUID) (string, error) {
	var perm string
	err := r.db.Pool.QueryRow(ctx, `
		SELECT permission FROM project_assignments WHERE project_id = $1 AND user_id = $2
	`, projectID, userID).Scan(&perm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrAssignmentNotFound
		}
		return "", err
	}
	return perm, nil
}

func (r *AssignmentRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]ProjectAssignment, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, project_id, user_id, permission, assigned_by, created_at, updated_at
		FROM project_assignments
		WHERE project_id = $1
		ORDER BY created_at ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProjectAssignment
	for rows.Next() {
		var a ProjectAssignment
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.UserID, &a.Permission, &a.AssignedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *AssignmentRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]ProjectAssignment, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, project_id, user_id, permission, assigned_by, created_at, updated_at
		FROM project_assignments
		WHERE user_id = $1
		ORDER BY created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProjectAssignment
	for rows.Next() {
		var a ProjectAssignment
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.UserID, &a.Permission, &a.AssignedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// EffectivePermission returns one of: admin, edit, view, or "" (no access).
func (r *AssignmentRepo) EffectivePermission(ctx context.Context, userID, projectID uuid.UUID) (string, error) {
	var role string
	err := r.db.Pool.QueryRow(ctx, `SELECT role FROM users WHERE id = $1`, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrUserNotFound
		}
		return "", err
	}
	if role == "admin" {
		return "admin", nil
	}

	var ownerID uuid.UUID
	err = r.db.Pool.QueryRow(ctx, `SELECT owner_id FROM projects WHERE id = $1`, projectID).Scan(&ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrProjectNotFound
		}
		return "", err
	}
	if ownerID == userID {
		return "edit", nil
	}

	perm, err := r.GetPermission(ctx, projectID, userID)
	if err != nil {
		if errors.Is(err, ErrAssignmentNotFound) {
			return "", nil
		}
		return "", err
	}
	return perm, nil
}

// CanAccess reports whether the user can access the project.
func (r *AssignmentRepo) CanAccess(ctx context.Context, userID, projectID uuid.UUID) (bool, error) {
	perm, err := r.EffectivePermission(ctx, userID, projectID)
	if err != nil {
		return false, err
	}
	return perm != "", nil
}

// CanEdit reports whether the user can modify data in the project.
func (r *AssignmentRepo) CanEdit(ctx context.Context, userID, projectID uuid.UUID) (bool, error) {
	perm, err := r.EffectivePermission(ctx, userID, projectID)
	if err != nil {
		return false, err
	}
	return perm == "admin" || perm == "edit", nil
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ Code() string }
	if errors.As(err, &pgErr) {
		return pgErr.Code() == "23505"
	}
	return false
}
