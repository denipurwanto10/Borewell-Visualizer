-- +goose Up
-- +goose StatementBegin

CREATE TABLE designer_states (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id         UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,
    components      JSONB NOT NULL DEFAULT '[]',
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)
);

CREATE INDEX idx_designer_well ON designer_states(well_id);

ALTER TABLE designer_states ADD CONSTRAINT chk_designer_components
CHECK (jsonb_typeof(components) = 'array');

CREATE TABLE geological_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id         UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,
    layers          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)
);

CREATE INDEX idx_geology_well ON geological_logs(well_id);

ALTER TABLE geological_logs ADD CONSTRAINT chk_geology_layers
CHECK (jsonb_typeof(layers) = 'array');

CREATE TABLE groundwater_monitoring (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    well_id             UUID NOT NULL REFERENCES wells(id) ON DELETE CASCADE,
    version             INTEGER NOT NULL DEFAULT 1,
    measurements        JSONB NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (well_id)
);

CREATE INDEX idx_monitoring_well ON groundwater_monitoring(well_id);

ALTER TABLE groundwater_monitoring ADD CONSTRAINT chk_monitoring_measurements
CHECK (jsonb_typeof(measurements) = 'array');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS groundwater_monitoring;
DROP TABLE IF EXISTS geological_logs;
DROP TABLE IF EXISTS designer_states;

-- +goose StatementEnd