package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrTokenExpired     = errors.New("token expired")
	ErrInvalidAlgorithm = errors.New("unexpected signing algorithm")
	ErrInvalidClaims    = errors.New("invalid token claims")
)

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}

type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Role   string    `json:"role"`
	Status string    `json:"status"`
	jwt.RegisteredClaims
}

type RefreshTokenClaims struct {
	UserID       uuid.UUID `json:"user_id"`
	SessionID    uuid.UUID `json:"session_id"`
	TokenFamily  string    `json:"token_family"`
	jwt.RegisteredClaims
}

func GenerateAccessToken(userID uuid.UUID, email, role, status, secret string, expiry time.Duration) (string, error) {
	now := time.Now().UTC()
	claims := Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		Status: status,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "borewell-visualizer",
			Subject:   userID.String(),
			Audience:  jwt.ClaimStrings{"borewell-api"},
			ExpiresAt: jwt.NewNumericDate(now.Add(expiry)),
			NotBefore: jwt.NewNumericDate(now),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func GenerateRefreshToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func HashRefreshToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func ParseAccessToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidAlgorithm
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidClaims
	}

	if claims.Issuer != "borewell-visualizer" {
		return nil, ErrInvalidClaims
	}

	return claims, nil
}

func GenerateTokenFamily() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

type RefreshTokenData struct {
	UserID      uuid.UUID
	SessionID   uuid.UUID
	TokenFamily string
	ExpiresAt   time.Time
}

func CreateRefreshTokenData(userID uuid.UUID, expiry time.Duration) (RefreshTokenData, error) {
	sessionID := uuid.New()
	tokenFamily, err := GenerateTokenFamily()
	if err != nil {
		return RefreshTokenData{}, err
	}

	return RefreshTokenData{
		UserID:      userID,
		SessionID:   sessionID,
		TokenFamily: tokenFamily,
		ExpiresAt:   time.Now().UTC().Add(expiry),
	}, nil
}