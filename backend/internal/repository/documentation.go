package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/borewell/visualizer/backend/internal/database"
	"github.com/borewell/visualizer/backend/internal/model"
)

var (
	ErrFileNotFound      = errors.New("file not found")
	ErrPhotoNotFound     = errors.New("photo not found")
	ErrDocumentNotFound  = errors.New("document not found")
)

const (
	MaxPhotoSizeBytes     = 10 * 1024 * 1024 // 10 MB
	MaxDocumentSizeBytes  = 20 * 1024 * 1024 // 20 MB
)

var AllowedPhotoMimeTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
}

var AllowedDocumentMimeTypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"text/plain":      true,
}

var AllowedPhotoExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
}

var AllowedDocumentExtensions = map[string]bool{
	".pdf":  true,
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".txt":  true,
}

type DocumentationRepo struct {
	db *database.DB
}

func NewDocumentationRepo(db *database.DB) *DocumentationRepo {
	return &DocumentationRepo{db: db}
}

// --- File operations ---

func (r *DocumentationRepo) CreateFile(ctx context.Context, f *model.File) error {
	return r.db.WithUserTx(ctx, f.OwnerID, func(ctx context.Context, tx database.Tx) error {
		query := `
			INSERT INTO files (id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
		`
		err := tx.QueryRow(ctx, query,
			f.ID, f.OwnerID, f.ProjectID, f.WellID, f.OriginalName, f.MimeType, f.SizeBytes, f.StoragePath, f.ChecksumSHA256,
		).Scan(
			&f.ID, &f.OwnerID, &f.ProjectID, &f.WellID, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.StoragePath, &f.ChecksumSHA256, &f.CreatedAt,
		)
		return err
	})
}

