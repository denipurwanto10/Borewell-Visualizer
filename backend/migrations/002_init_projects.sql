-- +goose Up
-- +goose StatementBegin

CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_code    TEXT NOT NULL,
    project_name    TEXT NOT NULL,
    client_name     TEXT NOT NULL,
    contractor_name TEXT,
    location        TEXT,
    province        TEXT,
    district        TEXT,
    village         TEXT,
    latitude        TEXT,
    longitude       TEXT,
    description     TEXT,
    start_date      DATE,
    end_date        DATE,
    status          TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','in_progress','completed','on_hold','archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_projects_owner_code ON projects(owner_id, project_code);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);

CREATE TABLE wells (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_code           TEXT NOT NULL,
    well_name           TEXT NOT NULL,
    well_type           TEXT NOT NULL DEFAULT 'production' CHECK (well_type IN ('production','monitoring','exploration','test','other')),
    location            TEXT,
    latitude            TEXT,
    longitude           TEXT,
    planned_depth       NUMERIC(10,2),
    actual_depth        NUMERIC(10,2),
    drilling_date       DATE,
    completion_date     DATE,
    status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','drilling','completed','on_hold','abandoned')),
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_wells_project_code ON wells(project_id, well_code);
CREATE INDEX idx_wells_project ON wells(project_id);
CREATE INDEX idx_wells_status ON wells(status);
CREATE INDEX idx_wells_updated ON wells(updated_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS wells;
DROP TABLE IF EXISTS projects;

-- +goose StatementEnd