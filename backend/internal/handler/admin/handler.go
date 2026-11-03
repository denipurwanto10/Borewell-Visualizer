package admin

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/auth"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type Handler struct {
	userRepo     *repository.UserRepo
	sessionStore *auth.SessionStore
}

func NewHandler(userRepo *repository.UserRepo, sessionStore *auth.SessionStore) *Handler {
	return &Handler{
		userRepo:     userRepo,
		sessionStore: sessionStore,
	}
}

type UserListItem struct {
	ID        uuid.UUID  `json:"id"`
	Email     string     `json:"email"`
	FullName  string     `json:"full_name"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
}

type PendingUsersResponse struct {
	Data []UserListItem `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

type MetaResponse struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

func (h *Handler) ListPending(c *gin.Context) {
	page := 1
	pageSize := 20

	if p := c.Query("page"); p != "" {
		if _, err := parseInt(p); err == nil {
			page = parseIntOrDefault(p, 1)
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if _, err := parseInt(ps); err == nil {
			pageSize = parseIntOrDefault(ps, 20)
		}
	}
	if pageSize > 100 {
		pageSize = 100
	}

	users, total, err := h.userRepo.ListPending(c.Request.Context(), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to list pending users",
		})
		return
	}

	var items []UserListItem
	for _, u := range users {
		items = append(items, UserListItem{
			ID:        u.ID,
			Email:     u.Email,
			FullName:  u.FullName,
			Status:    u.Status,
			CreatedAt: u.CreatedAt,
		})
	}

	totalPages := (total + pageSize - 1) / pageSize

	c.JSON(http.StatusOK, PendingUsersResponse{
		Data: items,
		Meta: MetaResponse{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}

type AllUsersResponse struct {
	Data []UserListItem `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

func (h *Handler) ListAll(c *gin.Context) {
	page := 1
	pageSize := 20
	status := c.Query("status")
	role := c.Query("role")

	if p := c.Query("page"); p != "" {
		page = parseIntOrDefault(p, 1)
	}
	if ps := c.Query("page_size"); ps != "" {
		pageSize = parseIntOrDefault(ps, 20)
	}
	if pageSize > 100 {
		pageSize = 100
	}

	users, total, err := h.userRepo.ListAll(c.Request.Context(), status, role, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to list users",
		})
		return
	}

	var items []UserListItem
	for _, u := range users {
		items = append(items, UserListItem{
			ID:        u.ID,
			Email:     u.Email,
			FullName:  u.FullName,
			Status:    u.Status,
			CreatedAt: u.CreatedAt,
		})
	}

	totalPages := (total + pageSize - 1) / pageSize

	c.JSON(http.StatusOK, AllUsersResponse{
		Data: items,
		Meta: MetaResponse{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}

type ApproveRequest struct{}

type ApproveResponse struct {
	ID         uuid.UUID  `json:"id"`
	Status     string     `json:"status"`
	ApprovedAt time.Time  `json:"approved_at"`
	ApprovedBy uuid.UUID  `json:"approved_by"`
}

func (h *Handler) Approve(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"type":   "https://example.com/errors/invalid-request",
			"title":  "Invalid Request",
			"status": 400,
			"detail": "Invalid user ID",
		})
		return
	}

	adminID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "Admin not authenticated",
		})
		return
	}

	targetUser, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		if err == repository.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"type":   "https://example.com/errors/not-found",
				"title":  "Not Found",
				"status": 404,
				"detail": "User not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to get user",
		})
		return
	}

	if targetUser.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{
			"type":   "https://example.com/errors/conflict",
			"title":  "Conflict",
			"status": 409,
			"detail": "User is not pending approval",
		})
		return
	}

	adminUUID := adminID.(uuid.UUID)
	if targetUser.ID == adminUUID {
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Forbidden",
			"status": 403,
			"detail": "Cannot approve yourself",
		})
		return
	}

	if err := h.userRepo.UpdateStatus(c.Request.Context(), userID, "approved", &adminUUID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to approve user",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": ApproveResponse{
			ID:         userID,
			Status:     "approved",
			ApprovedAt: time.Now().UTC(),
			ApprovedBy: adminUUID,
		},
	})
}

type RejectRequest struct {
	Reason string `json:"reason" binding:"required,max=500"`
}

type RejectResponse struct {
	ID                uuid.UUID `json:"id"`
	Status            string    `json:"status"`
	RejectionReason   string    `json:"rejection_reason"`
}

func (h *Handler) Reject(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"type":   "https://example.com/errors/invalid-request",
			"title":  "Invalid Request",
			"status": 400,
			"detail": "Invalid user ID",
		})
		return
	}

	var req RejectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": "Reason is required (max 500 characters)",
		})
		return
	}

	adminID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "Admin not authenticated",
		})
		return
	}

	targetUser, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		if err == repository.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"type":   "https://example.com/errors/not-found",
				"title":  "Not Found",
				"status": 404,
				"detail": "User not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to get user",
		})
		return
	}

	if targetUser.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{
			"type":   "https://example.com/errors/conflict",
			"title":  "Conflict",
			"status": 409,
			"detail": "User is not pending approval",
		})
		return
	}

	adminUUID := adminID.(uuid.UUID)
	if targetUser.ID == adminUUID {
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Forbidden",
			"status": 403,
			"detail": "Cannot reject yourself",
		})
		return
	}

	reason := req.Reason
	if err := h.userRepo.UpdateStatus(c.Request.Context(), userID, "rejected", nil, &reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to reject user",
		})
		return
	}

	h.sessionStore.RevokeAllUserSessions(c.Request.Context(), userID)

	c.JSON(http.StatusOK, gin.H{
		"data": RejectResponse{
			ID:              userID,
			Status:          "rejected",
			RejectionReason: reason,
		},
	})
}

type SuspendRequest struct {
	Reason string `json:"reason" binding:"required,max=500"`
}

type SuspendResponse struct {
	ID        uuid.UUID `json:"id"`
	Status    string    `json:"status"`
}

func (h *Handler) Suspend(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"type":   "https://example.com/errors/invalid-request",
			"title":  "Invalid Request",
			"status": 400,
			"detail": "Invalid user ID",
		})
		return
	}

	var req SuspendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"type":   "https://example.com/errors/validation-failed",
			"title":  "Validation Failed",
			"status": 422,
			"detail": "Reason is required (max 500 characters)",
		})
		return
	}

	adminID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "Admin not authenticated",
		})
		return
	}

	targetUser, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		if err == repository.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"type":   "https://example.com/errors/not-found",
				"title":  "Not Found",
				"status": 404,
				"detail": "User not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to get user",
		})
		return
	}

	if targetUser.Role == "admin" {
		adminCount, err := h.countAdmins(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"type":   "https://example.com/errors/internal-error",
				"title":  "Internal Server Error",
				"status": 500,
				"detail": "Failed to check admin count",
			})
			return
		}
		if adminCount <= 1 {
			c.JSON(http.StatusForbidden, gin.H{
				"type":   "https://example.com/errors/forbidden",
				"title":  "Forbidden",
				"status": 403,
				"detail": "Cannot suspend the last admin",
			})
			return
		}
	}

	adminUUID := adminID.(uuid.UUID)
	if targetUser.ID == adminUUID {
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Forbidden",
			"status": 403,
			"detail": "Cannot suspend yourself",
		})
		return
	}

	if err := h.userRepo.UpdateStatus(c.Request.Context(), userID, "suspended", nil, &req.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to suspend user",
		})
		return
	}

	h.sessionStore.RevokeAllUserSessions(c.Request.Context(), userID)

	c.JSON(http.StatusOK, gin.H{
		"data": SuspendResponse{
			ID:     userID,
			Status: "suspended",
		},
	})
}

func (h *Handler) Unsuspend(c *gin.Context) {
	idStr := c.Param("id")
	userID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"type":   "https://example.com/errors/invalid-request",
			"title":  "Invalid Request",
			"status": 400,
			"detail": "Invalid user ID",
		})
		return
	}

	adminID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"type":   "https://example.com/errors/unauthenticated",
			"title":  "Unauthenticated",
			"status": 401,
			"detail": "Admin not authenticated",
		})
		return
	}

	targetUser, err := h.userRepo.GetByID(c.Request.Context(), userID)
	if err != nil {
		if err == repository.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"type":   "https://example.com/errors/not-found",
				"title":  "Not Found",
				"status": 404,
				"detail": "User not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to get user",
		})
		return
	}

	adminUUID := adminID.(uuid.UUID)
	if targetUser.ID == adminUUID {
		c.JSON(http.StatusForbidden, gin.H{
			"type":   "https://example.com/errors/forbidden",
			"title":  "Forbidden",
			"status": 403,
			"detail": "Cannot unsuspend yourself",
		})
		return
	}

	if err := h.userRepo.UpdateStatus(c.Request.Context(), userID, "approved", nil, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"type":   "https://example.com/errors/internal-error",
			"title":  "Internal Server Error",
			"status": 500,
			"detail": "Failed to unsuspend user",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": SuspendResponse{
			ID:     userID,
			Status: "approved",
		},
	})
}

func (h *Handler) countAdmins(ctx context.Context) (int, error) {
	var count int
	err := h.userRepo.GetDB().Pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'approved'`).Scan(&count)
	return count, err
}

func parseInt(s string) (int, error) {
	var i int
	_, err := fmt.Sscanf(s, "%d", &i)
	return i, err
}

func parseIntOrDefault(s string, def int) int {
	i, err := parseInt(s)
	if err != nil {
		return def
	}
	return i
}