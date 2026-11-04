-- +goose Up
-- +goose StatementBegin

CREATE TABLE project_assignments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL CHECK (permission IN ('view','edit')),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX idx_project_assignments_user ON project_assignments(user_id);

CREATE OR REPLACE FUNCTION user_can_access_project(p_project_id UUID, p_user_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id AND u.role = 'admin')
        OR EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.owner_id = p_user_id)
        OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p_project_id AND pa.user_id = p_user_id);
$$;

-- Update RLS policies for shared project access
DROP POLICY IF EXISTS projects_owner ON projects;
CREATE POLICY projects_access ON projects
    USING (user_can_access_project(id, current_setting('app.current_user_id')::uuid))
    WITH CHECK (user_can_access_project(id, current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS wells_owner ON wells;
CREATE POLICY wells_access ON wells
    USING (project_id IN (SELECT id FROM projects WHERE user_can_access_project(id, current_setting('app.current_user_id')::uuid)));

DROP POLICY IF EXISTS designer_owner ON designer_states;
CREATE POLICY designer_access ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
    ));

DROP POLICY IF EXISTS geology_owner ON geological_logs;
CREATE POLICY geology_access ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
    ));

DROP POLICY IF EXISTS monitoring_owner ON groundwater_monitoring;
CREATE POLICY monitoring_access ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
    ));

DROP POLICY IF EXISTS photos_owner ON documentation_photos;
CREATE POLICY photos_access ON documentation_photos
    USING (
        user_can_access_project(project_id, current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
        )
    );

DROP POLICY IF EXISTS docs_owner ON documentation_documents;
CREATE POLICY docs_access ON documentation_documents
    USING (
        user_can_access_project(project_id, current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE user_can_access_project(p.id, current_setting('app.current_user_id')::uuid)
        )
    );

DROP POLICY IF EXISTS files_owner ON files;
CREATE POLICY files_access ON files
    USING (
        owner_id = current_setting('app.current_user_id')::uuid
        OR (project_id IS NOT NULL AND user_can_access_project(project_id, current_setting('app.current_user_id')::uuid))
    );

DROP POLICY IF EXISTS activity_owner ON activity_logs;
CREATE POLICY activity_access ON activity_logs
    USING (
        user_id = current_setting('app.current_user_id')::uuid
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = current_setting('app.current_user_id')::uuid AND u.role = 'admin')
    );

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP POLICY IF EXISTS activity_access ON activity_logs;
CREATE POLICY activity_owner ON activity_logs
    USING (user_id = current_setting('app.current_user_id')::uuid);

DROP POLICY IF EXISTS files_access ON files;
CREATE POLICY files_owner ON files
    USING (owner_id = current_setting('app.current_user_id')::uuid);

DROP POLICY IF EXISTS docs_access ON documentation_documents;
CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

DROP POLICY IF EXISTS photos_access ON documentation_photos;
CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

DROP POLICY IF EXISTS monitoring_access ON groundwater_monitoring;
CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS geology_access ON geological_logs;
CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS designer_access ON designer_states;
CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS wells_access ON wells;
CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS projects_access ON projects;
CREATE POLICY projects_owner ON projects
    USING (owner_id = current_setting('app.current_user_id')::uuid);

DROP FUNCTION IF EXISTS user_can_access_project(UUID, UUID);

DROP TABLE IF EXISTS project_assignments;

-- +goose StatementEnd