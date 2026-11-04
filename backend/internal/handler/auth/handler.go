package auth

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/config"
	"github.com/borewell/visualizer/backend/internal/logger"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type Handler struct {
	userRepo      *repository.UserRepo
	sessionStore  *auth.SessionStore
	cfg           *config.Config
}

func NewHandler(userRepo *repository.UserRepo, sessionStore *auth.SessionStore, cfg *config.Config) *Handler {
	return &Handler{
		userRepo:     userRepo,
		sessionStore: sessionStore,
		cfg:          cfg,
	}
}

type RegisterRequest struct {
	Email              string `json:"email" binding:"required"`
	Password           string `json:"password" binding:"required"`
	PasswordConfirmation string `json:"password_confirmation" binding:"required"`
	FullName           string `json:"full_name" binding:"required,min=1,max=100"`
}

type RegisterResponse struct {
	User  UserResponse `json:"user"`
	Meta  MetaResponse `json:"meta"`
}

type UserResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type MetaResponse struct {
	Message string `json:"message,omitempty"`
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": "Invalid request body",
			"errors": []gin.H{{"field": "body", "code": "invalid", "message": err.Error()}},
		})
		return
	}

	if req.Password != req.PasswordConfirmation {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": "Passwords do not match",
			"errors": []gin.H{{"field": "password_confirmation", "code": "mismatch", "message": "Passwords do not match"}},
		})
		return
	}

	if err := auth.ValidatePassword(req.Password); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": err.Error(),
			"errors": []gin.H{{"field": "password", "code": "weak", "message": err.Error()}},
		})
		return
	}

	email := normalizeEmail(req.Email)

	params := auth.DefaultParams()
	if h.cfg.Argon2Time > 0 {
		params.Time = h.cfg.Argon2Time
	}
	if h.cfg.Argon2Memory > 0 {
		params.Memory = h.cfg.Argon2Memory
	}
	if h.cfg.Argon2Threads > 0 {
		params.Threads = h.cfg.Argon2Threads
	}
	if h.cfg.Argon2KeyLen > 0 {
		params.KeyLen = h.cfg.Argon2KeyLen
	}

	passwordHash, err := auth.HashPassword(req.Password, params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to process password",
		})
		return
	}

	user := &repository.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: passwordHash,
		FullName:     req.FullName,
		Role:         "user",
		Status:       "pending",
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}

	if err := h.userRepo.Create(c.Request.Context(), user); err != nil {
		if err == repository.ErrEmailExists {
			c.JSON(http.StatusConflict, gin.H{
				"type":   "https://example.com/errors/conflict",
				"title":  "Conflict",
				"status": 409,
				"detail": "Registration failed",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to create user",
		})
		return
	}

	c.JSON(http.StatusCreated, RegisterResponse{
		User: UserResponse{
			ID:        user.ID,
			Email:     user.Email,
			FullName:  user.FullName,
			Role:      user.Role,
			Status:    user.Status,
			CreatedAt: user.CreatedAt,
		},
		Meta: MetaResponse{Message: "Registration submitted. Awaiting admin approval."},
	})
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	User         UserResponse `json:"user"`
	AccessToken  string       `json:"access_token"`
	TokenType    string       `json:"token_type"`
	ExpiresIn    int64        `json:"expires_in"`
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": "Invalid request body",
		})
		return
	}

	email := normalizeEmail(req.Email)

	user, err := h.userRepo.GetByEmail(c.Request.Context(), email)
	if err != nil {
		if err == repository.ErrUserNotFound {
			h.genericUnauthorized(c)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Login failed",
		})
		return
	}

	params := auth.DefaultParams()
	if h.cfg.Argon2Time > 0 {
		params.Time = h.cfg.Argon2Time
	}
	if h.cfg.Argon2Memory > 0 {
		params.Memory = h.cfg.Argon2Memory
	}
	if h.cfg.Argon2Threads > 0 {
		params.Threads = h.cfg.Argon2Threads
	}
	if h.cfg.Argon2KeyLen > 0 {
		params.KeyLen = h.cfg.Argon2KeyLen
	}

	valid, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !valid {
		h.genericUnauthorized(c)
		return
	}

	switch user.Status {
	case "pending":
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Account Pending Approval",
			"status": 403,
			"detail": "Your account is pending admin approval. Please wait for an administrator to approve your registration.",
		})
		return
	case "rejected":
		reason := "Your registration was rejected."
		if user.RejectionReason != nil {
			reason = "Your registration was rejected: " + *user.RejectionReason
		}
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Account Rejected",
			"status": 403,
			"detail": reason,
		})
		return
	case "suspended":
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Account Suspended",
			"status": 403,
			"detail": "Your account has been suspended. Please contact an administrator.",
		})
		return
	case "approved":
		// Allow login to proceed
	default:
		h.genericUnauthorized(c)
		return
	}

	accessTokenExpiry := 15 * time.Minute
	accessToken, err := auth.GenerateAccessToken(
		user.ID, user.Email, user.Role, user.Status,
		h.cfg.JWTSecret, accessTokenExpiry,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to generate access token",
		})
		return
	}

	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to generate refresh token",
		})
		return
	}

	refreshTokenHash := auth.HashRefreshToken(refreshToken)
	refreshExpiry := 30 * 24 * time.Hour

	sessionData, err := auth.CreateRefreshTokenData(user.ID, refreshExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to create session",
		})
		return
	}

	session := &auth.Session{
		ID:           sessionData.SessionID,
		UserID:       user.ID,
		TokenHash:    refreshTokenHash,
		UserAgent:    c.Request.UserAgent(),
		IP:           c.ClientIP(),
		ExpiresAt:    sessionData.ExpiresAt,
		TokenFamily:  sessionData.TokenFamily,
		CreatedAt:    time.Now().UTC(),
	}

	if err := h.sessionStore.Create(c.Request.Context(), session); err != nil {
		logger.Error("failed to create session", logger.Field("error", err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to create session",
		})
		return
	}

	setRefreshCookie(c, refreshToken, refreshExpiry, h.cfg.AppEnv == "production")

	c.JSON(http.StatusOK, LoginResponse{
		User: UserResponse{
			ID:        user.ID,
			Email:     user.Email,
			FullName:  user.FullName,
			Role:      user.Role,
			Status:    user.Status,
			CreatedAt: user.CreatedAt,
		},
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(accessTokenExpiry.Seconds()),
	})
}

