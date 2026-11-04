package repository

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type WellRepo struct {
	db *database.DB
}

func NewWellRepo(db *database.DB) *WellRepo {
	return &WellRepo{db: db}
}

func (r *WellRepo) Create(ctx context.Context, userID uuid.UUID, w *model.Well) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Project ownership (and hence user context) is enforced by RLS on projects/wells.
		query := `
			INSERT INTO wells (id, project_id, well_code, well_name, well_type, location, latitude, longitude,
				planned_depth, actual_depth, drilling_date, completion_date, status, description)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		`
		_, err := tx.Exec(ctx, query,
			w.ID, w.ProjectID, w.WellCode, w.WellName, w.WellType, w.Location,
			w.Latitude, w.Longitude, w.PlannedDepth, w.ActualDepth, w.DrillingDate,
			w.CompletionDate, w.Status, w.Description,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return ErrWellCodeExists
			}
			return err
		}
		return nil
	})
}

func (r *WellRepo) GetByIDForUser(ctx context.Context, wellID, userID uuid.UUID) (*model.Well, error) {
	var w *model.Well
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT w.id, w.project_id, w.well_code, w.well_name, w.well_type, w.location, w.latitude, w.longitude,
				w.planned_depth, w.actual_depth, w.drilling_date, w.completion_date, w.status, w.description,
				w.created_at, w.updated_at
			FROM wells w
			JOIN projects p ON w.project_id = p.id
			WHERE w.id = $1 AND (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR p.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2)) OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2))
		`
		w = &model.Well{}
		err := tx.QueryRow(ctx, query, wellID, userID).Scan(
			&w.ID, &w.ProjectID, &w.WellCode, &w.WellName, &w.WellType, &w.Location,
			&w.Latitude, &w.Longitude, &w.PlannedDepth, &w.ActualDepth, &w.DrillingDate,
			&w.CompletionDate, &w.Status, &w.Description, &w.CreatedAt, &w.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWellNotFound
		}
		return nil, err
	}
	return w, nil
}

func (r *WellRepo) ListForProject(ctx context.Context, projectID, userID uuid.UUID, page, pageSize int, sortBy, sortDir string, statusFilter string, typeFilter string, search string) ([]*model.Well, int, error) {
	var wells []*model.Well
	var total int
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		offset := (page - 1) * pageSize

		where := "WHERE w.project_id = $1 AND (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR p.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2)) OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2))"
		args := []any{projectID, userID}
		argIndex := 3

		if statusFilter != "" {
			where += " AND w.status = $" + strconv.Itoa(argIndex)
			args = append(args, statusFilter)
			argIndex++
		}
		if typeFilter != "" {
			where += " AND w.well_type = $" + strconv.Itoa(argIndex)
			args = append(args, typeFilter)
			argIndex++
		}
		if search != "" {
			where += " AND (w.well_name ILIKE $" + strconv.Itoa(argIndex) + " OR w.well_code ILIKE $" + strconv.Itoa(argIndex+1) + ")"
			args = append(args, "%"+search+"%", "%"+search+"%")
			argIndex += 2
		}

		validSort := map[string]bool{"well_code": true, "well_name": true, "status": true, "well_type": true, "planned_depth": true, "drilling_date": true, "updated_at": true}
		if !validSort[sortBy] {
			sortBy = "well_code"
		}
		if sortDir != "asc" && sortDir != "desc" {
			sortDir = "asc"
		}

		countQuery := "SELECT COUNT(*) FROM wells w JOIN projects p ON w.project_id = p.id " + where
		if err := tx.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
			return err
		}

		query := `
			SELECT w.id, w.project_id, w.well_code, w.well_name, w.well_type, w.location, w.latitude, w.longitude,
				w.planned_depth, w.actual_depth, w.drilling_date, w.completion_date, w.status, w.description,
				w.created_at, w.updated_at
			FROM wells w
			JOIN projects p ON w.project_id = p.id ` + where + `
			ORDER BY w.` + sortBy + ` ` + sortDir + `
			LIMIT $` + strconv.Itoa(argIndex) + ` OFFSET $` + strconv.Itoa(argIndex+1)
		args = append(args, pageSize, offset)

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			w := &model.Well{}
			if err := rows.Scan(
				&w.ID, &w.ProjectID, &w.WellCode, &w.WellName, &w.WellType, &w.Location,
				&w.Latitude, &w.Longitude, &w.PlannedDepth, &w.ActualDepth, &w.DrillingDate,
				&w.CompletionDate, &w.Status, &w.Description, &w.CreatedAt, &w.UpdatedAt,
			); err != nil {
				return err
			}
			wells = append(wells, w)
		}
		return rows.Err()
	})
	return wells, total, err
}

func (r *WellRepo) Update(ctx context.Context, wellID, userID uuid.UUID, updates map[string]any) (*model.Well, error) {
	var w *model.Well
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Verify ownership via project
		err := tx.QueryRow(ctx, `
			SELECT w.id FROM wells w JOIN projects p ON w.project_id = p.id
			WHERE w.id = $1 AND (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR p.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2)) OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $2))
		`, wellID, userID).Scan(new(uuid.UUID))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrWellNotFound
			}
			return err
		}

		setParts := []string{}
		args := []any{}
		argIndex := 1
		for k, v := range updates {
			setParts = append(setParts, k+" = $"+strconv.Itoa(argIndex))
			args = append(args, v)
			argIndex++
		}
		if len(setParts) == 0 {
			got, gerr := r.GetByIDForUser(ctx, wellID, userID)
			w = got
			return gerr
		}
		setParts = append(setParts, "updated_at = now()")
		args = append(args, wellID)

		query := `UPDATE wells SET ` + joinStrings(setParts, ", ") + `
			WHERE id = $` + strconv.Itoa(argIndex) + `
			RETURNING id, project_id, well_code, well_name, well_type, location, latitude, longitude,
				planned_depth, actual_depth, drilling_date, completion_date, status, description,
				created_at, updated_at`

		w = &model.Well{}
		err = tx.QueryRow(ctx, query, args...).Scan(
			&w.ID, &w.ProjectID, &w.WellCode, &w.WellName, &w.WellType, &w.Location,
			&w.Latitude, &w.Longitude, &w.PlannedDepth, &w.ActualDepth, &w.DrillingDate,
			&w.CompletionDate, &w.Status, &w.Description, &w.CreatedAt, &w.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWellNotFound
		}
		return nil, err
	}
	return w, nil
}

func (r *WellRepo) Delete(ctx context.Context, wellID, userID uuid.UUID) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		result, err := tx.Exec(ctx, `
			DELETE FROM wells WHERE id = $1 AND project_id IN (
				SELECT id FROM projects WHERE (EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin') OR owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = $2))
			)
		`, wellID, userID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrWellNotFound
		}
		return nil
	})
}

func parseTimeOrNilPtr(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	return parseTimeOrNil(*s)
}

// CreateWithTx creates a well within an existing transaction (for migration)
func (r *WellRepo) CreateWithTx(ctx context.Context, tx database.Tx, w *model.Well) error {
	query := `
		INSERT INTO wells (id, project_id, well_code, well_name, well_type, location, latitude, longitude,
			planned_depth, actual_depth, drilling_date, completion_date, status, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`
	_, err := tx.Exec(ctx, query,
		w.ID, w.ProjectID, w.WellCode, w.WellName, w.WellType, w.Location,
		w.Latitude, w.Longitude, w.PlannedDepth, w.ActualDepth, w.DrillingDate,
		w.CompletionDate, w.Status, w.Description,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrWellCodeExists
		}
		return err
	}
	return nil
}

// GetByCodeForProject returns a well by code within a project
func (r *WellRepo) GetByCodeForProject(ctx context.Context, projectID uuid.UUID, wellCode string) (*model.Well, error) {
	var w *model.Well
	err := r.db.WithUserTx(ctx, uuid.Nil, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT id, project_id, well_code, well_name, well_type, location, latitude, longitude,
				planned_depth, actual_depth, drilling_date, completion_date, status, description,
				created_at, updated_at
			FROM wells
			WHERE project_id = $1 AND well_code = $2
		`
		w = &model.Well{}
		err := tx.QueryRow(ctx, query, projectID, wellCode).Scan(
			&w.ID, &w.ProjectID, &w.WellCode, &w.WellName, &w.WellType, &w.Location,
			&w.Latitude, &w.Longitude, &w.PlannedDepth, &w.ActualDepth, &w.DrillingDate,
			&w.CompletionDate, &w.Status, &w.Description, &w.CreatedAt, &w.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWellNotFound
		}
		return nil, err
	}
	return w, nil
}
