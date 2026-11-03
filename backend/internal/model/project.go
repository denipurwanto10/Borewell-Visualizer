package model

import (
	"time"

	"github.com/google/uuid"
)

type Project struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	OwnerID        uuid.UUID  `json:"-" db:"owner_id"`
	ProjectCode    string     `json:"project_code" db:"project_code"`
	ProjectName    string     `json:"project_name" db:"project_name"`
	ClientName     string     `json:"client_name" db:"client_name"`
	ContractorName *string    `json:"contractor_name,omitempty" db:"contractor_name"`
	Location       *string    `json:"location,omitempty" db:"location"`
	Province       *string    `json:"province,omitempty" db:"province"`
	District       *string    `json:"district,omitempty" db:"district"`
	Village        *string    `json:"village,omitempty" db:"village"`
	Latitude       *string    `json:"latitude,omitempty" db:"latitude"`
	Longitude      *string    `json:"longitude,omitempty" db:"longitude"`
	Description    *string    `json:"description,omitempty" db:"description"`
	StartDate      *time.Time `json:"start_date,omitempty" db:"start_date"`
	EndDate        *time.Time `json:"end_date,omitempty" db:"end_date"`
	Status         string     `json:"status" db:"status"`
	WellCount      int        `json:"well_count,omitempty" db:"-"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
	ArchivedAt     *time.Time `json:"archived_at,omitempty" db:"archived_at"`
}

type Well struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	ProjectID      uuid.UUID  `json:"project_id" db:"project_id"`
	WellCode       string     `json:"well_code" db:"well_code"`
	WellName       string     `json:"well_name" db:"well_name"`
	WellType       string     `json:"well_type" db:"well_type"`
	Location       *string    `json:"location,omitempty" db:"location"`
	Latitude       *string    `json:"latitude,omitempty" db:"latitude"`
	Longitude      *string    `json:"longitude,omitempty" db:"longitude"`
	PlannedDepth   *float64   `json:"planned_depth,omitempty" db:"planned_depth"`
	ActualDepth    *float64   `json:"actual_depth,omitempty" db:"actual_depth"`
	DrillingDate   *time.Time `json:"drilling_date,omitempty" db:"drilling_date"`
	CompletionDate *time.Time `json:"completion_date,omitempty" db:"completion_date"`
	Status         string     `json:"status" db:"status"`
	Description    *string    `json:"description,omitempty" db:"description"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
}

type DesignerState struct {
	ID        uuid.UUID `json:"id" db:"id"`
	WellID    uuid.UUID `json:"well_id" db:"well_id"`
	Version   int       `json:"version" db:"version"`
	Components any      `json:"components" db:"components"`
	Config     any      `json:"config" db:"config"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type GeologyLog struct {
	ID        uuid.UUID `json:"id" db:"id"`
	WellID    uuid.UUID `json:"well_id" db:"well_id"`
	Version   int       `json:"version" db:"version"`
	Layers    any      `json:"layers" db:"layers"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type MonitoringData struct {
	ID            uuid.UUID `json:"id" db:"id"`
	WellID        uuid.UUID `json:"well_id" db:"well_id"`
	Version       int       `json:"version" db:"version"`
	Measurements  any      `json:"measurements" db:"measurements"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// ProjectCreateRequest represents the request body for creating a project.
type ProjectCreateRequest struct {
	ProjectCode    string     `json:"project_code" binding:"required"`
	ProjectName    string     `json:"project_name" binding:"required"`
	ClientName     string     `json:"client_name" binding:"required"`
	ContractorName string     `json:"contractor_name"`
	Location       string     `json:"location"`
	Province       string     `json:"province"`
	District       string     `json:"district"`
	Village        string     `json:"village"`
	Latitude       string     `json:"latitude"`
	Longitude      string     `json:"longitude"`
	Description    string     `json:"description"`
	StartDate      string     `json:"start_date"`
	EndDate        string     `json:"end_date"`
	Status         string     `json:"status" binding:"required,oneof=planning in_progress completed on_hold archived"`
}

// ProjectUpdateRequest represents the request body for updating a project.
type ProjectUpdateRequest struct {
	ProjectCode    string     `json:"project_code"`
	ProjectName    string     `json:"project_name"`
	ClientName     string     `json:"client_name"`
	ContractorName string     `json:"contractor_name"`
	Location       string     `json:"location"`
	Province       string     `json:"province"`
	District       string     `json:"district"`
	Village        string     `json:"village"`
	Latitude       string     `json:"latitude"`
	Longitude      string     `json:"longitude"`
	Description    string     `json:"description"`
	StartDate      *string    `json:"start_date"`
	EndDate        *string    `json:"end_date"`
	Status         *string    `json:"status" binding:"omitempty,oneof=planning in_progress completed on_hold archived"`
}

// WellCreateRequest represents the request body for creating a well.
type WellCreateRequest struct {
	WellCode       string     `json:"well_code" binding:"required"`
	WellName       string     `json:"well_name" binding:"required"`
	WellType       string     `json:"well_type" binding:"required,oneof=production monitoring exploration test other"`
	Location       string     `json:"location"`
	Latitude       string     `json:"latitude"`
	Longitude      string     `json:"longitude"`
	PlannedDepth   *float64   `json:"planned_depth"`
	ActualDepth    *float64   `json:"actual_depth"`
	DrillingDate   *string    `json:"drilling_date"`
	CompletionDate *string    `json:"completion_date"`
	Status         string     `json:"status" binding:"required,oneof=planned drilling completed on_hold abandoned"`
	Description    string     `json:"description"`
}

// WellUpdateRequest represents the request body for updating a well.
type WellUpdateRequest struct {
	WellCode       *string    `json:"well_code"`
	WellName       *string    `json:"well_name"`
	WellType       *string    `json:"well_type" binding:"omitempty,oneof=production monitoring exploration test other"`
	Location       *string    `json:"location"`
	Latitude       *string    `json:"latitude"`
	Longitude      *string    `json:"longitude"`
	PlannedDepth   *float64   `json:"planned_depth"`
	ActualDepth    *float64   `json:"actual_depth"`
	DrillingDate   *string    `json:"drilling_date"`
	CompletionDate *string    `json:"completion_date"`
	Status         *string    `json:"status" binding:"omitempty,oneof=planned drilling completed on_hold abandoned"`
	Description    *string    `json:"description"`
}

// DesignerUpsertRequest represents the request body for upserting designer state.
type DesignerUpsertRequest struct {
	Version   int  `json:"version"`
	Components any `json:"components"`
	Config     any `json:"config"`
}

// GeologyUpsertRequest represents the request body for upserting geology log.
type GeologyUpsertRequest struct {
	Version int  `json:"version"`
	Layers  any `json:"layers"`
}

// MonitoringUpsertRequest represents the request body for upserting monitoring data.
type MonitoringUpsertRequest struct {
	Version     int    `json:"version"`
	Measurements any `json:"measurements"`
}
