package tests_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/handler"
	"github.com/borewell/visualizer/backend/internal/router"
)

const (
	testAdminEmail    = "admin-fs2@local.test"
	testAdminPassword = "FS2AdminPassword123!"
	testUserAPassword = "FS2UserAPassword123!"
	testUserBPassword = "FS2UserBPassword123!"
	testPassword      = "TestPassword12345!"
)

type seedData struct {
	appDB    *database.DB
	postgresDB *database.DB
	adminID   uuid.UUID
	userAID  uuid.UUID
	userBID  uuid.UUID
	pending1 uuid.UUID
	pending2 uuid.UUID
	rejected uuid.UUID
	suspended uuid.UUID
	projAID  uuid.UUID
	projBID  uuid.UUID
}

var (
	suiteAppDB *database.DB
	suiteSeed  *seedData
)

func appDSN() string {
	return "postgres://borewell_app:app_password_change_me@localhost:5432/borewell_fs2_test?sslmode=disable"
}

func migrateDSN() string {
	return "postgres://borewell_migrate:migrate_password_change_me@localhost:5432/borewell_fs2_test?sslmode=disable"
}

func postgresDSN() string {
	return "postgres://postgres:changeme@localhost:5432/borewell_fs2_test?sslmode=disable"
}

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)

	appDB := connectDB(appDSN())
	defer appDB.Close()

	migrateDB := connectDB(migrateDSN())
	defer migrateDB.Close()

	postgresDB := connectDB(postgresDSN())
	defer postgresDB.Close()

	seed, err := seedDatabase(postgresDB)
	if err != nil {
		panic(fmt.Errorf("seed database: %w", err))
	}
	seed.appDB = appDB
	seed.postgresDB = postgresDB
	suiteAppDB = appDB
	suiteSeed = seed

	code := m.Run()
	osExit(code)
}

func osExit(code int) { _ = code }

func connectDB(dsn string) *database.DB {
	cfg := &config.Config{
		DatabaseURL:         dsn,
		DatabaseMaxConns:    5,
		DatabaseMinConns:    1,
		DatabaseMaxLifetime: "1h",
		DatabaseMaxIdleTime: "5m",
	}
	db, err := database.New(cfg)
	if err != nil {
		panic(fmt.Errorf("connect test database: %w", err))
	}
	return db
}

func hashPasswordForSeed(password string) string {
	h, err := auth.HashPassword(password, auth.DefaultParams())
	if err != nil {
		panic(err)
	}
	return h
}

func seedDatabase(migrateDB *database.DB) (*seedData, error) {
	ctx := context.Background()

	// Idempotent cleanup so re-runs don't clash with prior partial seeds.
	seedEmails := []string{testAdminEmail, "user-a-fs2@local.test", "user-b-fs2@local.test",
		"pending1-fs2@local.test", "pending2-fs2@local.test", "rejected-fs2@local.test", "suspended-fs2@local.test"}
	if _, err := migrateDB.Pool.Exec(ctx, `UPDATE users SET approved_by = NULL`); err != nil {
		return nil, fmt.Errorf("cleanup clear approved_by: %w", err)
	}
	for _, e := range seedEmails {
		if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, e); err != nil {
			return nil, fmt.Errorf("cleanup delete user %s: %w", e, err)
		}
	}
	if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM projects WHERE project_code IN ('P-A', 'P-B')`); err != nil {
		return nil, fmt.Errorf("cleanup delete projects: %w", err)
	}
	if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM refresh_sessions`); err != nil {
		return nil, fmt.Errorf("cleanup delete sessions: %w", err)
	}

	newUser := func(email, role, status, password string) (uuid.UUID, error) {
		id := uuid.New()
		_, err := migrateDB.Pool.Exec(ctx, `
			INSERT INTO users (id, email, password_hash, full_name, role, status)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, id, email, hashPasswordForSeed(password), "FS2 "+email, role, status)
		return id, err
	}

	adminID, err := newUser(testAdminEmail, "admin", "approved", testAdminPassword)
	if err != nil {
		return nil, err
	}
	if _, err := migrateDB.Pool.Exec(ctx, `UPDATE users SET approved_at = now() WHERE id = $1`, adminID); err != nil {
		return nil, err
	}

	userAID, err := newUser("user-a-fs2@local.test", "user", "approved", testPassword)
	if err != nil {
		return nil, err
	}
	userBID, err := newUser("user-b-fs2@local.test", "user", "approved", testPassword)
	if err != nil {
		return nil, err
	}
	pending1, err := newUser("pending1-fs2@local.test", "user", "pending", testPassword)
	if err != nil {
		return nil, err
	}
	pending2, err := newUser("pending2-fs2@local.test", "user", "pending", testPassword)
	if err != nil {
		return nil, err
	}
	rejectedID, err := newUser("rejected-fs2@local.test", "user", "rejected", testPassword)
	if err != nil {
		return nil, err
	}
	if _, err := migrateDB.Pool.Exec(ctx, `UPDATE users SET rejection_reason = $1 WHERE id = $2`, "test rejection", rejectedID); err != nil {
		return nil, err
	}
	suspendedID, err := newUser("suspended-fs2@local.test", "user", "suspended", testPassword)
	if err != nil {
		return nil, err
	}
	if _, err := migrateDB.Pool.Exec(ctx, `UPDATE users SET rejection_reason = $1 WHERE id = $2`, "test suspension", suspendedID); err != nil {
		return nil, err
	}

	newProject := func(ownerID uuid.UUID, code, name string) (uuid.UUID, error) {
		id := uuid.New()
		tx, err := migrateDB.BeginTx(ctx)
		if err != nil {
			return uuid.Nil, err
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+ownerID.String()+"'"); err != nil {
			return uuid.Nil, err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO projects (id, owner_id, project_code, project_name, client_name, status)
			VALUES ($1, $2, $3, $4, $5, 'planning')
		`, id, ownerID, code, name, "FS2 Client")
		if err != nil {
			return uuid.Nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return uuid.Nil, err
		}
		return id, nil
	}
	projAID, err := newProject(userAID, "P-A", "Proyek A")
	if err != nil {
		return nil, err
	}
	projBID, err := newProject(userBID, "P-B", "Proyek B")
	if err != nil {
		return nil, err
	}

	return &seedData{
		adminID:  adminID,
		userAID:  userAID,
		userBID:  userBID,
		pending1: pending1,
		pending2: pending2,
		rejected: rejectedID,
		suspended: suspendedID,
		projAID:  projAID,
		projBID:  projBID,
	}, nil
}

