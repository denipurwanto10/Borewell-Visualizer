package repository

import (
	"context"
	"testing"

	"github.com/borewell/visualizer/backend/internal/model"
	"github.com/google/uuid"
)

func newWellUpdateFixture(t *testing.T) (userID, wellID uuid.UUID, cleanup func()) {
	t.Helper()
	ctx := context.Background()

	userID = uuid.New()
	email := "wellupd-" + uuid.New().String() + "@local.test"
	u := &User{
		ID:           userID,
		Email:        email,
		PasswordHash: "hash",
		FullName:     "Well Update Test",
		Role:         "user",
		Status:       "approved",
	}
	if err := testRepo.Create(ctx, u); err != nil {
		t.Fatalf("create user: %v", err)
	}

	projectRepo := NewProjectRepo(testDB)
	projectID := uuid.New()
	p := &model.Project{
		ID:          projectID,
		OwnerID:     userID,
		ProjectCode: "P" + uuid.New().String()[:8],
		ProjectName: "Proj",
		Status:      "planning",
	}
	if err := projectRepo.Create(ctx, p); err != nil {
		t.Fatalf("create project: %v", err)
	}

	wellRepo := NewWellRepo(testDB)
	wellID = uuid.New()
	w := &model.Well{
		ID:        wellID,
		ProjectID: projectID,
		WellCode:  "W" + uuid.New().String()[:8],
		WellName:  "Well",
		WellType:  "production",
		Status:    "planned",
	}
	if err := wellRepo.Create(ctx, userID, w); err != nil {
		t.Fatalf("create well: %v", err)
	}

	cleanup = func() {
		testDB.Pool.Exec(ctx, `DELETE FROM wells WHERE id=$1`, wellID)
		testDB.Pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, projectID)
		testDB.Pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
	}
	return userID, wellID, cleanup
}

func TestWellRepoUpdateFewerThan10Args(t *testing.T) {
	userID, wellID, cleanup := newWellUpdateFixture(t)
	defer cleanup()

	repo := NewWellRepo(testDB)
	updates := map[string]any{
		"well_name": "Updated Name",
		"status":    "completed",
		"location":  "loc-a",
	}
	got, err := repo.Update(context.Background(), wellID, userID, updates)
	if err != nil {
		t.Fatalf("Update (<10) failed: %v", err)
	}
	if got == nil || got.WellName != "Updated Name" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestWellRepoUpdateTenArgs(t *testing.T) {
	userID, wellID, cleanup := newWellUpdateFixture(t)
	defer cleanup()

	repo := NewWellRepo(testDB)
	updates := map[string]any{
		"well_code":     "CODE10",
		"well_name":     "Name10",
		"well_type":     "exploration",
		"location":      "loc10",
		"latitude":      "1.5",
		"longitude":     "2.5",
		"planned_depth": 100.0,
		"actual_depth":  90.0,
		"status":        "drilling",
		"description":   "desc10",
	}
	got, err := repo.Update(context.Background(), wellID, userID, updates)
	if err != nil {
		t.Fatalf("Update (10) failed: %v", err)
	}
	if got == nil || got.WellName != "Name10" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestWellRepoUpdateElevenOrMoreArgs(t *testing.T) {
	userID, wellID, cleanup := newWellUpdateFixture(t)
	defer cleanup()

	repo := NewWellRepo(testDB)
	updates := map[string]any{
		"well_code":     "CODE11",
		"well_name":     "Name11",
		"well_type":     "exploration",
		"location":      "loc11",
		"latitude":      "1.5",
		"longitude":     "2.5",
		"planned_depth": 100.0,
		"actual_depth":  90.0,
		"status":        "drilling",
		"description":   "desc11",
		"drilling_date": nil,
	}
	got, err := repo.Update(context.Background(), wellID, userID, updates)
	if err != nil {
		t.Fatalf("Update (11+) failed: %v", err)
	}
	if got == nil || got.WellName != "Name11" {
		t.Fatalf("unexpected result: %+v", got)
	}
}