func (r *DocumentationRepo) GetFileForUser(ctx context.Context, fileID, userID uuid.UUID) (*model.File, error) {
	var f *model.File
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
			FROM files
			WHERE id = $1 AND owner_id = $2
		`
		f = &model.File{}
		err := tx.QueryRow(ctx, query, fileID, userID).Scan(
			&f.ID, &f.OwnerID, &f.ProjectID, &f.WellID, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.StoragePath, &f.ChecksumSHA256, &f.CreatedAt,
		)
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrFileNotFound
		}
		return nil, err
	}
	return f, nil
}

func (r *DocumentationRepo) DeleteFile(ctx context.Context, fileID, userID uuid.UUID) error {
	return r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		result, err := tx.Exec(ctx, `DELETE FROM files WHERE id = $1 AND owner_id = $2`, fileID, userID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrFileNotFound
		}
		return nil
	})
}

// --- Photo operations ---

func (r *DocumentationRepo) ListPhotos(ctx context.Context, userID uuid.UUID, projectID *uuid.UUID, wellID *uuid.UUID, page, pageSize int, sortBy, sortDir string, categoryFilter string, search string) ([]*model.PhotoWithFile, int, error) {
	var photos []*model.PhotoWithFile
	var total int
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		offset := (page - 1) * pageSize
		args := []any{userID}
		argIndex := 2

		where := "WHERE p.project_id IN (SELECT id FROM projects WHERE (EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'admin') OR owner_id = $1 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = $1)))"
		if projectID != nil {
			where += " AND p.project_id = $" + string(rune('0'+argIndex))
			args = append(args, *projectID)
			argIndex++
		}
		if wellID != nil {
			where += " AND p.well_id = $" + string(rune('0'+argIndex))
			args = append(args, *wellID)
			argIndex++
		}
		if categoryFilter != "" && categoryFilter != "all" {
			where += " AND p.category = $" + string(rune('0'+argIndex))
			args = append(args, categoryFilter)
			argIndex++
		}
		if search != "" {
			where += " AND (p.name ILIKE $" + string(rune('0'+argIndex)) + " OR p.description ILIKE $" + string(rune('0'+argIndex+1)) + ")"
			args = append(args, "%"+search+"%", "%"+search+"%")
			argIndex += 2
		}

		validSort := map[string]bool{"documented_at": true, "name": true, "category": true, "created_at": true}
		if !validSort[sortBy] {
			sortBy = "documented_at"
		}
		if sortDir != "asc" && sortDir != "desc" {
			sortDir = "desc"
		}

		countQuery := "SELECT COUNT(*) FROM documentation_photos p JOIN files f ON p.file_id = f.id " + where
		if err := tx.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
			return err
		}

		query := `
			SELECT p.id, p.project_id, p.well_id, p.file_id, p.name, p.category, p.description, p.documented_at, p.width, p.height, p.created_at, p.updated_at,
				f.original_name, f.mime_type, f.size_bytes, f.storage_path, f.checksum_sha256, f.created_at
			FROM documentation_photos p
			JOIN files f ON p.file_id = f.id
			` + where + `
			ORDER BY p.` + sortBy + ` ` + sortDir + `
			LIMIT $` + string(rune('0'+argIndex)) + ` OFFSET $` + string(rune('0'+argIndex+1))
		args = append(args, pageSize, offset)

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			p := &model.PhotoWithFile{}
			var wellIDPtr *uuid.UUID
			var fileCreatedAt time.Time
			var origName, mimeType, storagePath, checksum string
			var sizeBytes int64
			err := rows.Scan(
				&p.ID, &p.ProjectID, &wellIDPtr, &p.FileID, &p.Name, &p.Category, &p.Description, &p.DocumentedAt, &p.Width, &p.Height, &p.CreatedAt, &p.UpdatedAt,
				&origName, &mimeType, &sizeBytes, &storagePath, &checksum, &fileCreatedAt,
			)
			if err != nil {
				return err
			}
			p.WellID = wellIDPtr
			p.FileName = origName
			p.FileType = mimeType
			p.FileSize = sizeBytes
			p.DownloadURL = "/api/v1/files/" + p.FileID.String()
			photos = append(photos, p)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, 0, err
	}
	return photos, total, nil
}

func (r *DocumentationRepo) GetPhotoForUser(ctx context.Context, photoID, userID uuid.UUID) (*model.PhotoWithFile, error) {
	var p *model.PhotoWithFile
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT p.id, p.project_id, p.well_id, p.file_id, p.name, p.category, p.description, p.documented_at, p.width, p.height, p.created_at, p.updated_at,
				f.original_name, f.mime_type, f.size_bytes, f.storage_path, f.checksum_sha256
			FROM documentation_photos p
			JOIN files f ON p.file_id = f.id
			WHERE p.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = p.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`
		p = &model.PhotoWithFile{}
		var wellIDPtr *uuid.UUID
		var origName, mimeType, storagePath, checksum string
		var sizeBytes int64
		err := tx.QueryRow(ctx, query, photoID, userID).Scan(
			&p.ID, &p.ProjectID, &wellIDPtr, &p.FileID, &p.Name, &p.Category, &p.Description, &p.DocumentedAt, &p.Width, &p.Height, &p.CreatedAt, &p.UpdatedAt,
			&origName, &mimeType, &sizeBytes, &storagePath, &checksum,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrPhotoNotFound
			}
			return err
		}
		p.WellID = wellIDPtr
		p.FileName = origName
		p.FileType = mimeType
		p.FileSize = sizeBytes
		p.DownloadURL = "/api/v1/files/" + p.FileID.String()
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPhotoNotFound
		}
		return nil, err
	}
	return p, nil
}

func (r *DocumentationRepo) CreatePhoto(ctx context.Context, photo *model.Photo, file *model.File) (*model.PhotoWithFile, error) {
	var result *model.PhotoWithFile
	err := r.db.WithUserTx(ctx, file.OwnerID, func(ctx context.Context, tx database.Tx) error {
		// Insert file first
		fileQuery := `
			INSERT INTO files (id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
		`
		err := tx.QueryRow(ctx, fileQuery,
			file.ID, file.OwnerID, file.ProjectID, file.WellID, file.OriginalName, file.MimeType, file.SizeBytes, file.StoragePath, file.ChecksumSHA256,
		).Scan(
			&file.ID, &file.OwnerID, &file.ProjectID, &file.WellID, &file.OriginalName, &file.MimeType, &file.SizeBytes, &file.StoragePath, &file.ChecksumSHA256, &file.CreatedAt,
		)
		if err != nil {
			return err
		}

		// Insert photo
		photoQuery := `
			INSERT INTO documentation_photos (id, project_id, well_id, file_id, name, category, description, documented_at, width, height)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id, project_id, well_id, file_id, name, category, description, documented_at, width, height, created_at, updated_at
		`
		p := &model.PhotoWithFile{}
		var wellIDPtr *uuid.UUID
		err = tx.QueryRow(ctx, photoQuery,
			photo.ID, photo.ProjectID, photo.WellID, file.ID, photo.Name, photo.Category, photo.Description, photo.DocumentedAt, photo.Width, photo.Height,
		).Scan(
			&p.ID, &p.ProjectID, &wellIDPtr, &p.FileID, &p.Name, &p.Category, &p.Description, &p.DocumentedAt, &p.Width, &p.Height, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return err
		}
		p.WellID = wellIDPtr
		p.FileName = file.OriginalName
		p.FileType = file.MimeType
		p.FileSize = file.SizeBytes
		p.DownloadURL = "/api/v1/files/" + file.ID.String()
		result = p
		return nil
	})
	return result, err
}

