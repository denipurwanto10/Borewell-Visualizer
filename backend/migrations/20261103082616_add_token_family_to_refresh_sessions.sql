-- +goose Up
-- +goose StatementBegin

ALTER TABLE refresh_sessions ADD COLUMN token_family TEXT;
CREATE INDEX idx_refresh_sessions_token_family ON refresh_sessions(token_family);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_refresh_sessions_token_family;
ALTER TABLE refresh_sessions DROP COLUMN IF EXISTS token_family;

-- +goose StatementEnd