// resetTestState mengembalikan data autentikasi ke kondisi awal yang diketahui
// sehingga setiap test terisolasi dari state yang ditinggalkan test lain.
func resetTestState(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	mdb := suiteSeed.postgresDB
	if mdb == nil {
		t.Fatal("migrateDB not available")
	}
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, testAdminEmail)
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, "user-a-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, "user-b-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'pending', approved_at = NULL WHERE email = $1`, "pending1-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'pending', approved_at = NULL WHERE email = $1`, "pending2-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'rejected', approved_at = NULL WHERE email = $1`, "rejected-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `UPDATE users SET status = 'suspended', approved_at = NULL WHERE email = $1`, "suspended-fs2@local.test")
	_, _ = mdb.Pool.Exec(ctx, `DELETE FROM refresh_sessions`)
}

// postgresDSN digunakan untuk setup/teardown data uji (bypass RLS), bukan untuk
// verifikasi RLS itu sendiri (yang menggunakan borewell_app via rlsTx).

func routerConfig(t *testing.T) *config.Config {
	t.Helper()
	return &config.Config{
		AppEnv:              "development",
		AppPort:             "18080",
		DatabaseURL:         appDSN(),
		JWTSecret:           "fs2-test-jwt-secret-minimum-thirty-two-chars!",
		RefreshTokenSecret:  "fs2-test-refresh-secret-minimum-thirty-two-chars!",
		DatabaseMaxConns:    5,
		DatabaseMinConns:    1,
		DatabaseMaxLifetime: "1h",
		DatabaseMaxIdleTime: "5m",
		LogLevel:            "warn",
		Argon2Time:          3,
		Argon2Memory:        65536,
		Argon2Threads:       4,
		Argon2KeyLen:        32,
	}
}

type httptestServer struct {
	srv    *httptest.Server
	client *http.Client
}

func newTestServer(t *testing.T) (*httptestServer, *config.Config) {
	t.Helper()
	cfg := routerConfig(t)
	db, err := database.New(cfg)
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	h := handler.New(db, cfg)
	r := router.New(cfg, h)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar: %v", err)
	}
	return &httptestServer{srv: srv, client: &http.Client{Jar: jar}}, cfg
}

func (s *httptestServer) URL() string { return s.srv.URL }

func (s *httptestServer) do(t *testing.T, method, path string, body interface{}, refreshCookie string) *http.Response {
	t.Helper()
	var r io.Reader = nil
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		r = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, s.srv.URL+path, r)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if refreshCookie != "" {
		req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshCookie})
	}
	res, err := s.client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

func postAuth(t *testing.T, s *httptestServer, path, email, password string) *http.Response {
	t.Helper()
	return s.do(t, http.MethodPost, path, map[string]string{"email": email, "password": password}, "")
}

func extractRefreshCookie(res *http.Response) string {
	for _, h := range res.Header.Values("Set-Cookie") {
		if strings.HasPrefix(h, "refresh_token=") {
			end := strings.Index(h, ";")
			if end == -1 {
				end = len(h)
			}
			return h[len("refresh_token="):end]
		}
	}
	return ""
}

func hasCookieAttr(res *http.Response, attr string) bool {
	for _, h := range res.Header.Values("Set-Cookie") {
		if strings.HasPrefix(h, "refresh_token=") && strings.Contains(h, attr) {
			return true
		}
	}
	return false
}

func jsonBody(res *http.Response, v interface{}) {
	defer res.Body.Close()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		panic(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		panic(fmt.Errorf("unmarshal %s: %w", string(b), err))
	}
}

type jsonMap map[string]interface{}
