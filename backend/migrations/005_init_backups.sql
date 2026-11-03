-- +goose Up
-- +goose StatementBegin

CREATE TABLE backup_manifests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename            TEXT NOT NULL,
    size_bytes          BIGINT NOT NULL,
    format              TEXT NOT NULL DEFAULT 'borewell-engineering-backup',
    version             INTEGER NOT NULL DEFAULT 1,
    project_count       INTEGER NOT NULL DEFAULT 0,
    well_count          INTEGER NOT NULL DEFAULT 0,
    photo_count         INTEGER NOT NULL DEFAULT 0,
    document_count      INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_owner ON backup_manifests(owner_id);
CREATE INDEX idx_backup_created ON backup_manifests(created_at DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS backup_manifests;

-- +goose StatementEnd