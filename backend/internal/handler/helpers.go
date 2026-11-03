package handler

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

func errorResponse(typ, title string, status int, detail, instance string) gin.H {
	return gin.H{
		"type":     typ,
		"title":    title,
		"status":   status,
		"detail":   detail,
		"instance": instance,
	}
}

func validationErrorResponse(title string, fieldErrors []gin.H, instance string) gin.H {
	return gin.H{
		"type":     "https://example.com/errors/validation-failed",
		"title":    title,
		"status":   422,
		"detail":   "One or more fields failed validation",
		"instance": instance,
		"errors":   fieldErrors,
	}
}

func parseTimeOrNil(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, err = time.Parse("2006-01-02", s)
		if err != nil {
			return nil
		}
	}
	return &t
}

func ginErrors(err error) []gin.H {
	errors := []gin.H{}
	if validationErrors, ok := err.(validator.ValidationErrors); ok {
		for _, e := range validationErrors {
			errors = append(errors, gin.H{
				"field":   e.Field(),
				"code":    e.Tag(),
				"message": e.Translate(nil),
			})
		}
	} else {
		errors = append(errors, gin.H{
			"field":   "body",
			"code":    "invalid",
			"message": err.Error(),
		})
	}
	return errors
}
