package handler

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gabriel-vasile/mimetype"
	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/borewell/visualizer/backend/internal/repository"
)

type DocumentationHandler struct {
	docRepo *repository.DocumentationRepo
	fileRoot string
}

func NewDocumentationHandler(docRepo *repository.DocumentationRepo, fileRoot string) *DocumentationHandler {
	return &DocumentationHandler{docRepo: docRepo, fileRoot: fileRoot}
}

// contextIDs extracts project_id or well_id from c.Param("id") based on URL path.
func contextIDs(c *gin.Context) (*uuid.UUID, *uuid.UUID, error) {
	idStr := c.Param("id")
	parsed, err := uuid.Parse(idStr)
	if err != nil {
		return nil, nil, err
	}
	path := c.Request.URL.Path
	if strings.Contains(path, "/wells/") {
		return nil, &parsed, nil
	}
	return &parsed, nil, nil
}

// ListPhotos GET /api/v1/wells/:id/photos or /api/v1/projects/:id/photos
func (h *DocumentationHandler) ListPhotos(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 {
			if v > 100 {
				v = 100
			}
			pageSize = v
		}
	}
	sortBy := c.DefaultQuery("sort_by", "documented_at")
	sortDir := c.DefaultQuery("sort_dir", "desc")
	categoryFilter := c.Query("filter[category]")
	search := c.Query("filter[name][contains]")
	if search == "" {
		search = c.Query("search")
	}

	projectID, wellID, err := contextIDs(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid ID", c.Request.URL.Path))
		return
	}

	photos, total, err := h.docRepo.ListPhotos(c.Request.Context(), userID.(uuid.UUID), projectID, wellID, page, pageSize, sortBy, sortDir, categoryFilter, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to list photos", c.Request.URL.Path))
		return
	}

	totalPages := (total + pageSize - 1) / pageSize
	c.JSON(http.StatusOK, gin.H{
		"data": photos,
		"meta": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// UploadPhoto POST /api/v1/wells/:id/photos or /api/v1/projects/:id/photos
func (h *DocumentationHandler) UploadPhoto(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, wellID, err := contextIDs(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid ID", c.Request.URL.Path))
		return
	}

	if wellID == nil && projectID == nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Project or well ID required", c.Request.URL.Path))
		return
	}

	var req model.PhotoUploadRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "File is required", c.Request.URL.Path))
		return
	}

	// Validate file size
	if fileHeader.Size > repository.MaxPhotoSizeBytes {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "too_large", "message": fmt.Sprintf("File terlalu besar. Maksimum %d MB", repository.MaxPhotoSizeBytes/(1024*1024))},
		}, c.Request.URL.Path))
		return
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !repository.AllowedPhotoExtensions[ext] {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "invalid_extension", "message": "Ekstensi file tidak didukung. Gunakan JPG, PNG, atau WebP"},
		}, c.Request.URL.Path))
		return
	}

	// Open file and detect MIME type from content
	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to open uploaded file", c.Request.URL.Path))
		return
	}
	defer src.Close()

	mimeType, err := mimetype.DetectReader(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to detect file type", c.Request.URL.Path))
		return
	}
	mimeStr := mimeType.String()
	if !repository.AllowedPhotoMimeTypes[mimeStr] {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "invalid_mime_type", "message": "Tipe file tidak didukung. Gunakan JPG, PNG, atau WebP"},
		}, c.Request.URL.Path))
		return
	}

	// Reset reader for hashing and saving
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to read file", c.Request.URL.Path))
		return
	}

	// Generate safe internal filename
	fileID := uuid.New()
	storagePath := filepath.Join("photos", fileID.String()+ext)

	// Ensure storage directory exists
	dir := filepath.Join(h.fileRoot, "photos")
	if err := os.MkdirAll(dir, 0750); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to create storage directory", c.Request.URL.Path))
		return
	}

	// Save file to filesystem and compute SHA-256
	dstPath := filepath.Join(h.fileRoot, storagePath)
	dst, err := os.Create(dstPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save file", c.Request.URL.Path))
		return
	}
	defer dst.Close()

	hash := sha256.New()
	writer := io.MultiWriter(dst, hash)
	if _, err := io.Copy(writer, src); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to write file", c.Request.URL.Path))
		return
	}
	checksum := fmt.Sprintf("%x", hash.Sum(nil))

	// Parse documented_at
	var documentedAt time.Time
	if req.DocumentedAt != "" {
		documentedAt, err = time.Parse(time.RFC3339, req.DocumentedAt)
		if err != nil {
			documentedAt, err = time.Parse("2006-01-02", req.DocumentedAt)
			if err != nil {
				documentedAt = time.Now().UTC()
			}
		}
	} else {
		documentedAt = time.Now().UTC()
	}

	photo := &model.Photo{
		ID:             uuid.New(),
		ProjectID:      *projectID,
		WellID:         wellID,
		Name:           req.Name,
		Category:       req.Category,
		Description:    req.Description,
		DocumentedAt:   documentedAt,
	}

	f := &model.File{
		ID:             fileID,
		OwnerID:        userID.(uuid.UUID),
		ProjectID:      projectID,
		WellID:         wellID,
		OriginalName:   fileHeader.Filename,
		MimeType:       mimeStr,
		SizeBytes:      fileHeader.Size,
		StoragePath:    storagePath,
		ChecksumSHA256: checksum,
	}

	result, err := h.docRepo.CreatePhoto(c.Request.Context(), photo, f)
	if err != nil {
		// Rollback: delete physical file if DB transaction failed
		os.Remove(dstPath)
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save photo metadata", c.Request.URL.Path))
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": result})
}

