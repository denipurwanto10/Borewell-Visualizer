-- +goose Up
-- +goose StatementBegin

-- Perbaikan kebijakan RLS refresh_sessions: saat konteks app.current_user_id
-- belum diatur (mode layanan, mis. endpoint cookie-based refresh/logout),
-- jangan errorkan current_setting. Gunakan current_setting(..., true) yang
-- mengembalikan string kosong, lalu NULLIF agar casting ke uuid tidak error.
-- Ketika konteks diatur, filter tetap berlaku per-user (fail closed, tidak bocor).
DROP POLICY IF EXISTS sessions_owner ON refresh_sessions;
CREATE POLICY sessions_owner ON refresh_sessions
    USING (
        -- Mode layanan: konteks belum diatur (NULL atau string kosong), mis.
        -- endpoint cookie-based refresh/logout. Izinkan pencarian berdasar
        -- token_hash. Jika konteks diatur, tetap filter per-user.
        current_setting('app.current_user_id', true) IS NULL
        OR current_setting('app.current_user_id', true) = ''
        OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP POLICY IF EXISTS sessions_owner ON refresh_sessions;
CREATE POLICY sessions_owner ON refresh_sessions
    USING (user_id = current_setting('app.current_user_id')::uuid);

-- +goose StatementEnd
