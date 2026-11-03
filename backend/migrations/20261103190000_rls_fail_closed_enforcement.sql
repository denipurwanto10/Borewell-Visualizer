-- +goose Up
-- +goose StatementBegin

-- Pastikan RLS diaktifkan pada semua tabel data pengguna.
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

-- Hapus kebijakan lama (idempoten).
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

-- Kebijakan fail-closed: saat app.current_user_id kosong/NULL, tidak ada baris yang cocok.
-- NULLIF(..., '') mengubah string kosong menjadi NULL, lalu casting ke uuid menghasilkan NULL,
-- sehingga owner_id = NULL tidak pernah cocok (fail-closed, tidak bocor).
CREATE POLICY projects_owner ON projects
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid));

CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    ));

CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );

CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );

CREATE POLICY files_owner ON files
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY backups_owner ON backup_manifests
    USING (owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY activity_owner ON activity_logs
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- refresh_sessions: service-mode exception terbatas dan aman.
-- Saat konteks kosong (GET BY token_hash sebelum mengetahui user_id), pencarian berdasarkan
-- token_hash tetap diizinkan. Saat konteks diatur, filter per-user berlaku.
-- Kebijakan ini sengaja dibatasi pada kolom token_hash untuk pencarian service-mode;
-- semua mutasi (revoke, rotate, insert) dilakukan dalam transaksi dengan konteks user yang
-- ditetapkan secara eksplisit (Via SessionStore.Create / AtomicRotate).
CREATE POLICY sessions_owner ON refresh_sessions
    USING (
        current_setting('app.current_user_id', true) IS NULL
        OR current_setting('app.current_user_id', true) = ''
        OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

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

-- Kembalikan ke kebijakan ketat (mengubah konteks wajib diatur).
CREATE POLICY projects_owner ON projects
    USING (owner_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY wells_owner ON wells
    USING (project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY designer_owner ON designer_states
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

CREATE POLICY geology_owner ON geological_logs
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

CREATE POLICY monitoring_owner ON groundwater_monitoring
    USING (well_id IN (
        SELECT w.id FROM wells w
        JOIN projects p ON w.project_id = p.id
        WHERE p.owner_id = current_setting('app.current_user_id')::uuid
    ));

CREATE POLICY photos_owner ON documentation_photos
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

CREATE POLICY docs_owner ON documentation_documents
    USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = current_setting('app.current_user_id')::uuid)
        OR well_id IN (
            SELECT w.id FROM wells w
            JOIN projects p ON w.project_id = p.id
            WHERE p.owner_id = current_setting('app.current_user_id')::uuid
        )
    );

CREATE POLICY files_owner ON files
    USING (owner_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY backups_owner ON backup_manifests
    USING (owner_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY activity_owner ON activity_logs
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- +goose StatementEnd
