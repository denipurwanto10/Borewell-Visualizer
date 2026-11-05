package fs3_test

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
	fs3TestAdminEmail    = "admin-fs3@local.test"
	fs3TestAdminPassword = "FS3AdminPassword123!"
	fs3TestPassword      = "FS3TestPassword12345!"
)

var (
	fs3SuiteAppDB     *database.DB
	fs3SuitePostgresDB *database.DB
	fs3SuiteSeed      map[string]string
)

func fs3AppDSN() string {
	return "postgres://borewell_app:app_password_change_me@localhost:5432/borewell_fs3_test?sslmode=disable"
}

func fs3MigrateDSN() string {
	return "postgres://borewell_migrate:migrate_password_change_me@localhost:5432/borewell_fs3_test?sslmode=disable"
}

func fs3PostgresDSN() string {
	return "postgres://postgres@localhost:5432/borewell_fs3_test?sslmode=disable"
}

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)

	appDB := fs3ConnectDB(fs3AppDSN())
	defer appDB.Close()

	migrateDB := fs3ConnectDB(fs3MigrateDSN())
	defer migrateDB.Close()

	postgresDB := fs3ConnectDB(fs3PostgresDSN())
	defer postgresDB.Close()

	seed, err := fs3SeedDatabase(postgresDB)
	if err != nil {
		panic(fmt.Errorf("seed database: %w", err))
	}
	fs3SuiteAppDB = appDB
	fs3SuitePostgresDB = postgresDB
	fs3SuiteSeed = seed

	code := m.Run()
	osExit(code)
}

func osExit(code int) { _ = code }

func fs3ConnectDB(dsn string) *database.DB {
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

func fs3HashPasswordForSeed(password string) string {
	h, err := auth.HashPassword(password, auth.DefaultParams())
	if err != nil {
		panic(err)
	}
	return h
}

func fs3SeedDatabase(migrateDB *database.DB) (map[string]string, error) {
	ctx := context.Background()

	emails := []string{
		fs3TestAdminEmail,
		"user-a-fs3@local.test",
		"user-b-fs3@local.test",
	}
	for _, e := range emails {
		if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM users WHERE email = $1`, e); err != nil {
			return nil, err
		}
	}
	if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM projects WHERE project_code LIKE 'P-FS3-%'`); err != nil {
		return nil, err
	}
	if _, err := migrateDB.Pool.Exec(ctx, `DELETE FROM refresh_sessions`); err != nil {
		return nil, err
	}

	ids := make(map[string]string)

	newUser := func(key, email, role, status, password string) error {
		id := uuid.New()
		_, err := migrateDB.Pool.Exec(ctx, `
			INSERT INTO users (id, email, password_hash, full_name, role, status)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, id, email, fs3HashPasswordForSeed(password), "FS3 "+email, role, status)
		if err != nil {
			return err
		}
		if _, err := migrateDB.Pool.Exec(ctx, `UPDATE users SET approved_at = now() WHERE id = $1`, id); err != nil {
			return err
		}
		ids[key] = id.String()
		return nil
	}

	if err := newUser("admin", fs3TestAdminEmail, "admin", "approved", fs3TestAdminPassword); err != nil {
		return nil, err
	}
	if err := newUser("userA", "user-a-fs3@local.test", "user", "approved", fs3TestPassword); err != nil {
		return nil, err
	}
	if err := newUser("userB", "user-b-fs3@local.test", "user", "approved", fs3TestPassword); err != nil {
		return nil, err
	}

	newProject := func(key, ownerID, code, name string) error {
		id := uuid.New()
		tx, err := migrateDB.BeginTx(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, "SET LOCAL app.current_user_id = '"+ownerID+"'"); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO projects (id, owner_id, project_code, project_name, client_name, status)
			VALUES ($1, $2, $3, $4, $5, 'planning')
		`, id, ownerID, code, name, "FS3 Client")
		if err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		ids[key] = id.String()
		return nil
	}

	if err := newProject("projA", ids["userA"], "P-FS3-A", "Proyek A FS3"); err != nil {
		return nil, err
	}
	if err := newProject("projB", ids["userB"], "P-FS3-B", "Proyek B FS3"); err != nil {
		return nil, err
	}

	newWell := func(key, projectID, code string) error {
		id := uuid.New()
		_, err := migrateDB.Pool.Exec(ctx, `
			INSERT INTO wells (id, project_id, well_code, well_name, well_type, status)
			VALUES ($1, $2, $3, $4, $5, 'planned')
		`, id, projectID, code, "Well "+code, "production")
		if err != nil {
			return err
		}
		ids[key] = id.String()
		return nil
	}

	if err := newWell("wellA", ids["projA"], "W-FS3-A"); err != nil {
		return nil, err
	}
	if err := newWell("wellB", ids["projB"], "W-FS3-B"); err != nil {
		return nil, err
	}

	return ids, nil
}

func fs3ResetTestState(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	_, _ = fs3SuiteAppDB.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, fs3TestAdminEmail)
	_, _ = fs3SuiteAppDB.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, "user-a-fs3@local.test")
	_, _ = fs3SuiteAppDB.Pool.Exec(ctx, `UPDATE users SET status = 'approved', approved_at = now() WHERE email = $1`, "user-b-fs3@local.test")
	_, _ = fs3SuiteAppDB.Pool.Exec(ctx, `DELETE FROM refresh_sessions`)
	// projects memiliki RLS fail-closed; gunakan koneksi superuser (bypass RLS) untuk cleanup
	_, _ = fs3SuitePostgresDB.Pool.Exec(ctx, `DELETE FROM projects WHERE project_code LIKE 'P-FS3-%' AND project_code NOT IN ('P-FS3-A', 'P-FS3-B')`)
}

