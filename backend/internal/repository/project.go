package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
)

var (
	ErrProjectNotFound      = errors.New("project not found")
	ErrProjectCodeExists    = errors.New("project code already exists")
	ErrWellNotFound         = errors.New("well not found")
	ErrWellCodeExists       = errors.New("project well code already exists in project")
	ErrWellNotOwned         = errors.New("well not owned by user")
	ErrProjectNotOwned      = errors.New("project not owned by user")
)

type ProjectRepo struct {
	db *database.DB
}

func NewProjectRepo(db *database.DB) *ProjectRepo {
	return &ProjectRepo{db: db}
}

func (r *ProjectRepo) GetDB() *database.DB {
	return r.db
}

func (r *ProjectRepo) Create(ctx context.Context, p *model.Project) error {
	return r.db.WithUserTx(ctx, p.OwnerID, func(ctx context.Context, tx database.Tx) error {
		query := `
			INSERT INTO projects (id, owner_id, project_code, project_name, client_name, contractor_name,
				location, province, district, village, latitude, longitude, description,
				start_date, end_date, status, archived_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		`
		_, err := tx.Exec(ctx, query,
			p.ID, p.OwnerID, p.ProjectCode, p.ProjectName, p.ClientName, p.ContractorName,
			p.Location, p.Province, p.District, p.Village, p.Latitude, p.Longitude, p.Description,
			p.StartDate, p.EndDate, p.Status, p.ArchivedAt,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return ErrProjectCodeExists
			}
			return err
		}
		return nil
	})
}

