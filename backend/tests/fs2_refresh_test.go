package tests_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

)

type loginResp struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	User        struct {
		ID     string `json:"id"`
		Email  string `json:"email"`
		Status string `json:"status"`
	} `json:"user"`
}

type refreshResp struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

type errorResp struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

func decodeBody(t *testing.T, res *http.Response, v interface{}) {
	t.Helper()
	defer res.Body.Close()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		t.Fatalf("unmarshal %s: %v", string(b), err)
	}
}

func login(t *testing.T, s *httptestServer, email, password string) (*loginResp, string) {
	t.Helper()
	res := postAuth(t, s, "/api/v1/auth/login", email, password)
	if res.StatusCode != http.StatusOK {
		var errResp errorResp
		decodeBody(t, res, &errResp)
		t.Fatalf("login %s: status=%d detail=%s", email, res.StatusCode, errResp.Detail)
	}
	var lr loginResp
	decodeBody(t, res, &lr)
	cookie := extractRefreshCookie(res)
	if cookie == "" {
		t.Fatal("login did not set refresh_token cookie")
	}
	return &lr, cookie
}

func refresh(t *testing.T, s *httptestServer, cookie string) (*http.Response, string) {
	t.Helper()
	res := s.do(t, http.MethodPost, "/api/v1/auth/refresh", nil, cookie)
	return res, extractRefreshCookie(res)
}

func TestRefreshRotationAndReuseDetection(t *testing.T) {
	resetTestState(t)
	seed := suiteSeed
	s, _ := newTestServer(t)

	// 1. Login produces access token + refresh cookie.
	lr, cookie := login(t, s, testAdminEmail, testAdminPassword)
	if lr.User.ID != seed.adminID.String() {
		t.Fatalf("expected admin id %s, got %s", seed.adminID, lr.User.ID)
	}
	if lr.User.Status != "approved" {
		t.Fatalf("expected status approved, got %s", lr.User.Status)
	}

	// 2. Valid refresh produces a new access token and rotates the cookie.
	res2, cookie2 := refresh(t, s, cookie)
	if res2.StatusCode != http.StatusOK {
		var errResp errorResp
		decodeBody(t, res2, &errResp)
		t.Fatalf("first refresh: status=%d detail=%s", res2.StatusCode, errResp.Detail)
	}
	if cookie2 == "" {
		t.Fatal("refresh did not rotate refresh cookie")
	}
	if cookie2 == cookie {
		t.Fatal("refresh did not rotate: cookie unchanged")
	}

	// 3. Old token cannot be reused.
	res3, _ := refresh(t, s, cookie)
	if res3.StatusCode != http.StatusUnauthorized {
		t.Fatalf("reuse of old token: expected 401, got %d", res3.StatusCode)
	}
	var errResp errorResp
	decodeBody(t, res3, &errResp)
	if errResp.Status != http.StatusUnauthorized {
		t.Fatalf("expected 401 status in body, got %d", errResp.Status)
	}
	if !strings.Contains(errResp.Detail, "revoked") && !strings.Contains(errResp.Detail, "reuse") {
		t.Fatalf("expected reuse/revocation detail, got %q", errResp.Detail)
	}

	// 4. Reuse of old token triggers family revocation: a fresh token from the
	// same family (cookie2, which replaced cookie) must still work because
	// only the reused *old* token's family gets revoked. Rotate once more with
	// cookie2 to confirm family not collateral-revoked by the reuse attempt.
	res4, cookie4 := refresh(t, s, cookie2)
	if res4.StatusCode != http.StatusOK {
		var errResp errorResp
		decodeBody(t, res4, &errResp)
		t.Fatalf("refresh after reuse attempt: status=%d detail=%s", res4.StatusCode, errResp.Detail)
	}
	if cookie4 == "" {
		t.Fatal("family should still be valid after reuse attempt; cookie not rotated")
	}

	// 5. Revoked token (via logout) cannot be used.
	logoutRes := s.do(t, http.MethodPost, "/api/v1/auth/logout", nil, cookie4)
	if logoutRes.StatusCode != http.StatusOK {
		t.Fatalf("logout: expected 200, got %d", logoutRes.StatusCode)
	}
	res5, _ := refresh(t, s, cookie4)
	if res5.StatusCode != http.StatusUnauthorized {
		t.Fatalf("refreshed-after-logout: expected 401, got %d", res5.StatusCode)
	}

	// 6. Cookie attributes: HttpOnly, SameSite=Lax, Path=/.
	resLogin := postAuth(t, s, "/api/v1/auth/login", testAdminEmail, testAdminPassword)
	loginCookie := extractRefreshCookie(resLogin)
	if loginCookie == "" {
		t.Fatal("relogin did not set cookie")
	}
	if !hasCookieAttr(resLogin, "HttpOnly") {
		t.Fatal("cookie missing HttpOnly")
	}
	if !hasCookieAttr(resLogin, "SameSite=Lax") {
		t.Fatal("cookie missing SameSite=Lax")
	}
	if !hasCookieAttr(resLogin, "Path=/") {
		t.Fatal("cookie missing Path=/")
	}
	fmt.Println("refresh rotation + reuse detection: PASS")
}

