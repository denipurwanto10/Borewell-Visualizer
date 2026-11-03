package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
)

var ErrModuleNotFound = errors.New("module not found")

type ModuleRepo struct {
	db *database.DB
}

func NewModuleRepo(db *database.DB) *ModuleRepo {
	return &ModuleRepo{db: db}
}

// Designer State

func (r *ModuleRepo) GetDesignerForUser(ctx context.Context, wellID, userID uuid.UUID) (*model.DesignerState, error) {
	var m *model.DesignerState
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT d.id, d.well_id, d.version, d.components, d.config, d.created_at, d.updated_at
			FROM designer_states d
			JOIN wells w ON d.well_id = w.id
			JOIN projects p ON w.project_id = p.id
			WHERE d.well_id = $1 AND p.owner_id = $2
		`
		m = &model.DesignerState{}
		err := tx.QueryRow(ctx, query, wellID, userID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Components, &m.Config, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

func (r *ModuleRepo) UpsertDesigner(ctx context.Context, wellID, userID uuid.UUID, version int, components, config any) (*model.DesignerState, error) {
	var m *model.DesignerState
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Verify well ownership
		var dummy uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT w.id FROM wells w JOIN projects p ON w.project_id = p.id
			WHERE w.id = $1 AND p.owner_id = $2
		`, wellID, userID).Scan(&dummy)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrModuleNotFound
			}
			return err
		}

		_, err = r.getDesignerForUserTx(ctx, tx, wellID, userID)
		if err != nil && !errors.Is(err, ErrModuleNotFound) {
			return err
		}

		if errors.Is(err, ErrModuleNotFound) {
			query := `
				INSERT INTO designer_states (id, well_id, version, components, config)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id, well_id, version, components, config, created_at, updated_at
			`
			m = &model.DesignerState{}
			err = tx.QueryRow(ctx, query, uuid.New(), wellID, version, components, config).Scan(
				&m.ID, &m.WellID, &m.Version, &m.Components, &m.Config, &m.CreatedAt, &m.UpdatedAt,
			)
			return err
		}

		query := `
			UPDATE designer_states SET version = $1, components = $2, config = $3, updated_at = now()
			WHERE well_id = $4
			RETURNING id, well_id, version, components, config, created_at, updated_at
		`
		m = &model.DesignerState{}
		err = tx.QueryRow(ctx, query, version, components, config, wellID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Components, &m.Config, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	return m, err
}

func (r *ModuleRepo) getDesignerForUserTx(ctx context.Context, tx database.Tx, wellID, userID uuid.UUID) (*model.DesignerState, error) {
	m := &model.DesignerState{}
	query := `
		SELECT d.id, d.well_id, d.version, d.components, d.config, d.created_at, d.updated_at
		FROM designer_states d
		JOIN wells w ON d.well_id = w.id
		JOIN projects p ON w.project_id = p.id
		WHERE d.well_id = $1 AND p.owner_id = $2
	`
	err := tx.QueryRow(ctx, query, wellID, userID).Scan(
		&m.ID, &m.WellID, &m.Version, &m.Components, &m.Config, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

// Geology Log

func (r *ModuleRepo) GetGeologyForUser(ctx context.Context, wellID, userID uuid.UUID) (*model.GeologyLog, error) {
	var m *model.GeologyLog
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT g.id, g.well_id, g.version, g.layers, g.created_at, g.updated_at
			FROM geological_logs g
			JOIN wells w ON g.well_id = w.id
			JOIN projects p ON w.project_id = p.id
			WHERE g.well_id = $1 AND p.owner_id = $2
		`
		m = &model.GeologyLog{}
		err := tx.QueryRow(ctx, query, wellID, userID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Layers, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

func (r *ModuleRepo) UpsertGeology(ctx context.Context, wellID, userID uuid.UUID, version int, layers any) (*model.GeologyLog, error) {
	var m *model.GeologyLog
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		var dummy uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT w.id FROM wells w JOIN projects p ON w.project_id = p.id
			WHERE w.id = $1 AND p.owner_id = $2
		`, wellID, userID).Scan(&dummy)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrModuleNotFound
			}
			return err
		}

		_, err = r.getGeologyForUserTx(ctx, tx, wellID, userID)
		if err != nil && !errors.Is(err, ErrModuleNotFound) {
			return err
		}

		if errors.Is(err, ErrModuleNotFound) {
			query := `
				INSERT INTO geological_logs (id, well_id, version, layers)
				VALUES ($1, $2, $3, $4)
				RETURNING id, well_id, version, layers, created_at, updated_at
			`
			m = &model.GeologyLog{}
			err = tx.QueryRow(ctx, query, uuid.New(), wellID, version, layers).Scan(
				&m.ID, &m.WellID, &m.Version, &m.Layers, &m.CreatedAt, &m.UpdatedAt,
			)
			return err
		}

		query := `
			UPDATE geological_logs SET version = $1, layers = $2, updated_at = now()
			WHERE well_id = $3
			RETURNING id, well_id, version, layers, created_at, updated_at
		`
		m = &model.GeologyLog{}
		err = tx.QueryRow(ctx, query, version, layers, wellID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Layers, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	return m, err
}

