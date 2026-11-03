-- +goose Up
-- +goose StatementBegin

CREATE TABLE files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    well_id         UUID REFERENCES wells(id) ON DELETE SET NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    storage_path    TEXT NOT NULL UNIQUE,
    checksum_sha256 CHAR(64) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner ON files(owner_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_well ON files(well_id);
CREATE INDEX idx_files_checksum ON files(checksum_sha256);

CREATE TABLE documentation_photos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_id             UUID REFERENCES wells(id) ON DELETE CASCADE,
    file_id             UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    name                TEXT NOT NULL,
    category            TEXT NOT NULL CHECK (category IN (
        'site_condition','drilling_process','drilling_equipment',
        'well_construction','casing_installation','pump_installation',
        'groundwater_measurement','geological_sample','completion','other'
    )),
    description         TEXT,
    documented_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    width               INTEGER,
    height              INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_project ON documentation_photos(project_id);
CREATE INDEX idx_photos_well ON documentation_photos(well_id);
CREATE INDEX idx_photos_category ON documentation_photos(category);
CREATE INDEX idx_photos_documented ON documentation_photos(documented_at DESC);

CREATE TABLE documentation_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    well_id             UUID REFERENCES wells(id) ON DELETE CASCADE,
    file_id             UUID NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
    title               TEXT NOT NULL,
    category            TEXT NOT NULL CHECK (category IN (
        'permit','contract','technical_spec','test_result',
        'daily_report','as_built','certification','correspondence',
        'manual','other'
    )),
    description         TEXT,
    document_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_docs_project ON documentation_documents(project_id);
CREATE INDEX idx_docs_well ON documentation_documents(well_id);
CREATE INDEX idx_docs_category ON documentation_documents(category);
CREATE INDEX idx_docs_document_date ON documentation_documents(document_date DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS documentation_documents;
DROP TABLE IF EXISTS documentation_photos;
DROP TABLE IF EXISTS files;

-- +goose StatementEnd