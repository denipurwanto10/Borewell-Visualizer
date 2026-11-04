-- +goose Up
-- +goose StatementBegin

-- Change projects.owner_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
-- This prevents deleting a user from cascading and deleting their projects

ALTER TABLE projects DROP CONSTRAINT projects_owner_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

-- Also change project_assignments.user_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
-- This prevents deleting a user from cascading and deleting their assignments
ALTER TABLE project_assignments DROP CONSTRAINT project_assignments_user_id_fkey;
ALTER TABLE project_assignments ADD CONSTRAINT project_assignments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- Also change files.owner_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
ALTER TABLE files DROP CONSTRAINT files_owner_id_fkey;
ALTER TABLE files ADD CONSTRAINT files_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

-- Also change refresh_sessions.user_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
-- (Sessions are already revoked on user status change, but this prevents cascade)
ALTER TABLE refresh_sessions DROP CONSTRAINT refresh_sessions_user_id_fkey;
ALTER TABLE refresh_sessions ADD CONSTRAINT refresh_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Revert to ON DELETE CASCADE
ALTER TABLE projects DROP CONSTRAINT projects_owner_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE project_assignments DROP CONSTRAINT project_assignments_user_id_fkey;
ALTER TABLE project_assignments ADD CONSTRAINT project_assignments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE files DROP CONSTRAINT files_owner_id_fkey;
ALTER TABLE files ADD CONSTRAINT files_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE refresh_sessions DROP CONSTRAINT refresh_sessions_user_id_fkey;
ALTER TABLE refresh_sessions ADD CONSTRAINT refresh_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- +goose StatementEnd