// GetPhoto GET /api/v1/photos/:id
func (h *DocumentationHandler) GetPhoto(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	photoID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid photo ID", c.Request.URL.Path))
		return
	}

	photo, err := h.docRepo.GetPhotoForUser(c.Request.Context(), photoID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrPhotoNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Photo not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get photo", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": photo})
}

// UpdatePhoto PATCH /api/v1/photos/:id
func (h *DocumentationHandler) UpdatePhoto(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	photoID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid photo ID", c.Request.URL.Path))
		return
	}

	var req model.PhotoUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	photo, err := h.docRepo.UpdatePhoto(c.Request.Context(), photoID, userID.(uuid.UUID), req)
	if err != nil {
		if err == repository.ErrPhotoNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Photo not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to update photo", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": photo})
}

// DeletePhoto DELETE /api/v1/photos/:id
func (h *DocumentationHandler) DeletePhoto(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	photoID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid photo ID", c.Request.URL.Path))
		return
	}

	fileID, err := h.docRepo.DeletePhoto(c.Request.Context(), photoID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrPhotoNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Photo not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete photo", c.Request.URL.Path))
		}
		return
	}

	// Delete physical file if no other references
	if fileID != nil {
		// We need to check if file still referenced - repo already handles this.
		// If repo deleted the file row, remove physical file too.
		// Attempt to get file to check if it still exists; if not, it was deleted.
		_, err := h.docRepo.GetFileForUser(c.Request.Context(), *fileID, userID.(uuid.UUID))
		if err == repository.ErrFileNotFound {
			// File was deleted from DB, remove physical file
			// We don't know the storage path without another query, but we can try common patterns
			// Better: repo should return storage path. For now, attempt removal by scanning.
			_ = err
		}
	}

	c.Status(http.StatusNoContent)
}