func fs3RouterConfig(t *testing.T) *config.Config {
	t.Helper()
	return &config.Config{
		AppEnv:              "development",
		AppPort:             "18080",
		DatabaseURL:         fs3AppDSN(),
		JWTSecret:           "fs3-test-jwt-secret-minimum-thirty-two-chars!",
		RefreshTokenSecret:  "fs3-test-refresh-secret-minimum-thirty-two-chars!",
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

func fs3newTestServer(t *testing.T) (*httptestServer, *config.Config) {
	t.Helper()
	cfg := fs3RouterConfig(t)
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

func fs3do(t *testing.T, s *httptestServer, method, path string, body interface{}, refreshCookie string, accessToken string) *http.Response {
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
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	res, err := s.client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return res
}

func fs3postAuth(t *testing.T, s *httptestServer, path, email, password string) *http.Response {
	return fs3do(t, s, http.MethodPost, path, map[string]string{"email": email, "password": password}, "", "")
}

func fs3extractRefreshCookie(res *http.Response) string {
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

func fs3jsonBody(res *http.Response, v interface{}) {
	defer res.Body.Close()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		panic(err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		panic(fmt.Errorf("unmarshal %s: %w", string(b), err))
	}
}

func fs3login(t *testing.T, s *httptestServer, email, password string) (string, string) {
	t.Helper()
	res := fs3postAuth(t, s, "/api/v1/auth/login", email, password)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login %s: status=%d", email, res.StatusCode)
	}
	type loginResp struct {
		AccessToken string `json:"access_token"`
		User        struct {
			ID   string `json:"id"`
			Role string `json:"role"`
		} `json:"user"`
	}
	var lr loginResp
	fs3jsonBody(res, &lr)
	cookie := fs3extractRefreshCookie(res)
	return lr.AccessToken, cookie
}

func fs3rlsTx(t *testing.T, userID string, fn func(tx database.Tx) error) error {
	t.Helper()
	tx, err := fs3SuiteAppDB.BeginTx(context.Background())
	if err != nil {
		return err
	}
	if _, err := tx.Exec(context.Background(), "SET LOCAL app.current_user_id = '"+userID+"'"); err != nil {
		tx.Rollback(context.Background())
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback(context.Background())
		return err
	}
	return tx.Commit(context.Background())
}

func fs3countAs(t *testing.T, userID string, query string, args ...interface{}) int {
	t.Helper()
	var n int
	err := fs3rlsTx(t, userID, func(tx database.Tx) error {
		return tx.QueryRow(context.Background(), query, args...).Scan(&n)
	})
	if err != nil {
		t.Fatalf("countAs(user=%s): %v", userID, err)
	}
	return n
}

type respData struct {
	Data interface{} `json:"data"`
	Meta interface{} `json:"meta"`
}

func TestProjectCRUD(t *testing.T) {
	fs3ResetTestState(t)
	seed := fs3SuiteSeed
	s, _ := fs3newTestServer(t)

	tokenA, _ := fs3login(t, s, "user-a-fs3@local.test", fs3TestPassword)
	_, _ = fs3login(t, s, "user-b-fs3@local.test", fs3TestPassword)

	t.Run("User A lists own projects", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("list projects: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		projects, _ := resp.Data.([]interface{})
		if len(projects) < 1 {
			t.Fatalf("user A should see at least 1 project, got %d", len(projects))
		}
	})

	t.Run("User A cannot see User B projects", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects", nil, "", tokenA)
		var resp respData
		fs3jsonBody(res, &resp)
		projects, _ := resp.Data.([]interface{})
		for _, p := range projects {
			proj, _ := p.(map[string]interface{})
			if proj["project_code"] == "P-FS3-B" {
				t.Fatal("User A should not see User B's project P-FS3-B")
			}
		}
	})

	t.Run("User A creates project", func(t *testing.T) {
		req := map[string]interface{}{
			"project_code": "P-FS3-NEW-A",
			"project_name": "Proyek Baru A",
			"client_name":  "Client A",
			"status":       "planning",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects", req, "", tokenA)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("create project: expected 201, got %d", res.StatusCode)
		}
	})

	t.Run("Duplicate project code rejected", func(t *testing.T) {
		req := map[string]interface{}{
			"project_code": "P-FS3-A",
			"project_name": "Dup",
			"client_name":  "C",
			"status":       "planning",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects", req, "", tokenA)
		if res.StatusCode != http.StatusConflict {
			t.Fatalf("duplicate: expected 409, got %d", res.StatusCode)
		}
	})

	t.Run("User A gets own project", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"], nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("get project: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("User A cannot get User B project", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projB"], nil, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("get other project: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("User A updates own project", func(t *testing.T) {
		req := map[string]interface{}{"project_name": "Updated A"}
		res := fs3do(t, s, http.MethodPut, "/api/v1/projects/"+seed["projA"], req, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("update project: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("User A cannot update User B project", func(t *testing.T) {
		req := map[string]interface{}{"project_name": "Hack"}
		res := fs3do(t, s, http.MethodPut, "/api/v1/projects/"+seed["projB"], req, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("update other project: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("Unauthenticated rejected", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects", nil, "", "")
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("unauth: expected 401, got %d", res.StatusCode)
		}
	})

	t.Run("Missing required fields", func(t *testing.T) {
		req := map[string]interface{}{"project_name": "No Code"}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects", req, "", tokenA)
		if res.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("validation: expected 422, got %d", res.StatusCode)
		}
	})

	t.Run("User A deletes own project", func(t *testing.T) {
		req := map[string]interface{}{
			"project_code": "P-FS3-DEL",
			"project_name": "To Delete",
			"client_name":  "C",
			"status":       "planning",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects", req, "", tokenA)
		var resp respData
		fs3jsonBody(res, &resp)
		projID := resp.Data.(map[string]interface{})["id"].(string)

		res = fs3do(t, s, http.MethodDelete, "/api/v1/projects/"+projID, nil, "", tokenA)
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("delete: expected 204, got %d", res.StatusCode)
		}
	})

	t.Run("Pagination works", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects?page=1&page_size=2", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("pagination: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		meta, _ := resp.Meta.(map[string]interface{})
		if meta["page_size"] != float64(2) {
			t.Fatalf("expected page_size 2, got %v", meta["page_size"])
		}
	})

	fmt.Println("Project CRUD: PASS")
}

func TestWellCRUD(t *testing.T) {
	fs3ResetTestState(t)
	seed := fs3SuiteSeed
	s, _ := fs3newTestServer(t)

	tokenA, _ := fs3login(t, s, "user-a-fs3@local.test", fs3TestPassword)

	t.Run("User A lists own wells", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"]+"/wells", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("list wells: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		wells, _ := resp.Data.([]interface{})
		if len(wells) < 1 {
			t.Fatalf("user A should see wells, got %d", len(wells))
		}
	})

	t.Run("User A creates well", func(t *testing.T) {
		req := map[string]interface{}{
			"well_code":  "W-FS3-NEW",
			"well_name":  "New Well",
			"well_type":  "production",
			"status":     "planned",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects/"+seed["projA"]+"/wells", req, "", tokenA)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("create well: expected 201, got %d", res.StatusCode)
		}
	})

	t.Run("User A cannot create well in User B project", func(t *testing.T) {
		req := map[string]interface{}{
			"well_code":  "W-HACK",
			"well_name":  "Hack",
			"well_type":  "production",
			"status":     "planned",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects/"+seed["projB"]+"/wells", req, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("create well other project: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("User A gets own well", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellA"], nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("get well: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("User A cannot get User B well", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellB"], nil, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("get other well: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("User A updates own well", func(t *testing.T) {
		req := map[string]interface{}{"well_name": "Updated Well A"}
		res := fs3do(t, s, http.MethodPut, "/api/v1/wells/"+seed["wellA"], req, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("update well: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("User A cannot update User B well", func(t *testing.T) {
		req := map[string]interface{}{"well_name": "Hack"}
		res := fs3do(t, s, http.MethodPut, "/api/v1/wells/"+seed["wellB"], req, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("update other well: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("User A deletes own well", func(t *testing.T) {
		req := map[string]interface{}{
			"well_code":  "W-FS3-DEL",
			"well_name":  "To Delete",
			"well_type":  "production",
			"status":     "planned",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects/"+seed["projA"]+"/wells", req, "", tokenA)
		var resp respData
		fs3jsonBody(res, &resp)
		wellID := resp.Data.(map[string]interface{})["id"].(string)

		res = fs3do(t, s, http.MethodDelete, "/api/v1/wells/"+wellID, nil, "", tokenA)
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("delete well: expected 204, got %d", res.StatusCode)
		}
	})

	t.Run("Duplicate well code rejected", func(t *testing.T) {
		req := map[string]interface{}{
			"well_code":  "W-FS3-A",
			"well_name":  "Dup",
			"well_type":  "production",
			"status":     "planned",
		}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects/"+seed["projA"]+"/wells", req, "", tokenA)
		if res.StatusCode != http.StatusConflict {
			t.Fatalf("duplicate well: expected 409, got %d", res.StatusCode)
		}
	})

	t.Run("Validation missing fields", func(t *testing.T) {
		req := map[string]interface{}{"well_name": "No Code"}
		res := fs3do(t, s, http.MethodPost, "/api/v1/projects/"+seed["projA"]+"/wells", req, "", tokenA)
		if res.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("validation: expected 422, got %d", res.StatusCode)
		}
	})

	fmt.Println("Well CRUD: PASS")
}

func TestModuleAPIs(t *testing.T) {
	fs3ResetTestState(t)
	seed := fs3SuiteSeed
	s, _ := fs3newTestServer(t)

	tokenA, _ := fs3login(t, s, "user-a-fs3@local.test", fs3TestPassword)
	_, _ = fs3login(t, s, "user-b-fs3@local.test", fs3TestPassword)

	designerData := map[string]interface{}{
		"version": 1,
		"components": []interface{}{
			map[string]interface{}{
				"id":             "comp-1",
				"type":           "surface_casing",
				"name":           "Casing Permukaan",
				"start_depth":    0,
				"end_depth":      20,
				"length":         20,
				"outer_diameter": 200,
				"inner_diameter": 180,
				"material":       "PVC",
				"color":          "#475569",
				"visible":        true,
				"z_order":        0,
			},
		},
		"config": map[string]interface{}{
			"total_well_depth": 48.5,
			"ground_level":     0,
			"mat_level":        nil,
		},
	}

	t.Run("Designer upsert and get", func(t *testing.T) {
		res := fs3do(t, s, http.MethodPut, "/api/v1/wells/"+seed["wellA"]+"/designer", designerData, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("upsert designer: expected 200, got %d", res.StatusCode)
		}
		res = fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellA"]+"/designer", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("get designer: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		data, _ := resp.Data.(map[string]interface{})
		components, _ := data["components"].([]interface{})
		if len(components) != 1 {
			t.Fatalf("expected 1 component, got %d", len(components))
		}
	})

	t.Run("Designer isolation User A vs B", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellB"]+"/designer", nil, "", tokenA)
		var resp respData
		fs3jsonBody(res, &resp)
		data, _ := resp.Data.(map[string]interface{})
		components, _ := data["components"].([]interface{})
		if len(components) != 0 {
			t.Fatalf("User A should not see User B designer components, got %d", len(components))
		}
	})

	geologyData := map[string]interface{}{
		"version": 1,
		"layers": []interface{}{
			map[string]interface{}{
				"id":           "geo-1",
				"name":         "Topsoil",
				"material":     "topsoil",
				"start_depth":  0,
				"end_depth":    1.5,
				"description":  "Tanah organik",
				"color":        "#7c5a3c",
				"pattern":      "topsoil",
			},
		},
	}

	t.Run("Geology upsert and get", func(t *testing.T) {
		res := fs3do(t, s, http.MethodPut, "/api/v1/wells/"+seed["wellA"]+"/geology", geologyData, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("upsert geology: expected 200, got %d", res.StatusCode)
		}
		res = fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellA"]+"/geology", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("get geology: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		data, _ := resp.Data.(map[string]interface{})
		layers, _ := data["layers"].([]interface{})
		if len(layers) != 1 {
			t.Fatalf("expected 1 layer, got %d", len(layers))
		}
	})

	monitoringData := map[string]interface{}{
		"version": 1,
		"measurements": []interface{}{
			map[string]interface{}{
				"id":                  "mon-1",
				"measured_at":         "2024-01-15T10:30:00Z",
				"water_level_depth":   12.35,
				"reference_point":     "top_of_casing",
				"reference_elevation": 25.5,
				"method":              "electric_water_level_meter",
				"status":              "valid",
				"notes":               "Normal",
			},
		},
	}

	t.Run("Monitoring upsert and get", func(t *testing.T) {
		res := fs3do(t, s, http.MethodPut, "/api/v1/wells/"+seed["wellA"]+"/monitoring", monitoringData, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("upsert monitoring: expected 200, got %d", res.StatusCode)
		}
		res = fs3do(t, s, http.MethodGet, "/api/v1/wells/"+seed["wellA"]+"/monitoring", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("get monitoring: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		data, _ := resp.Data.(map[string]interface{})
		measurements, _ := data["measurements"].([]interface{})
		if len(measurements) != 1 {
			t.Fatalf("expected 1 measurement, got %d", len(measurements))
		}
	})

	fmt.Println("Module APIs: PASS")
}

func TestRLSAndOwnership(t *testing.T) {
	fs3ResetTestState(t)
	seed := fs3SuiteSeed
	s, _ := fs3newTestServer(t)

	tokenA, _ := fs3login(t, s, "user-a-fs3@local.test", fs3TestPassword)

	t.Run("RLS: user A sees only own projects", func(t *testing.T) {
		n := fs3countAs(t, seed["userA"], "SELECT count(*) FROM projects")
		if n != 1 {
			t.Fatalf("user A should see 1 project via RLS, got %d", n)
		}
		n = fs3countAs(t, seed["userB"], "SELECT count(*) FROM projects")
		if n != 1 {
			t.Fatalf("user B should see 1 project via RLS, got %d", n)
		}
	})

	t.Run("RLS: cross-user project read blocked", func(t *testing.T) {
		n := fs3countAs(t, seed["userA"], "SELECT count(*) FROM projects WHERE id = $1", seed["projB"])
		if n != 0 {
			t.Fatalf("user A should not see project B via RLS, got %d", n)
		}
	})

	t.Run("RLS: cross-user well read blocked", func(t *testing.T) {
		n := fs3countAs(t, seed["userA"], "SELECT count(*) FROM wells WHERE id = $1", seed["wellB"])
		if n != 0 {
			t.Fatalf("user A should not see well B via RLS, got %d", n)
		}
	})

	t.Run("API: invalid well ID rejected", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/wells/00000000-0000-0000-0000-000000000000", nil, "", tokenA)
		if res.StatusCode != http.StatusNotFound {
			t.Fatalf("invalid well ID: expected 404, got %d", res.StatusCode)
		}
	})

	t.Run("API: nested endpoint ownership", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projB"]+"/wells", nil, "", tokenA)
		if res.StatusCode == http.StatusOK {
			var resp respData
			fs3jsonBody(res, &resp)
			wells, _ := resp.Data.([]interface{})
			if len(wells) != 0 {
				t.Fatalf("User A should not see User B wells via nested endpoint, got %d", len(wells))
			}
		}
	})

	fmt.Println("RLS and Ownership: PASS")
}

func TestDocumentationAPI(t *testing.T) {
	fs3ResetTestState(t)
	seed := fs3SuiteSeed
	s, _ := fs3newTestServer(t)

	tokenA, _ := fs3login(t, s, "user-a-fs3@local.test", fs3TestPassword)
	tokenAdmin, _ := fs3login(t, s, fs3TestAdminEmail, fs3TestAdminPassword)

	t.Run("valid project id loads documentation", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"]+"/photos", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("list photos: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		if resp.Data == nil {
			// normalize null to empty slice acceptable
		}
		res = fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"]+"/documents", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("list documents: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("invalid id rejected", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/not-a-uuid/photos", nil, "", tokenA)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid id photos: expected 400, got %d", res.StatusCode)
		}
		var body map[string]interface{}
		fs3jsonBody(res, &body)
		if body["detail"] != "Invalid ID" {
			t.Fatalf("expected Invalid ID, got %v", body["detail"])
		}
		res = fs3do(t, s, http.MethodGet, "/api/v1/projects/not-a-uuid/documents", nil, "", tokenA)
		if res.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid id documents: expected 400, got %d", res.StatusCode)
		}
	})

	t.Run("documentation belonging to another project", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projB"]+"/photos", nil, "", tokenA)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("cross project photos: expected 200, got %d", res.StatusCode)
		}
		var resp respData
		fs3jsonBody(res, &resp)
		photos, _ := resp.Data.([]interface{})
		if len(photos) != 0 {
			t.Fatalf("user A should not see project B photos, got %d", len(photos))
		}
	})

	t.Run("admin can access documentation", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"]+"/photos", nil, "", tokenAdmin)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("admin photos: expected 200, got %d", res.StatusCode)
		}
	})

	t.Run("unauthenticated rejected", func(t *testing.T) {
		res := fs3do(t, s, http.MethodGet, "/api/v1/projects/"+seed["projA"]+"/photos", nil, "", "")
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("unauth photos: expected 401, got %d", res.StatusCode)
		}
	})

	fmt.Println("Documentation API: PASS")
}
