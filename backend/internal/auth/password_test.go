package auth

import (
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	params := DefaultParams()
	password := "SecurePass123!"

	encoded, err := HashPassword(password, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if encoded == "" {
		t.Fatal("encoded hash should not be empty")
	}

	if encoded == password {
		t.Fatal("encoded hash should not equal plain password")
	}

	valid, err := VerifyPassword(password, encoded)
	if err != nil {
		t.Fatalf("VerifyPassword failed: %v", err)
	}

	if !valid {
		t.Fatal("valid password should verify true")
	}
}

func TestVerifyWrongPassword(t *testing.T) {
	params := DefaultParams()
	password := "SecurePass123!"
	wrongPassword := "WrongPass123!"

	encoded, err := HashPassword(password, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	valid, err := VerifyPassword(wrongPassword, encoded)
	if err != nil && err != ErrHashMismatch {
		t.Fatalf("VerifyPassword failed: %v", err)
	}

	if valid {
		t.Fatal("wrong password should verify false")
	}
}

func TestSaltUniqueness(t *testing.T) {
	params := DefaultParams()
	password := "SecurePass123!"

	hash1, err := HashPassword(password, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	hash2, err := HashPassword(password, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if hash1 == hash2 {
		t.Fatal("two hashes of same password should differ due to random salt")
	}
}

func TestInvalidHashFormat(t *testing.T) {
	_, err := VerifyPassword("password", "invalid-hash")
	if err == nil {
		t.Fatal("expected error for invalid hash format")
	}
}

func TestNeedsRehash(t *testing.T) {
	params := DefaultParams()
	params.Memory = 32 * 1024 // different memory

	encoded, err := HashPassword("SecurePass123!", params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	currentParams := DefaultParams()
	needsRehash, err := NeedsRehash(encoded, currentParams)
	if err != nil {
		t.Fatalf("NeedsRehash failed: %v", err)
	}

	if !needsRehash {
		t.Fatal("params differ, should need rehash")
	}
}

func TestValidatePassword(t *testing.T) {
	if err := ValidatePassword("short"); err == nil {
		t.Fatal("short password should fail validation")
	}

	if err := ValidatePassword(""); err == nil {
		t.Fatal("empty password should fail validation")
	}

	if err := ValidatePassword("SecurePass123!"); err != nil {
		t.Fatalf("valid password should pass: %v", err)
	}

	longPassword := make([]byte, 200)
	for i := range longPassword {
		longPassword[i] = 'a'
	}
	if err := ValidatePassword(string(longPassword)); err == nil {
		t.Fatal("too long password should fail validation")
	}
}

func TestConstantTimeComparison(t *testing.T) {
	params := DefaultParams()
	password := "SecurePass123!"
	wrongPassword := "WrongPass123!"

	encoded, err := HashPassword(password, params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	valid1, err := VerifyPassword(password, encoded)
	if err != nil || !valid1 {
		t.Fatal("correct password should pass")
	}

	valid2, err2 := VerifyPassword(wrongPassword, encoded)
	if err2 == nil || valid2 {
		t.Fatal("wrong password should fail")
	}
}