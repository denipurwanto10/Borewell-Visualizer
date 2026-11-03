package middleware

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

// Protect menambahkan laver CSRF tambahan di luar SameSite=Lax untuk endpoint
// yang bergantung pada cookie (refresh, logout). SameSite=Lax tidak mencegah
// permintaan POST tingkat atas lintas origin yang tetap membawa cookie (mis. dari
// formulir HTML), sehingga Origin/Referer divalidasi.
//
// Permintaan yang menyertakan Origin/Referer lintas origin ditolak. Permintaan
// tanpa header Origin/Referer (klien non-browser atau same-origin) diizinkan.
func Protect() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		origin := c.Request.Header.Get("Origin")
		if origin == "" {
			origin = c.Request.Header.Get("Referer")
		}

		// Tanpa header Origin/Referer, anggap same-origin / klien non-browser.
		if origin == "" {
			c.Next()
			return
		}

		parsed, err := url.Parse(origin)
		if err != nil || parsed.Host == "" {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
				"type":   "https://example.com/errors/invalid-request",
				"title":  "Invalid Request",
				"status": 400,
				"detail": "Invalid Origin/Referer header",
			})
			return
		}

		scheme := "http"
		if c.Request.TLS != nil {
			scheme = "https"
		}
		if proto := c.GetHeader("X-Forwarded-Proto"); proto != "" {
			scheme = proto
		}
		expected := scheme + "://" + c.Request.Host

		if parsed.Scheme == "" {
			parsed.Scheme = scheme
		}
		if expected != parsed.Scheme+"://"+parsed.Host {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"type":   "https://example.com/errors/forbidden",
				"title":  "Forbidden",
				"status": 403,
				"detail": "Cross-origin request not allowed",
			})
			return
		}
		c.Next()
	}
}