func (h *Handler) Logout(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err == nil && refreshToken != "" {
		tokenHash := auth.HashRefreshToken(refreshToken)
		if session, err := h.sessionStore.GetByTokenHash(c.Request.Context(), tokenHash); err == nil {
			h.sessionStore.Revoke(c.Request.Context(), session.ID)
		}
	}

	clearRefreshCookie(c, h.cfg.AppEnv == "production")

	c.JSON(http.StatusOK, gin.H{
		"data": nil,
		"meta": gin.H{"message": "Logged out successfully"},
	})
}

type RefreshResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

func (h *Handler) Refresh(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil || refreshToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "Refresh token required",
		})
		return
	}

	tokenHash := auth.HashRefreshToken(refreshToken)

	newRefreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to generate refresh token",
		})
		return
	}
	newRefreshTokenHash := auth.HashRefreshToken(newRefreshToken)
	newExpiry := time.Now().UTC().Add(30 * 24 * time.Hour)

	newSession, err := h.sessionStore.AtomicRotate(c.Request.Context(), tokenHash, newRefreshTokenHash, newExpiry)
	if err != nil {
		switch err {
		case auth.ErrSessionNotFound:
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": "Invalid refresh token",
			})
		case auth.ErrSessionRevoked:
			h.sessionStore.RevokeFamily(c.Request.Context(), "", uuid.Nil)
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": "Token reuse detected, session revoked",
			})
		case auth.ErrSessionExpired:
			c.JSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": "Refresh token expired",
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"type":   "https://example.com/errors/internal-error",
				"title":  "Internal Server Error",
				"status": 500,
				"detail": "Failed to refresh token",
			})
		}
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), newSession.UserID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "User not found",
		})
		return
	}

	if user.Status != "approved" {
		h.sessionStore.Revoke(c.Request.Context(), newSession.ID)
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Forbidden",
			"status": 403,
			"detail": "Account not active",
		})
		return
	}

	accessTokenExpiry := 15 * time.Minute
	accessToken, err := auth.GenerateAccessToken(
		user.ID, user.Email, user.Role, user.Status,
		h.cfg.JWTSecret, accessTokenExpiry,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to generate access token",
		})
		return
	}

	refreshExpiry := time.Until(newExpiry)
	if refreshExpiry < 0 {
		refreshExpiry = 30 * 24 * time.Hour
	}
	setRefreshCookie(c, newRefreshToken, refreshExpiry, h.cfg.AppEnv == "production")

	c.JSON(http.StatusOK, RefreshResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(accessTokenExpiry.Seconds()),
	})
}

type MeResponse struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	FullName  string     `json:"full_name"`
	Role      string     `json:"role"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	ApprovedAt *time.Time `json:"approved_at,omitempty"`
}

func (h *Handler) Me(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "User not authenticated",
		})
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"type":   "https://example.com/errors/not-found",
			"title":  "Not Found",
			"status": 404,
			"detail": "User not found",
		})
		return
	}

	resp := MeResponse{
		ID:        user.ID,
		Email:     user.Email,
		FullName:  user.FullName,
		Role:      user.Role,
		Status:    user.Status,
		CreatedAt: user.CreatedAt,
	}
	if user.ApprovedAt != nil {
		resp.ApprovedAt = user.ApprovedAt
	}

	c.JSON(http.StatusOK, gin.H{"data": resp})
}

func (h *Handler) genericUnauthorized(c *gin.Context) {
	c.JSON(http.StatusUnauthorized, gin.H{
		"type":   "https://example.com/errors/unauthenticated",
		"title":  "Unauthenticated",
		"status": 401,
		"detail": "Invalid credentials",
	})
}

func normalizeEmail(email string) string {
	return email
}

func setRefreshCookie(c *gin.Context, token string, expiry time.Duration, isProduction bool) {
	secure := isProduction
	sameSite := "Lax"
	domain := ""
	if isProduction {
		sameSite = "None" // Required for cross-site cookies in production with Secure
	} else {
		domain = "localhost" // Development: share cookie across localhost ports
	}

	// Build cookie manually to avoid duplicate SameSite (gin v1.10 doesn't support SameSite param)
	cookie := fmt.Sprintf("refresh_token=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=%s", token, int(expiry.Seconds()), sameSite)
	if domain != "" {
		cookie += "; Domain=" + domain
	}
	if secure {
		cookie += "; Secure"
	}
	c.Header("Set-Cookie", cookie)
}

func clearRefreshCookie(c *gin.Context, isProduction bool) {
	secure := isProduction
	sameSite := "Lax"
	domain := ""
	if isProduction {
		sameSite = "None"
	} else {
		domain = "localhost" // Development: match cookie creation domain
	}

	cookie := fmt.Sprintf("refresh_token=; Path=/; Max-Age=-1; HttpOnly; SameSite=%s", sameSite)
	if domain != "" {
		cookie += "; Domain=" + domain
	}
	if secure {
		cookie += "; Secure"
	}
	c.Header("Set-Cookie", cookie)
}