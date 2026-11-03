package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/borewell/visualizer/backend/internal/database"
)

var (
	ErrSessionNotFound    = errors.New("session not found")
	ErrSessionRevoked     = errors.New("session revoked")
	ErrSessionExpired     = errors.New("session expired")
	ErrTokenReuseDetected = errors.New("token reuse detected")
	ErrUserNotApproved    = errors.New("user not approved")
	ErrUserSuspended      = errors.New("user suspended")
)

type Session struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	TokenHash    string
	UserAgent    string
	IP           string
	ExpiresAt    time.Time
	RevokedAt    *time.Time
	TokenFamily  string
	CreatedAt    time.Time
}

type SessionStore struct {
	db *database.DB
}

func NewSessionStore(db *database.DB) *SessionStore {
	return &SessionStore{db: db}
}

func (s *SessionStore) Create(ctx context.Context, session *Session) error {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Set current_user_id for RLS policy
	_, err = tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+session.UserID.String()+"'")
	if err != nil {
		return err
	}

	query := `
		INSERT INTO refresh_sessions (id, user_id, token_hash, user_agent, ip, expires_at, token_family)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = tx.Exec(ctx, query,
		session.ID, session.UserID, session.TokenHash,
		session.UserAgent, session.IP, session.ExpiresAt, session.TokenFamily,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *SessionStore) GetByTokenHash(ctx context.Context, tokenHash string) (*Session, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip::text, expires_at, revoked_at, token_family, created_at
		FROM refresh_sessions
		WHERE token_hash = $1
	`
	session := &Session{}
	err := s.db.Pool.QueryRow(ctx, query, tokenHash).Scan(
		&session.ID, &session.UserID, &session.TokenHash,
		&session.UserAgent, &session.IP, &session.ExpiresAt,
		&session.RevokedAt, &session.TokenFamily, &session.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return session, nil
}

func (s *SessionStore) GetByID(ctx context.Context, id uuid.UUID) (*Session, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip::text, expires_at, revoked_at, token_family, created_at
		FROM refresh_sessions
		WHERE id = $1
	`
	session := &Session{}
	err := s.db.Pool.QueryRow(ctx, query, id).Scan(
		&session.ID, &session.UserID, &session.TokenHash,
		&session.UserAgent, &session.IP, &session.ExpiresAt,
		&session.RevokedAt, &session.TokenFamily, &session.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return session, nil
}

func (s *SessionStore) Revoke(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE refresh_sessions SET revoked_at = now() WHERE id = $1`
	_, err := s.db.Pool.Exec(ctx, query, id)
	return err
}

func (s *SessionStore) RevokeFamily(ctx context.Context, tokenFamily string, userID uuid.UUID) error {
	query := `UPDATE refresh_sessions SET revoked_at = now() WHERE token_family = $1 AND user_id = $2 AND revoked_at IS NULL`
	_, err := s.db.Pool.Exec(ctx, query, tokenFamily, userID)
	return err
}

func (s *SessionStore) RevokeAllUserSessions(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`
	_, err := s.db.Pool.Exec(ctx, query, userID)
	return err
}

func (s *SessionStore) RotateToken(ctx context.Context, oldSessionID uuid.UUID, newTokenHash string, newExpiresAt time.Time) error {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	now := time.Now().UTC()

	_, err = tx.Exec(ctx, `UPDATE refresh_sessions SET revoked_at = $1 WHERE id = $2`, now, oldSessionID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *SessionStore) AtomicRotate(ctx context.Context, oldTokenHash, newTokenHash string, newExpiresAt time.Time) (*Session, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var oldSession Session
	err = tx.QueryRow(ctx, `
		SELECT id, user_id, token_hash, user_agent, ip::text, expires_at, revoked_at, token_family, created_at
		FROM refresh_sessions
		WHERE token_hash = $1
		FOR UPDATE
	`, oldTokenHash).Scan(
		&oldSession.ID, &oldSession.UserID, &oldSession.TokenHash,
		&oldSession.UserAgent, &oldSession.IP, &oldSession.ExpiresAt,
		&oldSession.RevokedAt, &oldSession.TokenFamily, &oldSession.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}

	if oldSession.RevokedAt != nil {
		return nil, ErrSessionRevoked
	}

	if time.Now().UTC().After(oldSession.ExpiresAt) {
		return nil, ErrSessionExpired
	}

	// Atur konteks RLS ke pemilik sesi sebelum mutasi, agar kebijakan
	// sessions_owner (user_id = app.current_user_id) berlaku pada revoke +
	// insert baru dalam transaksi yang sama.
	if _, err := tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+oldSession.UserID.String()+"'"); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	if _, err := tx.Exec(ctx, `UPDATE refresh_sessions SET revoked_at = $1 WHERE id = $2`, now, oldSession.ID); err != nil {
		return nil, err
	}

	newSession := &Session{
		ID:          uuid.New(),
		UserID:      oldSession.UserID,
		TokenHash:   newTokenHash,
		UserAgent:   oldSession.UserAgent,
		IP:          oldSession.IP,
		ExpiresAt:   newExpiresAt,
		TokenFamily: oldSession.TokenFamily,
		CreatedAt:   now,
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO refresh_sessions (id, user_id, token_hash, user_agent, ip, expires_at, token_family)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, newSession.ID, newSession.UserID, newSession.TokenHash,
		newSession.UserAgent, newSession.IP, newSession.ExpiresAt, newSession.TokenFamily)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return newSession, nil
}

func (s *SessionStore) DeleteExpired(ctx context.Context) (int64, error) {
	query := `DELETE FROM refresh_sessions WHERE expires_at < now() AND revoked_at IS NOT NULL`
	result, err := s.db.Pool.Exec(ctx, query)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (s *SessionStore) GetUserActiveSessions(ctx context.Context, userID uuid.UUID) ([]Session, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip::text, expires_at, revoked_at, token_family, created_at
		FROM refresh_sessions
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC
	`
	rows, err := s.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var session Session
		if err := rows.Scan(
			&session.ID, &session.UserID, &session.TokenHash,
			&session.UserAgent, &session.IP, &session.ExpiresAt,
			&session.RevokedAt, &session.TokenFamily, &session.CreatedAt,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}