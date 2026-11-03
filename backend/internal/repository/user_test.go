package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/borewell/visualizer/backend/internal/database"
)

var testDB *database.DB
var testRepo *UserRepo

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		// Gunakan database uji disposable, bukan database utama borewell.
		dsn = "postgres://borewell_app:app_password_change_me@localhost:5433/borewell_fs3_test?sslmode=disable"
	}

	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		panic(err)
	}

	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	testDB = &database.DB{Pool: pool}
	testRepo = NewUserRepo(testDB)

	code := m.Run()
	os.Exit(code)
}

// newTestUser membuat user dengan email unik (berbasis UUID) dan mengembalikan
// fungsi cleanup yang menghapus user setelah selesai. Tidak menggunakan email
// tetap yang dapat bertabrakan antara pemanggilan tes.
func newTestUser(t *testing.T, role, status string) (*User, func()) {
	t.Helper()
	ctx := context.Background()
	userID := uuid.New()
	email := fmt.Sprintf("test-unit-%s-%s@local.test", role, uuid.New().String())
	user := &User{
		ID:           userID,
		Email:        email,
		PasswordHash: "$argon2id$v=19$m=65536,t=3,p=4$salt$hash",
		FullName:     "Test User",
		Role:         role,
		Status:       status,
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}
	if err := testRepo.Create(ctx, user); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	cleanup := func() {
		_, _ = testDB.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	}
	return user, cleanup
}

func TestUserRepoCreateAndGet(t *testing.T) {
	ctx := context.Background()
	user, cleanup := newTestUser(t, "user", "pending")
	defer cleanup()

	got, err := testRepo.GetByEmail(ctx, user.Email)
	if err != nil {
		t.Fatalf("GetByEmail failed: %v", err)
	}

	if got.ID != user.ID {
		t.Fatal("user ID mismatch")
	}
	if got.Email != user.Email {
		t.Fatal("email mismatch")
	}
	if got.Role != "user" {
		t.Fatal("role mismatch")
	}
	if got.Status != "pending" {
		t.Fatal("status mismatch")
	}
}

func TestUserRepoDuplicateEmail(t *testing.T) {
	ctx := context.Background()
	user, cleanup := newTestUser(t, "user", "pending")
	defer cleanup()

	dup := &User{
		ID:           uuid.New(),
		Email:        user.Email, // sengaja sama untuk memicu duplicate
		PasswordHash: "$argon2id$v=19$m=65536,t=3,p=4$salt$hash",
		FullName:     "Dup User 2",
		Role:         "user",
		Status:       "pending",
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	}

	if err := testRepo.Create(ctx, dup); err == nil {
		t.Fatal("expected ErrEmailExists for duplicate email")
	}
}

func TestUserRepoGetByID(t *testing.T) {
	ctx := context.Background()
	user, cleanup := newTestUser(t, "user", "approved")
	defer cleanup()

	got, err := testRepo.GetByID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}

	if got.ID != user.ID {
		t.Fatal("user ID mismatch")
	}
}

func TestUserRepoExistsAdmin(t *testing.T) {
	ctx := context.Background()
	// Buat admin sendiri untuk menghindari ketergantungan pada data bootstrap
	// atau urutan eksekusi tes lain.
	admin, cleanup := newTestUser(t, "admin", "approved")
	defer cleanup()

	exists, err := testRepo.ExistsAdmin(ctx)
	if err != nil {
		t.Fatalf("ExistsAdmin failed: %v", err)
	}
	if !exists {
		t.Fatal("expected admin to exist")
	}
	_ = admin.ID // admin digunakan untuk memastikan ExistsAdmin bekerja
}

func TestUserRepoUpdateStatus(t *testing.T) {
	ctx := context.Background()
	user, cleanup := newTestUser(t, "user", "pending")
	defer cleanup()

	// Buat user aprovir yang benar-benar ada di tabel users (FK constraint).
	approver, approverCleanup := newTestUser(t, "admin", "approved")
	defer approverCleanup()

	if err := testRepo.UpdateStatus(ctx, user.ID, "approved", &approver.ID, nil); err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}

	got, err := testRepo.GetByEmail(ctx, user.Email)
	if err != nil {
		t.Fatalf("GetByEmail failed: %v", err)
	}

	if got.Status != "approved" {
		t.Fatal("status should be approved")
	}
}