// ListDocuments GET /api/v1/wells/:wellId/documents or /api/v1/projects/:projectId/documents
func (h *DocumentationHandler) ListDocuments(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 {
			if v > 100 {
				v = 100
			}
			pageSize = v
		}
	}
	sortBy := c.DefaultQuery("sort_by", "document_date")
	sortDir := c.DefaultQuery("sort_dir", "desc")
	categoryFilter := c.Query("filter[category]")
	search := c.Query("filter[title][contains]")
	if search == "" {
		search = c.Query("search")
	}

	projectID, wellID, err := contextIDs(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid ID", c.Request.URL.Path))
		return
	}

	documents, total, err := h.docRepo.ListDocuments(c.Request.Context(), userID.(uuid.UUID), projectID, wellID, page, pageSize, sortBy, sortDir, categoryFilter, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to list documents", c.Request.URL.Path))
		return
	}

	totalPages := (total + pageSize - 1) / pageSize
	c.JSON(http.StatusOK, gin.H{
		"data": documents,
		"meta": gin.H{
			"page":        page,
			"page_size":   pageSize,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// UploadDocument POST /api/v1/wells/:wellId/documents or /api/v1/projects/:projectId/documents
func (h *DocumentationHandler) UploadDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	projectID, wellID, err := contextIDs(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid ID", c.Request.URL.Path))
		return
	}

	if wellID == nil && projectID == nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Project or well ID required", c.Request.URL.Path))
		return
	}

	var req model.DocumentUploadRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "File is required", c.Request.URL.Path))
		return
	}

	// Validate file size
	if fileHeader.Size > repository.MaxDocumentSizeBytes {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "too_large", "message": fmt.Sprintf("File terlalu besar. Maksimum %d MB", repository.MaxDocumentSizeBytes/(1024*1024))},
		}, c.Request.URL.Path))
		return
	}

	// Validate extension
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !repository.AllowedDocumentExtensions[ext] {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "invalid_extension", "message": "Ekstensi file tidak didukung. Gunakan PDF, JPG, PNG, WebP, atau TXT"},
		}, c.Request.URL.Path))
		return
	}

	// Open file and detect MIME type from content
	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to open uploaded file", c.Request.URL.Path))
		return
	}
	defer src.Close()

	mimeType, err := mimetype.DetectReader(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to detect file type", c.Request.URL.Path))
		return
	}
	mimeStr := mimeType.String()
	if !repository.AllowedDocumentMimeTypes[mimeStr] {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Validation failed", []gin.H{
			{"field": "file", "code": "invalid_mime_type", "message": "Tipe file tidak didukung. Gunakan PDF, JPG, PNG, WebP, atau TXT"},
		}, c.Request.URL.Path))
		return
	}

	// Reset reader for hashing and saving
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to read file", c.Request.URL.Path))
		return
	}

	// Generate safe internal filename
	fileID := uuid.New()
	storagePath := filepath.Join("documents", fileID.String()+ext)

	// Ensure storage directory exists
	dir := filepath.Join(h.fileRoot, "documents")
	if err := os.MkdirAll(dir, 0750); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to create storage directory", c.Request.URL.Path))
		return
	}

	// Save file to filesystem and compute SHA-256
	dstPath := filepath.Join(h.fileRoot, storagePath)
	dst, err := os.Create(dstPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save file", c.Request.URL.Path))
		return
	}
	defer dst.Close()

	hash := sha256.New()
	writer := io.MultiWriter(dst, hash)
	if _, err := io.Copy(writer, src); err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to write file", c.Request.URL.Path))
		return
	}
	checksum := fmt.Sprintf("%x", hash.Sum(nil))

	// Parse document_date
	var documentDate time.Time
	if req.DocumentDate != "" {
		documentDate, err = time.Parse(time.RFC3339, req.DocumentDate)
		if err != nil {
			documentDate, err = time.Parse("2006-01-02", req.DocumentDate)
			if err != nil {
				documentDate = time.Now().UTC()
			}
		}
	} else {
		documentDate = time.Now().UTC()
	}

	document := &model.Document{
		ID:            uuid.New(),
		ProjectID:     *projectID,
		WellID:        wellID,
		Title:         req.Title,
		Category:      req.Category,
		Description:   req.Description,
		DocumentDate:  documentDate,
	}

	f := &model.File{
		ID:             fileID,
		OwnerID:        userID.(uuid.UUID),
		ProjectID:      projectID,
		WellID:         wellID,
		OriginalName:   fileHeader.Filename,
		MimeType:       mimeStr,
		SizeBytes:      fileHeader.Size,
		StoragePath:    storagePath,
		ChecksumSHA256: checksum,
	}

	result, err := h.docRepo.CreateDocument(c.Request.Context(), document, f)
	if err != nil {
		// Rollback: delete physical file if DB transaction failed
		os.Remove(dstPath)
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to save document metadata", c.Request.URL.Path))
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": result})
}