func (r *DocumentationRepo) UpdatePhoto(ctx context.Context, photoID, userID uuid.UUID, updates model.PhotoUpdateRequest) (*model.PhotoWithFile, error) {
	var result *model.PhotoWithFile
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Verify ownership
		var dummy uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT p.id FROM documentation_photos p
			JOIN files f ON p.file_id = f.id
			WHERE p.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = p.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`, photoID, userID).Scan(&dummy)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrPhotoNotFound
			}
			return err
		}

		setParts := []string{}
		args := []any{}
		argIndex := 1
		if updates.Name != nil {
			setParts = append(setParts, "name = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Name)
			argIndex++
		}
		if updates.Category != nil {
			setParts = append(setParts, "category = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Category)
			argIndex++
		}
		if updates.Description != nil {
			setParts = append(setParts, "description = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Description)
			argIndex++
		}
		if updates.DocumentedAt != nil {
			t, err := time.Parse(time.RFC3339, *updates.DocumentedAt)
			if err != nil {
				t, err = time.Parse("2006-01-02", *updates.DocumentedAt)
				if err != nil {
					return err
				}
			}
			setParts = append(setParts, "documented_at = $"+string(rune('0'+argIndex)))
			args = append(args, t)
			argIndex++
		}
		if len(setParts) == 0 {
			existing, gerr := r.GetPhotoForUser(ctx, photoID, userID)
			if gerr != nil {
				return gerr
			}
			result = existing
			return nil
		}
		setParts = append(setParts, "updated_at = now()")
		args = append(args, photoID, userID)

		query := `UPDATE documentation_photos SET ` + joinStrings(setParts, ", ") + `
			WHERE id = $` + string(rune('0'+argIndex)) + `
			RETURNING id, project_id, well_id, file_id, name, category, description, documented_at, width, height, created_at, updated_at`
		p := &model.PhotoWithFile{}
		var wellIDPtr *uuid.UUID
		err = tx.QueryRow(ctx, query, args...).Scan(
			&p.ID, &p.ProjectID, &wellIDPtr, &p.FileID, &p.Name, &p.Category, &p.Description, &p.DocumentedAt, &p.Width, &p.Height, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			return err
		}
		p.WellID = wellIDPtr
		p.DownloadURL = "/api/v1/files/" + p.FileID.String()
		result = p
		return nil
	})
	return result, err
}

func (r *DocumentationRepo) DeletePhoto(ctx context.Context, photoID, userID uuid.UUID) (*uuid.UUID, error) {
	var fileID uuid.UUID
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		// Get file_id before deleting, verify ownership
		err := tx.QueryRow(ctx, `
			SELECT p.file_id FROM documentation_photos p
			JOIN files f ON p.file_id = f.id
			WHERE p.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = p.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`, photoID, userID).Scan(&fileID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrPhotoNotFound
			}
			return err
		}

		// Delete photo record
		result, err := tx.Exec(ctx, `DELETE FROM documentation_photos WHERE id = $1`, photoID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrPhotoNotFound
		}

		// Check if file is referenced by other photos or documents
		var refCount int
		err = tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM (
				SELECT 1 FROM documentation_photos WHERE file_id = $1
				UNION ALL
				SELECT 1 FROM documentation_documents WHERE file_id = $1
			) t
		`, fileID).Scan(&refCount)
		if err != nil {
			return err
		}

		// Delete file if no other references
		if refCount == 0 {
			_, err = tx.Exec(ctx, `DELETE FROM files WHERE id = $1`, fileID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &fileID, nil
}

// --- Document operations ---

func (r *DocumentationRepo) ListDocuments(ctx context.Context, userID uuid.UUID, projectID *uuid.UUID, wellID *uuid.UUID, page, pageSize int, sortBy, sortDir string, categoryFilter string, search string) ([]*model.DocumentWithFile, int, error) {
	var documents []*model.DocumentWithFile
	var total int
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		offset := (page - 1) * pageSize
		args := []any{userID}
		argIndex := 2

		where := "WHERE d.project_id IN (SELECT id FROM projects WHERE (EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'admin') OR owner_id = $1 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = projects.id AND pa.user_id = $1)))"
		if projectID != nil {
			where += " AND d.project_id = $" + string(rune('0'+argIndex))
			args = append(args, *projectID)
			argIndex++
		}
		if wellID != nil {
			where += " AND d.well_id = $" + string(rune('0'+argIndex))
			args = append(args, *wellID)
			argIndex++
		}
		if categoryFilter != "" && categoryFilter != "all" {
			where += " AND d.category = $" + string(rune('0'+argIndex))
			args = append(args, categoryFilter)
			argIndex++
		}
		if search != "" {
			where += " AND (d.title ILIKE $" + string(rune('0'+argIndex)) + " OR d.description ILIKE $" + string(rune('0'+argIndex+1)) + ")"
			args = append(args, "%"+search+"%", "%"+search+"%")
			argIndex += 2
		}

		validSort := map[string]bool{"document_date": true, "title": true, "category": true, "created_at": true}
		if !validSort[sortBy] {
			sortBy = "document_date"
		}
		if sortDir != "asc" && sortDir != "desc" {
			sortDir = "desc"
		}

		countQuery := "SELECT COUNT(*) FROM documentation_documents d JOIN files f ON d.file_id = f.id " + where
		if err := tx.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
			return err
		}

		query := `
			SELECT d.id, d.project_id, d.well_id, d.file_id, d.title, d.category, d.description, d.document_date, d.created_at, d.updated_at,
				f.original_name, f.mime_type, f.size_bytes, f.storage_path, f.checksum_sha256
			FROM documentation_documents d
			JOIN files f ON d.file_id = f.id
			` + where + `
			ORDER BY d.` + sortBy + ` ` + sortDir + `
			LIMIT $` + string(rune('0'+argIndex)) + ` OFFSET $` + string(rune('0'+argIndex+1))
		args = append(args, pageSize, offset)

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			d := &model.DocumentWithFile{}
			var wellIDPtr *uuid.UUID
			var origName, mimeType, storagePath, checksum string
			var sizeBytes int64
			err := rows.Scan(
				&d.ID, &d.ProjectID, &wellIDPtr, &d.FileID, &d.Title, &d.Category, &d.Description, &d.DocumentDate, &d.CreatedAt, &d.UpdatedAt,
				&origName, &mimeType, &sizeBytes, &storagePath, &checksum,
			)
			if err != nil {
				return err
			}
			d.WellID = wellIDPtr
			d.FileName = origName
			d.FileType = mimeType
			d.FileSize = sizeBytes
			d.DownloadURL = "/api/v1/files/" + d.FileID.String()
			documents = append(documents, d)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, 0, err
	}
	return documents, total, nil
}

