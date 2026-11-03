package model

import (
	"time"

	"github.com/google/uuid"
)

// File represents binary file metadata stored on local filesystem.
type File struct {
	ID             uuid.UUID `json:"id" db:"id"`
	OwnerID        uuid.UUID `json:"-" db:"owner_id"`
	ProjectID      *uuid.UUID `json:"project_id,omitempty" db:"project_id"`
	WellID         *uuid.UUID `json:"well_id,omitempty" db:"well_id"`
	OriginalName   string    `json:"original_name" db:"original_name"`
	MimeType       string    `json:"mime_type" db:"mime_type"`
	SizeBytes      int64     `json:"size_bytes" db:"size_bytes"`
	StoragePath    string    `json:"storage_path" db:"storage_path"`
	ChecksumSHA256 string    `json:"checksum_sha256" db:"checksum_sha256"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

// Photo represents a photo record linked to a file.
type Photo struct {
	ID             uuid.UUID `json:"id" db:"id"`
	ProjectID      uuid.UUID `json:"project_id" db:"project_id"`
	WellID         *uuid.UUID `json:"well_id,omitempty" db:"well_id"`
	FileID         uuid.UUID `json:"file_id" db:"file_id"`
	Name           string    `json:"name" db:"name"`
	Category       string    `json:"category" db:"category"`
	Description    string    `json:"description,omitempty" db:"description"`
	DocumentedAt   time.Time `json:"documented_at" db:"documented_at"`
	Width          *int      `json:"width,omitempty" db:"width"`
	Height         *int      `json:"height,omitempty" db:"height"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// Document represents a document record linked to a file.
type Document struct {
	ID             uuid.UUID `json:"id" db:"id"`
	ProjectID      uuid.UUID `json:"project_id" db:"project_id"`
	WellID         *uuid.UUID `json:"well_id,omitempty" db:"well_id"`
	FileID         uuid.UUID `json:"file_id" db:"file_id"`
	Title          string    `json:"title" db:"title"`
	Category       string    `json:"category" db:"category"`
	Description    string    `json:"description,omitempty" db:"description"`
	DocumentDate   time.Time `json:"document_date" db:"document_date"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// PhotoWithFile combines photo metadata with file info for API response.
type PhotoWithFile struct {
	Photo
	FileName   string    `json:"file_name"`
	FileType   string    `json:"file_type"`
	FileSize   int64     `json:"file_size"`
	DownloadURL string   `json:"download_url"`
}

// DocumentWithFile combines document metadata with file info for API response.
type DocumentWithFile struct {
	Document
	FileName   string    `json:"file_name"`
	FileType   string    `json:"file_type"`
	FileSize   int64     `json:"file_size"`
	DownloadURL string   `json:"download_url"`
}

// PhotoUploadRequest represents multipart form fields for photo upload.
type PhotoUploadRequest struct {
	Name         string `form:"name" binding:"required"`
	Category     string `form:"category" binding:"required"`
	Description  string `form:"description"`
	DocumentedAt string `form:"documented_at"`
}

// DocumentUploadRequest represents multipart form fields for document upload.
type DocumentUploadRequest struct {
	Title        string `form:"title" binding:"required"`
	Category     string `form:"category" binding:"required"`
	Description  string `form:"description"`
	DocumentDate string `form:"document_date"`
}

// PhotoUpdateRequest represents PATCH request for photo metadata.
type PhotoUpdateRequest struct {
	Name         *string `json:"name"`
	Category     *string `json:"category"`
	Description  *string `json:"description"`
	DocumentedAt *string `json:"documented_at"`
}

// DocumentUpdateRequest represents PATCH request for document metadata.
type DocumentUpdateRequest struct {
	Title        *string `json:"title"`
	Category     *string `json:"category"`
	Description  *string `json:"description"`
	DocumentDate *string `json:"document_date"`
}