func (r *ProjectRepo) GetByIDForUser(ctx context.Context, projectID, userID uuid.UUID) (*model.Project, error) {
	var p *model.Project
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT id, owner_id, project_code, project_name, client_name, contractor_name,
				location, province, district, village, latitude, longitude, description,
				start_date, end_date, status, created_at, updated_at, archived_at
			FROM projects
			WHERE id = $1 AND owner_id = $2
		`
		p = &model.Project{}
		err := tx.QueryRow(ctx, query, projectID, userID).Scan(
			&p.ID, &p.OwnerID, &p.ProjectCode, &p.ProjectName, &p.ClientName, &p.ContractorName,
			&p.Location, &p.Province, &p.District, &p.Village, &p.Latitude, &p.Longitude, &p.Description,
			&p.StartDate, &p.EndDate, &p.Status, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *ProjectRepo) ListForUser(ctx context.Context, userID uuid.UUID, page, pageSize int, sortBy, sortDir string, statusFilter string, search string) ([]*model.Project, int, error) {
	var projects []*model.Project
	var total int
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		offset := (page - 1) * pageSize

		where := "WHERE owner_id = $1"
		args := []any{userID}
		argIndex := 2

		if statusFilter != "" {
			where += " AND status = $" + string(rune('0'+argIndex))
			args = append(args, statusFilter)
			argIndex++
		}
		if search != "" {
			where += " AND (project_name ILIKE $" + string(rune('0'+argIndex)) + " OR project_code ILIKE $" + string(rune('0'+argIndex+1)) + " OR client_name ILIKE $" + string(rune('0'+argIndex+2)) + ")"
			args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%")
			argIndex += 3
		}

		validSort := map[string]bool{
			"created_at": true, "updated_at": true, "project_name": true,
			"project_code": true, "status": true, "start_date": true,
		}
		if !validSort[sortBy] {
			sortBy = "updated_at"
		}
		if sortDir != "asc" && sortDir != "desc" {
			sortDir = "desc"
		}

		countQuery := "SELECT COUNT(*) FROM projects " + where
		if err := tx.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
			return err
		}

		query := `
			SELECT id, owner_id, project_code, project_name, client_name, contractor_name,
				location, province, district, village, latitude, longitude, description,
				start_date, end_date, status, created_at, updated_at, archived_at,
				0 AS well_count
			FROM projects ` + where + `
			ORDER BY ` + sortBy + ` ` + sortDir + `
			LIMIT $` + string(rune('0'+argIndex)) + ` OFFSET $` + string(rune('0'+argIndex+1))
		args = append(args, pageSize, offset)

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			p := &model.Project{}
			if err := rows.Scan(
				&p.ID, &p.OwnerID, &p.ProjectCode, &p.ProjectName, &p.ClientName, &p.ContractorName,
				&p.Location, &p.Province, &p.District, &p.Village, &p.Latitude, &p.Longitude, &p.Description,
				&p.StartDate, &p.EndDate, &p.Status, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt,
				&p.WellCount,
			); err != nil {
				return err
			}
			projects = append(projects, p)
		}
		return rows.Err()
	})
	return projects, total, err
}

func (r *ProjectRepo) Update(ctx context.Context, projectID, userID uuid.UUID, updates map[string]any) (*model.Project, error) {
	var project *model.Project
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Verify ownership first
		var dummyUUID uuid.UUID
		err := tx.QueryRow(ctx, `SELECT id FROM projects WHERE id = $1 AND owner_id = $2`, projectID, userID).Scan(&dummyUUID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrProjectNotFound
			}
			return err
		}

		setParts := []string{}
		args := []any{}
		argIndex := 1
		for k, v := range updates {
			setParts = append(setParts, k+" = $"+string(rune('0'+argIndex)))
			args = append(args, v)
			argIndex++
		}
		if len(setParts) == 0 {
			got, gerr := r.GetByIDForUser(ctx, projectID, userID)
			project = got
			return gerr
		}
		setParts = append(setParts, "updated_at = now()")
		args = append(args, projectID, userID)

		query := `UPDATE projects SET ` + joinStrings(setParts, ", ") + `
			WHERE id = $` + string(rune('0'+argIndex)) + ` AND owner_id = $` + string(rune('0'+argIndex+1)) + `
			RETURNING id, owner_id, project_code, project_name, client_name, contractor_name,
				location, province, district, village, latitude, longitude, description,
				start_date, end_date, status, created_at, updated_at, archived_at`
		project = &model.Project{}
		err = tx.QueryRow(ctx, query, args...).Scan(
			&project.ID, &project.OwnerID, &project.ProjectCode, &project.ProjectName,
			&project.ClientName, &project.ContractorName, &project.Location, &project.Province,
			&project.District, &project.Village, &project.Latitude, &project.Longitude,
			&project.Description, &project.StartDate, &project.EndDate, &project.Status,
			&project.CreatedAt, &project.UpdatedAt, &project.ArchivedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return project, nil
}

func (r *ProjectRepo) Delete(ctx context.Context, projectID, userID uuid.UUID) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		result, err := tx.Exec(ctx, `DELETE FROM projects WHERE id = $1 AND owner_id = $2`, projectID, userID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrProjectNotFound
		}
		return nil
	})
}

func (r *ProjectRepo) Archive(ctx context.Context, projectID, userID uuid.UUID) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		result, err := tx.Exec(ctx, `UPDATE projects SET status = 'archived', archived_at = now(), updated_at = now() WHERE id = $1 AND owner_id = $2`, projectID, userID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrProjectNotFound
		}
		return nil
	})
}

func (r *ProjectRepo) Restore(ctx context.Context, projectID, userID uuid.UUID) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		result, err := tx.Exec(ctx, `UPDATE projects SET status = 'planning', archived_at = NULL, updated_at = now() WHERE id = $1 AND owner_id = $2`, projectID, userID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrProjectNotFound
		}
		return nil
	})
}

func joinStrings(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += sep
		}
		result += p
	}
	return result
}

func parseTimeOrNil(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02", s)
		if err != nil {
			return nil
		}
	}
	return &t
}

// CreateWithTx creates a project within an existing transaction (for migration)
func (r *ProjectRepo) CreateWithTx(ctx context.Context, tx database.Tx, p *model.Project) error {
	query := `
		INSERT INTO projects (id, owner_id, project_code, project_name, client_name, contractor_name,
			location, province, district, village, latitude, longitude, description,
			start_date, end_date, status, archived_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`
	_, err := tx.Exec(ctx, query,
		p.ID, p.OwnerID, p.ProjectCode, p.ProjectName, p.ClientName, p.ContractorName,
		p.Location, p.Province, p.District, p.Village, p.Latitude, p.Longitude, p.Description,
		p.StartDate, p.EndDate, p.Status, p.ArchivedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrProjectCodeExists
		}
		return err
	}
	return nil
}

// GetByCodeForUser returns a project by code for a specific user
func (r *ProjectRepo) GetByCodeForUser(ctx context.Context, userID uuid.UUID, projectCode string) (*model.Project, error) {
	var p *model.Project
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT id, owner_id, project_code, project_name, client_name, contractor_name,
				location, province, district, village, latitude, longitude, description,
				start_date, end_date, status, created_at, updated_at, archived_at
			FROM projects
			WHERE owner_id = $1 AND project_code = $2
		`
		p = &model.Project{}
		err := tx.QueryRow(ctx, query, userID, projectCode).Scan(
			&p.ID, &p.OwnerID, &p.ProjectCode, &p.ProjectName, &p.ClientName, &p.ContractorName,
			&p.Location, &p.Province, &p.District, &p.Village, &p.Latitude, &p.Longitude, &p.Description,
			&p.StartDate, &p.EndDate, &p.Status, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	return p, nil
}