func (r *DocumentationRepo) GetDocumentForUser(ctx context.Context, documentID, userID uuid.UUID) (*model.DocumentWithFile, error) {
	var d *model.DocumentWithFile
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		query := `
			SELECT d.id, d.project_id, d.well_id, d.file_id, d.title, d.category, d.description, d.document_date, d.created_at, d.updated_at,
				f.original_name, f.mime_type, f.size_bytes, f.storage_path, f.checksum_sha256
			FROM documentation_documents d
			JOIN files f ON d.file_id = f.id
			WHERE d.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = d.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`
		d = &model.DocumentWithFile{}
		var wellIDPtr *uuid.UUID
		var origName, mimeType, storagePath, checksum string
		var sizeBytes int64
		err := tx.QueryRow(ctx, query, documentID, userID).Scan(
			&d.ID, &d.ProjectID, &wellIDPtr, &d.FileID, &d.Title, &d.Category, &d.Description, &d.DocumentDate, &d.CreatedAt, &d.UpdatedAt,
			&origName, &mimeType, &sizeBytes, &storagePath, &checksum,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrDocumentNotFound
			}
			return err
		}
		d.WellID = wellIDPtr
		d.FileName = origName
		d.FileType = mimeType
		d.FileSize = sizeBytes
		d.DownloadURL = "/api/v1/files/" + d.FileID.String()
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDocumentNotFound
		}
		return nil, err
	}
	return d, nil
}