func (r *ModuleRepo) getGeologyForUserTx(ctx context.Context, tx database.Tx, wellID, userID uuid.UUID) (*model.GeologyLog, error) {
	m := &model.GeologyLog{}
	query := `
		SELECT g.id, g.well_id, g.version, g.layers, g.created_at, g.updated_at
		FROM geological_logs g
		JOIN wells w ON g.well_id = w.id
		JOIN projects p ON w.project_id = p.id
		WHERE g.well_id = $1 AND p.owner_id = $2
	`
	err := tx.QueryRow(ctx, query, wellID, userID).Scan(
		&m.ID, &m.WellID, &m.Version, &m.Layers, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

// Groundwater Monitoring

func (r *ModuleRepo) GetMonitoringForUser(ctx context.Context, wellID, userID uuid.UUID) (*model.MonitoringData, error) {
	var m *model.MonitoringData
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT m.id, m.well_id, m.version, m.measurements, m.created_at, m.updated_at
			FROM groundwater_monitoring m
			JOIN wells w ON m.well_id = w.id
			JOIN projects p ON w.project_id = p.id
			WHERE m.well_id = $1 AND p.owner_id = $2
		`
		m = &model.MonitoringData{}
		err := tx.QueryRow(ctx, query, wellID, userID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

func (r *ModuleRepo) UpsertMonitoring(ctx context.Context, wellID, userID uuid.UUID, version int, measurements any) (*model.MonitoringData, error) {
	var m *model.MonitoringData
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		var dummy uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT w.id FROM wells w JOIN projects p ON w.project_id = p.id
			WHERE w.id = $1 AND p.owner_id = $2
		`, wellID, userID).Scan(&dummy)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrModuleNotFound
			}
			return err
		}

		_, err = r.getMonitoringForUserTx(ctx, tx, wellID, userID)
		if err != nil && !errors.Is(err, ErrModuleNotFound) {
			return err
		}

		if errors.Is(err, ErrModuleNotFound) {
			query := `
				INSERT INTO groundwater_monitoring (id, well_id, version, measurements)
				VALUES ($1, $2, $3, $4)
				RETURNING id, well_id, version, measurements, created_at, updated_at
			`
			m = &model.MonitoringData{}
			err = tx.QueryRow(ctx, query, uuid.New(), wellID, version, measurements).Scan(
				&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
			)
			return err
		}

		query := `
			UPDATE groundwater_monitoring SET version = $1, measurements = $2, updated_at = now()
			WHERE well_id = $3
			RETURNING id, well_id, version, measurements, created_at, updated_at
		`
		m = &model.MonitoringData{}
		err = tx.QueryRow(ctx, query, version, measurements, wellID).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	})
	return m, err
}

func (r *ModuleRepo) getMonitoringForUserTx(ctx context.Context, tx database.Tx, wellID, userID uuid.UUID) (*model.MonitoringData, error) {
	m := &model.MonitoringData{}
	query := `
		SELECT m.id, m.well_id, m.version, m.measurements, m.created_at, m.updated_at
		FROM groundwater_monitoring m
		JOIN wells w ON m.well_id = w.id
		JOIN projects p ON w.project_id = p.id
		WHERE m.well_id = $1 AND p.owner_id = $2
	`
	err := tx.QueryRow(ctx, query, wellID, userID).Scan(
		&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrModuleNotFound
		}
		return nil, err
	}
	return m, nil
}

