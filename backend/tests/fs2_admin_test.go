package tests_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func adminPost(t *testing.T, s *httptestServer, accessToken, path string, body interface{}) (int, string) {
	t.Helper()
	var r io.Reader = nil
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		r = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(http.MethodPost, s.URL()+path, r)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := s.client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	var m jsonMap
	status := ""
	if json.Unmarshal(raw, &m) == nil {
		if st, ok := m["status"]; ok {
			if s2, ok := st.(string); ok {
				status = s2
			}
		}
		if status == "" {
			if d, ok := m["data"].(map[string]interface{}); ok {
				if st2, ok := d["status"]; ok {
					if s2, ok := st2.(string); ok {
						status = s2
					}
				}
			}
		}
	}
	if status != "" {
		return res.StatusCode, status
	}
	return res.StatusCode, string(raw)
}

func TestAdminEndpoints(t *testing.T) {
	resetTestState(t)
	seed := suiteSeed
	s, _ := newTestServer(t)

	adminLR, _ := login(t, s, testAdminEmail, testAdminPassword)
	userALR, userACookie := login(t, s, "user-a-fs2@local.test", testPassword)

	// ---- 1. Approve PENDING user (pending1) ----
	code, status := adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.pending1.String()+"/approve", nil)
	if code != http.StatusOK || status != "approved" {
		t.Fatalf("approve pending1: expected 200/approved, got %d/%s", code, status)
	}

	// ---- 2. Reject PENDING user (pending2) dengan reason ----
	code, status = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.pending2.String()+"/reject", map[string]string{"reason": "tidak memenuhi syarat"})
	if code != http.StatusOK || status != "rejected" {
		t.Fatalf("reject pending2: expected 200/rejected, got %d/%s", code, status)
	}

	// Reject tanpa reason harus 422.
	code, _ = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.pending1.String()+"/reject", map[string]string{})
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("reject without reason: expected 422, got %d", code)
	}

	// ---- 3. Suspend APPROVED user (user A) dengan reason ----
	code, status = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.userAID.String()+"/suspend", map[string]string{"reason": "pelanggaran kebijakan"})
	if code != http.StatusOK || status != "suspended" {
		t.Fatalf("suspend user A: expected 200/suspended, got %d/%s", code, status)
	}

	// Suspend tanpa reason harus 422.
	code, _ = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.userBID.String()+"/suspend", map[string]string{})
	if code != http.StatusUnprocessableEntity {
		t.Fatalf("suspend without reason: expected 422, got %d", code)
	}

	// ---- 4. User biasa tidak dapat mengakses admin endpoint ----
	code, _ = adminPost(t, s, userALR.AccessToken, "/api/v1/admin/users/"+seed.userBID.String()+"/approve", nil)
	if code != http.StatusForbidden {
		t.Fatalf("normal user admin access: expected 403, got %d", code)
	}

	// ---- 5. Admin tidak dapat self-suspend ----
	code, _ = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.adminID.String()+"/suspend", map[string]string{"reason": "self"})
	if code != http.StatusForbidden {
		t.Fatalf("admin self-suspend: expected 403, got %d", code)
	}

	// ---- 6. Unsuspend user A (kembali ke approved) ----
	code, status = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.userAID.String()+"/unsuspend", nil)
	if code != http.StatusOK || status != "approved" {
		t.Fatalf("unsuspend user A: expected 200/approved, got %d/%s", code, status)
	}

	// ---- 7. Session user yang di-suspend dicabut ----
	code, _ = adminPost(t, s, adminLR.AccessToken, "/api/v1/admin/users/"+seed.userAID.String()+"/suspend", map[string]string{"reason": "uji cabut session"})
	if code != http.StatusOK {
		t.Fatalf("suspend user A (2): expected 200, got %d", code)
	}
	_, newCookie := refresh(t, s, userACookie)
	if newCookie != "" {
		t.Fatalf("refresh after suspend should be revoked, got new cookie")
	}

	// ---- 8. User dengan status tidak aktif tidak dapat login atau refresh ----
	rejRes := postAuth(t, s, "/api/v1/auth/login", "pending2-fs2@local.test", testPassword)
	if rejRes.StatusCode != http.StatusForbidden {
		t.Fatalf("rejected user login: expected 403, got %d", rejRes.StatusCode)
	}
	susRes := postAuth(t, s, "/api/v1/auth/login", "user-a-fs2@local.test", testPassword)
	if susRes.StatusCode != http.StatusForbidden {
		t.Fatalf("suspended user login: expected 403, got %d", susRes.StatusCode)
	}

	t.Logf("admin endpoints: PASS")
}