func (r *DocumentationRepo) CreateDocument(ctx context.Context, document *model.Document, file *model.File) (*model.DocumentWithFile, error) {
	var result *model.DocumentWithFile
	err := r.db.WithUserTx(ctx, file.OwnerID, func(ctx context.Context, tx database.Tx) error {
		// Insert file first
		fileQuery := `
			INSERT INTO files (id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
		`
		err := tx.QueryRow(ctx, fileQuery,
			file.ID, file.OwnerID, file.ProjectID, file.WellID, file.OriginalName, file.MimeType, file.SizeBytes, file.StoragePath, file.ChecksumSHA256,
		).Scan(
			&file.ID, &file.OwnerID, &file.ProjectID, &file.WellID, &file.OriginalName, &file.MimeType, &file.SizeBytes, &file.StoragePath, &file.ChecksumSHA256, &file.CreatedAt,
		)
		if err != nil {
			return err
		}

		// Insert document
		docQuery := `
			INSERT INTO documentation_documents (id, project_id, well_id, file_id, title, category, description, document_date)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, project_id, well_id, file_id, title, category, description, document_date, created_at, updated_at
		`
		d := &model.DocumentWithFile{}
		var wellIDPtr *uuid.UUID
		err = tx.QueryRow(ctx, docQuery,
			document.ID, document.ProjectID, document.WellID, file.ID, document.Title, document.Category, document.Description, document.DocumentDate,
		).Scan(
			&d.ID, &d.ProjectID, &wellIDPtr, &d.FileID, &d.Title, &d.Category, &d.Description, &d.DocumentDate, &d.CreatedAt, &d.UpdatedAt,
		)
		if err != nil {
			return err
		}
		d.WellID = wellIDPtr
		d.FileName = file.OriginalName
		d.FileType = file.MimeType
		d.FileSize = file.SizeBytes
		d.DownloadURL = "/api/v1/files/" + file.ID.String()
		result = d
		return nil
	})
	return result, err
}

func (r *DocumentationRepo) UpdateDocument(ctx context.Context, documentID, userID uuid.UUID, updates model.DocumentUpdateRequest) (*model.DocumentWithFile, error) {
	var result *model.DocumentWithFile
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		var dummy uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT d.id FROM documentation_documents d
			JOIN files f ON d.file_id = f.id
			WHERE d.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = d.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`, documentID, userID).Scan(&dummy)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrDocumentNotFound
			}
			return err
		}

		setParts := []string{}
		args := []any{}
		argIndex := 1
		if updates.Title != nil {
			setParts = append(setParts, "title = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Title)
			argIndex++
		}
		if updates.Category != nil {
			setParts = append(setParts, "category = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Category)
			argIndex++
		}
		if updates.Description != nil {
			setParts = append(setParts, "description = $"+string(rune('0'+argIndex)))
			args = append(args, *updates.Description)
			argIndex++
		}
		if updates.DocumentDate != nil {
			t, err := time.Parse(time.RFC3339, *updates.DocumentDate)
			if err != nil {
				t, err = time.Parse("2006-01-02", *updates.DocumentDate)
				if err != nil {
					return err
				}
			}
			setParts = append(setParts, "document_date = $"+string(rune('0'+argIndex)))
			args = append(args, t)
			argIndex++
		}
		if len(setParts) == 0 {
			existing, gerr := r.GetDocumentForUser(ctx, documentID, userID)
			if gerr != nil {
				return gerr
			}
			result = existing
			return nil
		}
		setParts = append(setParts, "updated_at = now()")
		args = append(args, documentID, userID)

		query := `UPDATE documentation_documents SET ` + joinStrings(setParts, ", ") + `
			WHERE id = $` + string(rune('0'+argIndex)) + `
			RETURNING id, project_id, well_id, file_id, title, category, description, document_date, created_at, updated_at`
		d := &model.DocumentWithFile{}
		var wellIDPtr *uuid.UUID
		err = tx.QueryRow(ctx, query, args...).Scan(
			&d.ID, &d.ProjectID, &wellIDPtr, &d.FileID, &d.Title, &d.Category, &d.Description, &d.DocumentDate, &d.CreatedAt, &d.UpdatedAt,
		)
		if err != nil {
			return err
		}
		d.WellID = wellIDPtr
		d.DownloadURL = "/api/v1/files/" + d.FileID.String()
		result = d
		return nil
	})
	return result, err
}

func (r *DocumentationRepo) DeleteDocument(ctx context.Context, documentID, userID uuid.UUID) (*uuid.UUID, error) {
	var fileID uuid.UUID
	err := r.db.WithUserTx(ctx, userID, func(ctx context.Context, tx database.Tx) error {
		err := tx.QueryRow(ctx, `
			SELECT d.file_id FROM documentation_documents d
			JOIN files f ON d.file_id = f.id
			WHERE d.id = $1 AND (f.owner_id = $2 OR EXISTS (SELECT 1 FROM projects pr WHERE pr.id = d.project_id AND (pr.owner_id = $2 OR EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pr.id AND pa.user_id = $2) OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))))
		`, documentID, userID).Scan(&fileID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrDocumentNotFound
			}
			return err
		}

		result, err := tx.Exec(ctx, `DELETE FROM documentation_documents WHERE id = $1`, documentID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return ErrDocumentNotFound
		}

		var refCount int
		err = tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM (
				SELECT 1 FROM documentation_photos WHERE file_id = $1
				UNION ALL
				SELECT 1 FROM documentation_documents WHERE file_id = $1
			) t
		`, fileID).Scan(&refCount)
		if err != nil {
			return err
		}

		if refCount == 0 {
			_, err = tx.Exec(ctx, `DELETE FROM files WHERE id = $1`, fileID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &fileID, nil
}

// CreateFileWithTx creates a file within an existing transaction (for migration)
func (r *DocumentationRepo) CreateFileWithTx(ctx context.Context, tx database.Tx, f *model.File) error {
	query := `
		INSERT INTO files (id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
	`
	err := tx.QueryRow(ctx, query,
		f.ID, f.OwnerID, f.ProjectID, f.WellID, f.OriginalName, f.MimeType, f.SizeBytes, f.StoragePath, f.ChecksumSHA256,
	).Scan(
		&f.ID, &f.OwnerID, &f.ProjectID, &f.WellID, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.StoragePath, &f.ChecksumSHA256, &f.CreatedAt,
	)
	return err
}

// GetFileByChecksum returns a file by its checksum (for deduplication)
func (r *DocumentationRepo) GetFileByChecksum(ctx context.Context, tx database.Tx, checksum string) (*model.File, error) {
	var f *model.File
	query := `
		SELECT id, owner_id, project_id, well_id, original_name, mime_type, size_bytes, storage_path, checksum_sha256, created_at
		FROM files
		WHERE checksum_sha256 = $1
		LIMIT 1
	`
	f = &model.File{}
	err := tx.QueryRow(ctx, query, checksum).Scan(
		&f.ID, &f.OwnerID, &f.ProjectID, &f.WellID, &f.OriginalName, &f.MimeType, &f.SizeBytes, &f.StoragePath, &f.ChecksumSHA256, &f.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrFileNotFound
		}
		return nil, err
	}
	return f, nil
}

