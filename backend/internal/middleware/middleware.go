package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/logger"
)

const RequestIDKey = "request_id"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}
		c.Set(RequestIDKey, requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		l := logger.Get().WithContext(c.Request.Context())

		latency := time.Since(start)
		status := c.Writer.Status()
		clientIP := c.ClientIP()
		method := c.Request.Method
		userAgent := c.Request.UserAgent()

		if raw != "" {
			path = path + "?" + raw
		}

		fields := map[string]any{
			"method":     method,
			"path":       path,
			"status":     status,
			"latency_ms": latency.Milliseconds(),
			"client_ip":  clientIP,
			"user_agent": userAgent,
		}

		if len(c.Errors) > 0 {
			for _, e := range c.Errors {
				l.WithFields(fields).Error("request completed with errors", logger.Field("error", e.Error()))
			}
		} else if status >= 500 {
			l.WithFields(fields).Error("request completed with server error")
		} else if status >= 400 {
			l.WithFields(fields).Warn("request completed with client error")
		} else {
			l.WithFields(fields).Info("request completed")
		}
	}
}

func Recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		requestID := c.GetString(RequestIDKey)
		l := logger.Get().WithContext(c.Request.Context())

		l.Error("panic recovered",
			logger.Field("request_id", requestID),
			logger.Field("panic", recovered),
		)

		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "An unexpected error occurred",
			"instance": c.Request.URL.Path,
		})
	})
}

func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)

		done := make(chan struct{})
		go func() {
			c.Next()
			close(done)
		}()

		select {
		case <-done:
			return
		case <-ctx.Done():
			requestID := c.GetString(RequestIDKey)
			l := logger.Get().WithContext(c.Request.Context())
			l.Warn("request timeout",
				logger.Field("request_id", requestID),
				logger.Field("timeout", timeout),
			)

			c.AbortWithStatusJSON(http.StatusGatewayTimeout, gin.H{
				"type":   "https://example.com/errors/timeout",
				"title":  "Request Timeout",
				"status": 504,
				"detail": "Request took too long to process",
				"instance": c.Request.URL.Path,
			})
		}
	}
}

func BodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxBytes {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"type":   "https://example.com/errors/payload-too-large",
				"title":  "Payload Too Large",
				"status": 413,
				"detail": "Request body exceeds maximum allowed size",
				"instance": c.Request.URL.Path,
			})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'")
		c.Next()
	}
}