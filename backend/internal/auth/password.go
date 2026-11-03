package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argon2Time    = 3
	argon2Memory  = 64 * 1024 // 64 MB in KB
	argon2Threads = 4
	argon2KeyLen  = 32
	saltLength    = 16
)

var (
	ErrInvalidHashFormat = errors.New("invalid hash format")
	ErrHashMismatch      = errors.New("password hash mismatch")
)

type Argon2Params struct {
	Time    uint32
	Memory  uint32
	Threads uint8
	KeyLen  uint32
}

func DefaultParams() Argon2Params {
	return Argon2Params{
		Time:    argon2Time,
		Memory:  argon2Memory,
		Threads: argon2Threads,
		KeyLen:  argon2KeyLen,
	}
}

func HashPassword(password string, params Argon2Params) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate salt: %w", err)
	}

	hash := argon2.IDKey(
		[]byte(password),
		salt,
		params.Time,
		params.Memory,
		params.Threads,
		params.KeyLen,
	)

	encoded := fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		params.Memory, params.Time, params.Threads,
		hex.EncodeToString(salt),
		hex.EncodeToString(hash),
	)

	return encoded, nil
}

func VerifyPassword(password, encodedHash string) (bool, error) {
	params, salt, hash, err := decodeHash(encodedHash)
	if err != nil {
		return false, err
	}

	computedHash := argon2.IDKey(
		[]byte(password),
		salt,
		params.Time,
		params.Memory,
		params.Threads,
		params.KeyLen,
	)

	if subtle.ConstantTimeCompare(hash, computedHash) == 1 {
		return true, nil
	}

	return false, ErrHashMismatch
}

func NeedsRehash(encodedHash string, currentParams Argon2Params) (bool, error) {
	params, _, _, err := decodeHash(encodedHash)
	if err != nil {
		return false, err
	}

	return params.Time != currentParams.Time ||
		params.Memory != currentParams.Memory ||
		params.Threads != currentParams.Threads ||
		params.KeyLen != currentParams.KeyLen, nil
}

func decodeHash(encodedHash string) (Argon2Params, []byte, []byte, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return Argon2Params{}, nil, nil, ErrInvalidHashFormat
	}

	var params Argon2Params
	_, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &params.Memory, &params.Time, &params.Threads)
	if err != nil {
		return Argon2Params{}, nil, nil, fmt.Errorf("parse params: %w", err)
	}

	params.KeyLen = argon2KeyLen

	salt, err := hex.DecodeString(parts[4])
	if err != nil {
		return Argon2Params{}, nil, nil, fmt.Errorf("decode salt: %w", err)
	}

	hash, err := hex.DecodeString(parts[5])
	if err != nil {
		return Argon2Params{}, nil, nil, fmt.Errorf("decode hash: %w", err)
	}

	return params, salt, hash, nil
}

func ValidatePassword(password string) error {
	if len(password) < 12 {
		return errors.New("password must be at least 12 characters")
	}
	if len(password) > 128 {
		return errors.New("password must not exceed 128 characters")
	}
	return nil
}