package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGenerateAccessToken(t *testing.T) {
	userID := uuid.New()
	token, err := GenerateAccessToken(
		userID, "test@example.com", "user", "approved",
		"test-secret-key-at-least-32-chars", 15*time.Minute,
	)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	if token == "" {
		t.Fatal("token should not be empty")
	}
}

func TestParseAccessToken(t *testing.T) {
	userID := uuid.New()
	secret := "test-secret-key-at-least-32-chars"

	token, err := GenerateAccessToken(
		userID, "test@example.com", "user", "approved", secret, 15*time.Minute,
	)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	claims, err := ParseAccessToken(token, secret)
	if err != nil {
		t.Fatalf("ParseAccessToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Fatal("user ID mismatch")
	}
	if claims.Email != "test@example.com" {
		t.Fatal("email mismatch")
	}
	if claims.Role != "user" {
		t.Fatal("role mismatch")
	}
	if claims.Status != "approved" {
		t.Fatal("status mismatch")
	}
}

func TestParseAccessTokenInvalidAlgorithm(t *testing.T) {
	token := "invalid.token.string"
	_, err := ParseAccessToken(token, "test-secret-key-at-least-32-chars")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}

func TestParseAccessTokenExpired(t *testing.T) {
	userID := uuid.New()
	secret := "test-secret-key-at-least-32-chars"

	token, err := GenerateAccessToken(
		userID, "test@example.com", "user", "approved", secret, -time.Second,
	)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	_, err = ParseAccessToken(token, secret)
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	token, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	if len(token) != 64 { // 32 bytes hex = 64 chars
		t.Fatalf("refresh token should be 64 chars, got %d", len(token))
	}

	token2, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	if token == token2 {
		t.Fatal("two refresh tokens should differ")
	}
}

func TestHashRefreshToken(t *testing.T) {
	token := "test-refresh-token-value"
	hash1 := HashRefreshToken(token)
	hash2 := HashRefreshToken(token)

	if hash1 != hash2 {
		t.Fatal("same token should produce same hash")
	}

	if len(hash1) != 64 { // SHA-256 hex = 64 chars
		t.Fatalf("hash should be 64 chars, got %d", len(hash1))
	}

	otherHash := HashRefreshToken("different-token")
	if hash1 == otherHash {
		t.Fatal("different tokens should produce different hashes")
	}
}

func TestCreateRefreshTokenData(t *testing.T) {
	userID := uuid.New()
	data, err := CreateRefreshTokenData(userID, 30*24*time.Hour)
	if err != nil {
		t.Fatalf("CreateRefreshTokenData failed: %v", err)
	}

	if data.UserID != userID {
		t.Fatal("user ID mismatch")
	}
	if data.TokenFamily == "" {
		t.Fatal("token family should not be empty")
	}
	if data.ExpiresAt.Before(time.Now().UTC()) {
		t.Fatal("expires at should be in the future")
	}
}