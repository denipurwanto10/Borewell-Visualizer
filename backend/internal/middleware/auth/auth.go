package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/config"
)

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": "Authorization header required",
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": "Invalid authorization header format",
			})
			return
		}

		tokenString := parts[1]
		claims, err := auth.ParseAccessToken(tokenString, cfg.JWTSecret)
		if err != nil {
			var detail string
			switch err {
			case auth.ErrTokenExpired:
				detail = "Access token expired"
			case auth.ErrInvalidAlgorithm:
				detail = "Invalid token algorithm"
			default:
				detail = "Invalid access token"
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"type":   "https://example.com/errors/unauthenticated",
				"title":  "Unauthenticated",
				"status": 401,
				"detail": detail,
			})
			return
		}

		if claims.Status != "approved" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"type":   "https://example.com/errors/forbidden",
				"title":  "Forbidden",
				"status": 403,
				"detail": "Account not active",
			})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_role", claims.Role)
		c.Set("user_status", claims.Status)
		c.Next()
	}
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("user_role")
		if !exists || role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"type":   "https://example.com/errors/forbidden",
				"title":  "Forbidden",
				"status": 403,
				"detail": "Admin access required",
			})
			return
		}
		c.Next()
	}
}

func OptionalAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.Next()
			return
		}

		tokenString := parts[1]
		claims, err := auth.ParseAccessToken(tokenString, cfg.JWTSecret)
		if err != nil {
			c.Next()
			return
		}

		if claims.Status != "approved" {
			c.Next()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_role", claims.Role)
		c.Set("user_status", claims.Status)
		c.Next()
	}
}

func GetUserID(c *gin.Context) (uuid.UUID, bool) {
	id, exists := c.Get("user_id")
	if !exists {
		return uuid.Nil, false
	}
	return id.(uuid.UUID), true
}

func GetUserRole(c *gin.Context) (string, bool) {
	role, exists := c.Get("user_role")
	if !exists {
		return "", false
	}
	return role.(string), true
}