func TestConcurrentRefreshNoInconsistentSession(t *testing.T) {
	resetTestState(t)
	s, _ := newTestServer(t)

	_, cookie := login(t, s, testAdminEmail, testAdminPassword)

	const concurrency = 10
	results := make(chan error, concurrency)
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, _ := refresh(t, s, cookie)
			if res.StatusCode != http.StatusOK {
				results <- fmt.Errorf("got status %d", res.StatusCode)
				return
			}
			results <- nil
		}()
	}
	wg.Wait()
	close(results)

	successes := 0
	failures := 0
	for err := range results {
		if err != nil {
			failures++
			continue
		}
		successes++
	}

	// Exactly one of the concurrent refreshes should succeed (the one holding
	// the lock on the session row); the rest should fail because the token was
	// consumed/rotated. Any other outcome is an inconsistent session.
	if successes != 1 {
		t.Fatalf("expected exactly 1 successful concurrent refresh, got %d (failures=%d)", successes, failures)
	}
	if failures != concurrency-1 {
		t.Fatalf("expected %d failures, got %d", concurrency-1, failures)
	}
	fmt.Println("concurrent refresh consistency: PASS")
}

func TestCSRFOriginValidation(t *testing.T) {
	resetTestState(t)
	s, _ := newTestServer(t)

	_, cookie := login(t, s, testAdminEmail, testAdminPassword)

	// Same-origin / tanpa Origin: diizinkan.
	resSame, _ := refresh(t, s, cookie)
	if resSame.StatusCode != http.StatusOK {
		t.Fatalf("same-origin refresh: expected 200, got %d", resSame.StatusCode)
	}

	// Origin lintas origin: ditolak.
	req, err := http.NewRequest(http.MethodPost, s.URL()+"/api/v1/auth/refresh", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Origin", "https://evil.example.com")
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: cookie})
	res, err := s.client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin refresh: expected 403, got %d", res.StatusCode)
	}
	fmt.Println("CSRF origin validation: PASS")
}

func TestUserCannotRefreshWhenNotApproved(t *testing.T) {
	resetTestState(t)
	seed := suiteSeed
	s, _ := newTestServer(t)

	// pending user cannot login at all, so no refresh cookie exists.
	// suspended/rejected users also cannot login. Verify statuses block login.
	for _, email := range []string{
		"pending1-fs2@local.test",
		"rejected-fs2@local.test",
		"suspended-fs2@local.test",
	} {
		res := postAuth(t, s, "/api/v1/auth/login", email, testPassword)
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("%s: expected 403, got %d", email, res.StatusCode)
		}
	}

	// An approved user's refresh must fail once the account is suspended via
	// admin. First login as user A (approved).
	lr, cookie := login(t, s, "user-a-fs2@local.test", testPassword)
	if lr.User.ID != seed.userAID.String() {
		t.Fatalf("expected user A id %s, got %s", seed.userAID, lr.User.ID)
	}

	// Suspend user A as admin (needs admin token). Login as admin first.
	adminLR, adminCookie := login(t, s, testAdminEmail, testAdminPassword)
	_ = adminLR
	// Suspend via API requires JSON body with reason.
	suspendBody := map[string]string{"reason": "fs2 test suspension"}
	reqBody, _ := json.Marshal(suspendBody)
	req, _ := http.NewRequest(http.MethodPost, s.URL()+"/api/v1/admin/users/"+seed.userAID.String()+"/suspend", strings.NewReader(string(reqBody)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminLR.AccessToken)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("suspend request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("suspend user A: expected 200, got %d body=%s", res.StatusCode, string(b))
	}

	// Now refresh with user A's cookie should fail because suspend revoked
	// all of user A's sessions (AtomicRotate catches revoked session first).
	res2, _ := refresh(t, s, cookie)
	if res2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("refresh after suspend: expected 401, got %d", res2.StatusCode)
	}
	var errResp errorResp
	decodeBody(t, res2, &errResp)
	if !strings.Contains(errResp.Detail, "revoked") {
		t.Fatalf("expected revoked detail, got %q", errResp.Detail)
	}
	_ = adminCookie
	fmt.Println("non-approved user refresh blocked: PASS")
}