// CreatePhotoWithTx creates a photo within an existing transaction (for migration)
func (r *DocumentationRepo) CreatePhotoWithTx(ctx context.Context, tx database.Tx, p *model.Photo) error {
	query := `
		INSERT INTO documentation_photos (id, project_id, well_id, file_id, name, category, description, documented_at, width, height)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, project_id, well_id, file_id, name, category, description, documented_at, width, height, created_at, updated_at
	`
	var wellIDPtr *uuid.UUID
	err := tx.QueryRow(ctx, query,
		p.ID, p.ProjectID, p.WellID, p.FileID, p.Name, p.Category, p.Description, p.DocumentedAt, p.Width, p.Height,
	).Scan(
		&p.ID, &p.ProjectID, &wellIDPtr, &p.FileID, &p.Name, &p.Category, &p.Description, &p.DocumentedAt, &p.Width, &p.Height, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return err
	}
	p.WellID = wellIDPtr
	return nil
}

// CreateDocumentWithTx creates a document within an existing transaction (for migration)
func (r *DocumentationRepo) CreateDocumentWithTx(ctx context.Context, tx database.Tx, d *model.Document) error {
	query := `
		INSERT INTO documentation_documents (id, project_id, well_id, file_id, title, category, description, document_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, project_id, well_id, file_id, title, category, description, document_date, created_at, updated_at
	`
	var wellIDPtr *uuid.UUID
	err := tx.QueryRow(ctx, query,
		d.ID, d.ProjectID, d.WellID, d.FileID, d.Title, d.Category, d.Description, d.DocumentDate,
	).Scan(
		&d.ID, &d.ProjectID, &wellIDPtr, &d.FileID, &d.Title, &d.Category, &d.Description, &d.DocumentDate, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return err
	}
	d.WellID = wellIDPtr
	return nil
}






