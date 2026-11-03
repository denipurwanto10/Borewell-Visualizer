-- +goose Up
-- +goose StatementBegin

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wells_updated
    BEFORE UPDATE ON wells
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_designer_updated
    BEFORE UPDATE ON designer_states
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_geology_updated
    BEFORE UPDATE ON geological_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_monitoring_updated
    BEFORE UPDATE ON groundwater_monitoring
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_photos_updated
    BEFORE UPDATE ON documentation_photos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_docs_updated
    BEFORE UPDATE ON documentation_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger to update project.updated_at when well changes
CREATE OR REPLACE FUNCTION update_project_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE projects SET updated_at = now() WHERE id = NEW.project_id;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_well_update_project
    AFTER INSERT OR UPDATE OR DELETE ON wells
    FOR EACH ROW EXECUTE FUNCTION update_project_timestamp();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TRIGGER IF EXISTS trg_well_update_project ON wells;
DROP FUNCTION IF EXISTS update_project_timestamp();

DROP TRIGGER IF EXISTS trg_docs_updated ON documentation_documents;
DROP TRIGGER IF EXISTS trg_photos_updated ON documentation_photos;
DROP TRIGGER IF EXISTS trg_monitoring_updated ON groundwater_monitoring;
DROP TRIGGER IF EXISTS trg_geology_updated ON geological_logs;
DROP TRIGGER IF EXISTS trg_designer_updated ON designer_states;
DROP TRIGGER IF EXISTS trg_wells_updated ON wells;
DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
DROP TRIGGER IF EXISTS trg_users_updated ON users;

DROP FUNCTION IF EXISTS set_updated_at();

-- +goose StatementEnd