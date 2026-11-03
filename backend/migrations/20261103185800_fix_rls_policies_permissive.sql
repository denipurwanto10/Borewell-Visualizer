-- +goose Up
-- +goose StatementBegin

-- Perbaiki kebijakan RLS: gunakan current_setting(..., true) agar tidak error
-- saat konteks app.current_user_id belum diatur, TAPI tetap fail-closed.
-- Ketika konteks belum diatur (NULL atau string kosong), policy tidak cocok
-- (tidak ada baris yang terlihat) sehingga tidak terjadi kebocoran lintas pengguna.
-- Kebijakan aplikasi (WHERE owner_id = $userID) tetap enforcement utama;
-- RLS adalah defense-in-depth yang tidak membuka akses saat konteks kosong.

-- projects
DROP POLICY IF EXISTS projects_owner ON projects;
CREATE POLICY projects_owner ON projects
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- wells
DROP POLICY IF EXISTS wells_owner ON wells;
CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid));

-- designer_states
DROP POLICY IF EXISTS designer_owner ON designer_states;
CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

-- geological_logs
DROP POLICY IF EXISTS geology_owner ON geological_logs;
CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

-- groundwater_monitoring
DROP POLICY IF EXISTS monitoring_owner ON groundwater_monitoring;
CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

-- documentation_photos
DROP POLICY IF EXISTS photos_owner ON documentation_photos;
CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );

-- documentation_documents
DROP POLICY IF EXISTS docs_owner ON documentation_documents;
CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );

-- files
DROP POLICY IF EXISTS files_owner ON files;
CREATE POLICY files_owner ON files
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- backup_manifests
DROP POLICY IF EXISTS backups_owner ON backup_manifests;
CREATE POLICY backups_owner ON backup_manifests
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- activity_logs
DROP POLICY IF EXISTS activity_owner ON activity_logs;
CREATE POLICY activity_owner ON activity_logs
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Kembalikan ke kebijakan asli (mode ketat, membutuhkan konteks app.current_user_id)
DROP POLICY IF EXISTS projects_owner ON projects;
CREATE POLICY projects_owner ON projects
    USING (owner_id = current_setting('app.current_user_id')::uuid);

DROP POLICY IF EXISTS wells_owner ON wells;
CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid));

DROP POLICY IF EXISTS designer_owner ON designer_states;
CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS geology_owner ON geological_logs;
CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS monitoring_owner ON groundwater_monitoring;
CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

DROP POLICY IF EXISTS photos_owner ON documentation_photos;
CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

DROP POLICY IF EXISTS docs_owner ON documentation_documents;
CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

DROP POLICY IF EXISTS files_owner ON files;
CREATE POLICY files_owner ON files
    USING (owner_id = current_setting('app.current_user_id')::uuid);

DROP POLICY IF EXISTS backups_owner ON backup_manifests;
CREATE POLICY backups_owner ON backup_manifests
    USING (owner_id = current_setting('app.current_user_id')::uuid);

DROP POLICY IF EXISTS activity_owner ON activity_logs;
CREATE POLICY activity_owner ON activity_logs
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- +goose StatementEnd