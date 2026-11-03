-- +goose Up
-- +goose StatementBegin

-- Enable RLS on all user-owned tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE wells ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE geological_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE groundwater_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their own projects
CREATE POLICY projects_owner ON projects
    USING (owner_id = current_setting('app.current_user_id')::uuid);

-- Policy: wells via project ownership
CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid));

-- Policy: designer_states via well -> project ownership
CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

-- Policy: geological_logs via well -> project ownership
CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

-- Policy: groundwater_monitoring via well -> project ownership
CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

-- Policy: documentation_photos via project/well ownership
CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

-- Policy: documentation_documents via project/well ownership
CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

-- Policy: files via owner_id
CREATE POLICY files_owner ON files
    USING (owner_id = current_setting('app.current_user_id')::uuid);

-- Policy: backup_manifests via owner_id
CREATE POLICY backups_owner ON backup_manifests
    USING (owner_id = current_setting('app.current_user_id')::uuid);

-- Policy: activity_logs via user_id
CREATE POLICY activity_owner ON activity_logs
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- Policy: refresh_sessions via user_id
CREATE POLICY sessions_owner ON refresh_sessions
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP POLICY IF EXISTS projects_owner ON projects;
DROP POLICY IF EXISTS wells_owner ON wells;
DROP POLICY IF EXISTS designer_owner ON designer_states;
DROP POLICY IF EXISTS geology_owner ON geological_logs;
DROP POLICY IF EXISTS monitoring_owner ON groundwater_monitoring;
DROP POLICY IF EXISTS photos_owner ON documentation_photos;
DROP POLICY IF EXISTS docs_owner ON documentation_documents;
DROP POLICY IF EXISTS files_owner ON files;
DROP POLICY IF EXISTS backups_owner ON backup_manifests;
DROP POLICY IF EXISTS activity_owner ON activity_logs;
DROP POLICY IF EXISTS sessions_owner ON refresh_sessions;

ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE wells DISABLE ROW LEVEL SECURITY;
ALTER TABLE designer_states DISABLE ROW LEVEL SECURITY;
ALTER TABLE geological_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE groundwater_monitoring DISABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_photos DISABLE ROW LEVEL SECURITY;
ALTER TABLE documentation_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE files DISABLE ROW LEVEL SECURITY;
ALTER TABLE backup_manifests DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions DISABLE ROW LEVEL SECURITY;

-- +goose StatementEnd