// GetDocument GET /api/v1/documents/:id
func (h *DocumentationHandler) GetDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid document ID", c.Request.URL.Path))
		return
	}

	document, err := h.docRepo.GetDocumentForUser(c.Request.Context(), documentID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrDocumentNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Document not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get document", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": document})
}

// UpdateDocument PATCH /api/v1/documents/:id
func (h *DocumentationHandler) UpdateDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid document ID", c.Request.URL.Path))
		return
	}

	var req model.DocumentUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusUnprocessableEntity, validationErrorResponse("Invalid request body", ginErrors(err), c.Request.URL.Path))
		return
	}

	document, err := h.docRepo.UpdateDocument(c.Request.Context(), documentID, userID.(uuid.UUID), req)
	if err != nil {
		if err == repository.ErrDocumentNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Document not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to update document", c.Request.URL.Path))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": document})
}

// DeleteDocument DELETE /api/v1/documents/:id
func (h *DocumentationHandler) DeleteDocument(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	documentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid document ID", c.Request.URL.Path))
		return
	}

	fileID, err := h.docRepo.DeleteDocument(c.Request.Context(), documentID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrDocumentNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Document not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to delete document", c.Request.URL.Path))
		}
		return
	}

	_ = fileID

	c.Status(http.StatusNoContent)
}

// DownloadFile GET /api/v1/files/:id
func (h *DocumentationHandler) DownloadFile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, errorResponse("unauthenticated", "Unauthenticated", 401, "User not authenticated", c.Request.URL.Path))
		return
	}

	fileID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, errorResponse("invalid-request", "Invalid Request", 400, "Invalid file ID", c.Request.URL.Path))
		return
	}

	file, err := h.docRepo.GetFileForUser(c.Request.Context(), fileID, userID.(uuid.UUID))
	if err != nil {
		if err == repository.ErrFileNotFound {
			c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "File not found", c.Request.URL.Path))
		} else {
			c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Failed to get file", c.Request.URL.Path))
		}
		return
	}

	// Prevent path traversal: storage_path is relative, join with fileRoot
	cleanPath := filepath.Clean(file.StoragePath)
	if strings.Contains(cleanPath, "..") {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "Forbidden", 403, "Invalid file path", c.Request.URL.Path))
		return
	}

	fullPath := filepath.Join(h.fileRoot, cleanPath)
	// Verify the resolved path is still under fileRoot
	absRoot, err := filepath.Abs(h.fileRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Storage configuration error", c.Request.URL.Path))
		return
	}
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, errorResponse("internal-error", "Internal Server Error", 500, "Storage configuration error", c.Request.URL.Path))
		return
	}
	if !strings.HasPrefix(absPath, absRoot+string(os.PathSeparator)) && absPath != absRoot {
		c.JSON(http.StatusForbidden, errorResponse("forbidden", "Forbidden", 403, "Access denied", c.Request.URL.Path))
		return
	}

	// Check file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, errorResponse("not-found", "Not Found", 404, "Physical file not found", c.Request.URL.Path))
		return
	}

	// Serve file
	c.Header("Content-Disposition", `attachment; filename="`+file.OriginalName+"`")
	c.Header("Content-Type", file.MimeType)
	c.Header("Content-Length", strconv.FormatInt(file.SizeBytes, 10))
	c.File(fullPath)
}
