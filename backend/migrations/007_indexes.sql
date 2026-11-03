-- +goose Up
-- +goose StatementBegin

CREATE INDEX idx_projects_owner_updated ON projects(owner_id, updated_at DESC);
CREATE INDEX idx_wells_project_status ON wells(project_id, status);
CREATE INDEX idx_photos_well_documented ON documentation_photos(well_id, documented_at DESC);
CREATE INDEX idx_docs_well_date ON documentation_documents(well_id, document_date DESC);
CREATE INDEX idx_files_owner_created ON files(owner_id, created_at DESC);
CREATE INDEX idx_activity_user_created ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_refresh_sessions_user_expires ON refresh_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_projects_owner_updated;
DROP INDEX IF EXISTS idx_wells_project_status;
DROP INDEX IF EXISTS idx_photos_well_documented;
DROP INDEX IF EXISTS idx_docs_well_date;
DROP INDEX IF EXISTS idx_files_owner_created;
DROP INDEX IF EXISTS idx_activity_user_created;
DROP INDEX IF EXISTS idx_refresh_sessions_user_expires;

-- +goose StatementEnd