// UpsertDesignerWithTx upserts designer state within an existing transaction
func (r *ModuleRepo) UpsertDesignerWithTx(ctx context.Context, tx database.Tx, d *model.DesignerState) error {
	_, err := r.getDesignerForUserTx(ctx, tx, d.WellID, uuid.Nil)
	if err != nil && !errors.Is(err, ErrModuleNotFound) {
		return err
	}

	if errors.Is(err, ErrModuleNotFound) {
		query := `
			INSERT INTO designer_states (id, well_id, version, components, config)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, well_id, version, components, config, created_at, updated_at
		`
		err = tx.QueryRow(ctx, query, uuid.New(), d.WellID, d.Version, d.Components, d.Config).Scan(
			&d.ID, &d.WellID, &d.Version, &d.Components, &d.Config, &d.CreatedAt, &d.UpdatedAt,
		)
		return err
	}

	query := `
		UPDATE designer_states SET version = $1, components = $2, config = $3, updated_at = now()
		WHERE well_id = $4
		RETURNING id, well_id, version, components, config, created_at, updated_at
	`
	err = tx.QueryRow(ctx, query, d.Version, d.Components, d.Config, d.WellID).Scan(
		&d.ID, &d.WellID, &d.Version, &d.Components, &d.Config, &d.CreatedAt, &d.UpdatedAt,
	)
	return err
}

// UpsertGeologyWithTx upserts geology log within an existing transaction
func (r *ModuleRepo) UpsertGeologyWithTx(ctx context.Context, tx database.Tx, g *model.GeologyLog) error {
	_, err := r.getGeologyForUserTx(ctx, tx, g.WellID, uuid.Nil)
	if err != nil && !errors.Is(err, ErrModuleNotFound) {
		return err
	}

	if errors.Is(err, ErrModuleNotFound) {
		query := `
			INSERT INTO geological_logs (id, well_id, version, layers)
			VALUES ($1, $2, $3, $4)
			RETURNING id, well_id, version, layers, created_at, updated_at
		`
		err = tx.QueryRow(ctx, query, uuid.New(), g.WellID, g.Version, g.Layers).Scan(
			&g.ID, &g.WellID, &g.Version, &g.Layers, &g.CreatedAt, &g.UpdatedAt,
		)
		return err
	}

	query := `
		UPDATE geological_logs SET version = $1, layers = $2, updated_at = now()
		WHERE well_id = $3
		RETURNING id, well_id, version, layers, created_at, updated_at
	`
	err = tx.QueryRow(ctx, query, g.Version, g.Layers, g.WellID).Scan(
		&g.ID, &g.WellID, &g.Version, &g.Layers, &g.CreatedAt, &g.UpdatedAt,
	)
	return err
}

// UpsertMonitoringWithTx upserts monitoring data within an existing transaction
func (r *ModuleRepo) UpsertMonitoringWithTx(ctx context.Context, tx database.Tx, m *model.MonitoringData) error {
	_, err := r.getMonitoringForUserTx(ctx, tx, m.WellID, uuid.Nil)
	if err != nil && !errors.Is(err, ErrModuleNotFound) {
		return err
	}

	if errors.Is(err, ErrModuleNotFound) {
		query := `
			INSERT INTO groundwater_monitoring (id, well_id, version, measurements)
			VALUES ($1, $2, $3, $4)
			RETURNING id, well_id, version, measurements, created_at, updated_at
		`
		err = tx.QueryRow(ctx, query, uuid.New(), m.WellID, m.Version, m.Measurements).Scan(
			&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
		)
		return err
	}

	query := `
		UPDATE groundwater_monitoring SET version = $1, measurements = $2, updated_at = now()
		WHERE well_id = $3
		RETURNING id, well_id, version, measurements, created_at, updated_at
	`
	err = tx.QueryRow(ctx, query, m.Version, m.Measurements, m.WellID).Scan(
		&m.ID, &m.WellID, &m.Version, &m.Measurements, &m.CreatedAt, &m.UpdatedAt,
	)
	return err
}
