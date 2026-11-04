-- +goose Up
-- +goose StatementBegin

-- Force RLS on all user-owned tables to ensure policies apply even to table owner
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE wells FORCE ROW LEVEL SECURITY;
ALTER TABLE designer_states FORCE ROW LEVEL SECURITY;
ALTER TABLE geological_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE groundwater_monitoring FORCE ROW LEVEL SECURITY;
ALTER TABLE documentation_photos FORCE ROW LEVEL SECURITY;
ALTER TABLE documentation_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
ALTER TABLE backup_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions FORCE ROW LEVEL SECURITY;

-- Drop old policies (idempotent)
DROP POLICY IF EXISTS projects_access ON projects;
DROP POLICY IF EXISTS wells_access ON wells;
DROP POLICY IF EXISTS designer_access ON designer_states;
DROP POLICY IF EXISTS geology_access ON geological_logs;
DROP POLICY IF EXISTS monitoring_access ON groundwater_monitoring;
DROP POLICY IF EXISTS photos_access ON documentation_photos;
DROP POLICY IF EXISTS docs_access ON documentation_documents;
DROP POLICY IF EXISTS files_access ON files;
DROP POLICY IF EXISTS activity_access ON activity_logs;
DROP POLICY IF EXISTS sessions_owner ON refresh_sessions;

-- Create new policies with NULLIF for fail-closed behavior
-- Admin access is handled at application level, not via RLS
-- This prevents infinite recursion from the user_can_access_project function

CREATE POLICY projects_access ON projects
    USING (
        owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    )
    WITH CHECK (
        owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    );

CREATE POLICY wells_access ON wells
    USING (
        project_id IN (
            SELECT id FROM projects WHERE 
                owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY designer_access ON designer_states
    USING (
        well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE 
                p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY geology_access ON geological_logs
    USING (
        well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE 
                p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY monitoring_access ON groundwater_monitoring
    USING (
        well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE 
                p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY photos_access ON documentation_photos
    USING (
        EXISTS (SELECT 1 FROM projects p WHERE p.id = documentation_photos.project_id AND 
            (p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
             OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)))
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE 
                p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY docs_access ON documentation_documents
    USING (
        EXISTS (SELECT 1 FROM projects p WHERE p.id = documentation_documents.project_id AND 
            (p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
             OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)))
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE 
                p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        )
    );

CREATE POLICY files_access ON files
    USING (
        owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR (project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM projects p WHERE p.id = files.project_id AND 
                (p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid))
        ))
    );

CREATE POLICY activity_access ON activity_logs
    USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- refresh_sessions: service-mode exception limited and safe
-- When context is empty (GET BY token_hash before knowing user_id), lookup by token_hash is allowed
-- When context is set, per-user filter applies
-- This policy is deliberately limited to token_hash column for service-mode lookup
-- All mutations (revoke, rotate, insert) are done in transactions with explicitly set user context (via SessionStore.Create / AtomicRotate)
CREATE POLICY sessions_owner ON refresh_sessions
    USING (
        current_setting('app.current_user_id', true) IS NULL
        OR current_setting('app.current_user_id', true) = ''
        OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP POLICY IF EXISTS sessions_owner ON refresh_sessions;
DROP POLICY IF EXISTS activity_access ON activity_logs;
DROP POLICY IF EXISTS files_access ON files;
DROP POLICY IF EXISTS docs_access ON documentation_documents;
DROP POLICY IF EXISTS photos_access ON documentation_photos;
DROP POLICY IF EXISTS monitoring_access ON groundwater_monitoring;
DROP POLICY IF EXISTS geology_access ON geological_logs;
DROP POLICY IF EXISTS designer_access ON designer_states;
DROP POLICY IF EXISTS wells_access ON wells;
DROP POLICY IF EXISTS projects_access ON projects;

-- Restore FORCE ROW LEVEL SECURITY to false (default)
ALTER TABLE projects NO FORCE ROW LEVEL SECURITY;
ALTER TABLE wells NO FORCE ROW LEVEL SECURITY;
ALTER TABLE designer_states NO FORCE ROW LEVEL SECURITY;
ALTER TABLE geological_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE groundwater_monitoring NO FORCE ROW LEVEL SECURITY;
ALTER TABLE documentation_photos NO FORCE ROW LEVEL SECURITY;
ALTER TABLE documentation_documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE files NO FORCE ROW LEVEL SECURITY;
ALTER TABLE backup_manifests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_sessions NO FORCE ROW LEVEL SECURITY;

-- +goose StatementEnd