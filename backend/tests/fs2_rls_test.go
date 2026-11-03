package tests_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/borewell/visualizer/backend/internal/database"
)

// rlsTx menjalankan fn dalam satu transaksi dengan SET LOCAL app.current_user_id
// diatur ke userID, sehingga semua RLS policy dievaluasi sebagai user tersebut.
func rlsTx(t *testing.T, userID uuid.UUID, fn func(tx databaseTx) error) error {
	t.Helper()
	tx, err := suiteAppDB.BeginTx(context.Background())
	if err != nil {
		return err
	}
	wrapped := pgxTxWrap{tx: tx}
	if _, err := wrapped.Exec(context.Background(), "SET LOCAL app.current_user_id = '"+userID.String()+"'"); err != nil {
		tx.Rollback(context.Background())
		return err
	}
	if err := fn(wrapped); err != nil {
		tx.Rollback(context.Background())
		return err
	}
	return tx.Commit(context.Background())
}

// databaseTx adalah subset method database.Tx yang dibutuhkan pengujian.
type databaseTx interface {
	Exec(ctx context.Context, sql string, args ...interface{}) (interface{}, error)
	QueryRow(ctx context.Context, sql string, args ...interface{}) rowScanner
}

type rowScanner interface {
	Scan(dest ...interface{}) error
}

// pgxTxWrap mengubah database.Tx (dari suiteAppDB.BeginTx) menjadi databaseTx.
type pgxTxWrap struct{ tx database.Tx }

func (w pgxTxWrap) Exec(ctx context.Context, sql string, args ...interface{}) (interface{}, error) {
	return w.tx.Exec(ctx, sql, args...)
}

func (w pgxTxWrap) QueryRow(ctx context.Context, sql string, args ...interface{}) rowScanner {
	return pgxRowWrap{w.tx.QueryRow(ctx, sql, args...)}
}

type pgxRowWrap struct{ row pgxRow }

type pgxRow interface {
	Scan(dest ...interface{}) error
}

func (w pgxRowWrap) Scan(dest ...interface{}) error {
	return w.row.Scan(dest...)
}

func countAs(t *testing.T, userID uuid.UUID, query string, args ...interface{}) int {
	t.Helper()
	var n int
	err := rlsTx(t, userID, func(tx databaseTx) error {
		return tx.QueryRow(context.Background(), query, args...).Scan(&n)
	})
	if err != nil {
		t.Fatalf("countAs(user=%s): %v", userID, err)
	}
	return n
}

func execAs(t *testing.T, userID uuid.UUID, query string, args ...interface{}) {
	t.Helper()
	_ = rlsTx(t, userID, func(tx databaseTx) error {
		_, err := tx.Exec(context.Background(), query, args...)
		return err
	})
}

func TestRLSIsolation(t *testing.T) {
	resetTestState(t)
	seed := suiteSeed

	// Buat well milik user A dan user B dalam konteks RLS masing-masing.
	wellA := createWellAs(t, seed.userAID, seed.projAID, "W-A")
	wellB := createWellAs(t, seed.userBID, seed.projBID, "W-B")

	// ---- 1. User A hanya melihat project miliknya; user B hanya miliknya ----
	if n := countAs(t, seed.userAID, "SELECT count(*) FROM projects"); n != 1 {
		t.Fatalf("user A should see 1 project, got %d", n)
	}
	if n := countAs(t, seed.userBID, "SELECT count(*) FROM projects"); n != 1 {
		t.Fatalf("user B should see 1 project, got %d", n)
	}

	// ---- 2. Cross-user read blocked ----
	if n := countAs(t, seed.userAID, "SELECT count(*) FROM projects WHERE id = $1", seed.projBID); n != 0 {
		t.Fatalf("user A should not see project B, got %d", n)
	}
	if n := countAs(t, seed.userBID, "SELECT count(*) FROM projects WHERE id = $1", seed.projAID); n != 0 {
		t.Fatalf("user B should not see project A, got %d", n)
	}

	// ---- 3. Cross-user update/delete blocked ----
	execAs(t, seed.userAID, "UPDATE projects SET project_name = 'hacked' WHERE id = $1", seed.projBID)
	if n := countAs(t, seed.userBID, "SELECT count(*) FROM projects WHERE id = $1 AND project_name = 'hacked'", seed.projBID); n != 0 {
		t.Fatal("user A should not be able to update project B")
	}

	execAs(t, seed.userBID, "DELETE FROM projects WHERE id = $1", seed.projAID)
	if n := countAs(t, seed.userAID, "SELECT count(*) FROM projects WHERE id = $1", seed.projAID); n != 1 {
		t.Fatal("user B should not be able to delete project A")
	}

	// ---- 4. Admin melalui RLS hanya melihat project yang di-nya-nya (admin tak punya project) ----
	if n := countAs(t, seed.adminID, "SELECT count(*) FROM projects"); n != 0 {
		t.Fatalf("admin (no owned projects) should see 0 projects via RLS, got %d", n)
	}

	// ---- 5. Tanpa user context, query project tidak boleh bocorkan data -
	// Fail-closed: query berhasil tapi mengembalikan 0 baris (tidak ada data yang bocor).
	var n int
	err := suiteAppDB.Pool.QueryRow(context.Background(), "SELECT count(*) FROM projects").Scan(&n)
	if err != nil {
		t.Fatalf("query projects without context errored unexpectedly: %v", err)
	}
	if n != 0 {
		t.Fatalf("query projects without context should return 0 rows (fail-closed), got %d", n)
	}

	// ---- 6. Context tidak bocor antar-koneksi connection pool ----
	if err := contextLeakCheck(t, seed.userAID, seed.projAID); err != nil {
		t.Fatalf("context leak: %v", err)
	}

	// ---- 7. Well-level isolasi via RLS (well->project->owner) ----
	if n := countAs(t, seed.userAID, "SELECT count(*) FROM wells WHERE id = $1", wellA); n != 1 {
		t.Fatalf("user A should see own well %s, got %d", wellA, n)
	}
	if n := countAs(t, seed.userBID, "SELECT count(*) FROM wells WHERE id = $1", wellA); n != 0 {
		t.Fatalf("user B should not see well A, got %d", n)
	}
	if n := countAs(t, seed.userAID, "SELECT count(*) FROM wells WHERE id = $1", wellB); n != 0 {
		t.Fatalf("user A should not see well B, got %d", n)
	}

	t.Logf("RLS isolation across projects/wells: PASS")
}

// createWellAs membuat well dalam konteks RLS owner dan mengembalikan id-nya.
func createWellAs(t *testing.T, ownerID, projectID uuid.UUID, code string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := rlsTx(t, ownerID, func(tx databaseTx) error {
		return tx.QueryRow(context.Background(), `
			INSERT INTO wells (id, project_id, well_code, well_name, status)
			VALUES ($1, $2, $3, $4, 'planned')
			RETURNING id
		`, uuid.New(), projectID, code, "Well "+code).Scan(&id)
	})
	if err != nil {
		t.Fatalf("createWellAs: %v", err)
	}
	return id
}

// contextLeakCheck memastikan konteks RLS (SET LOCAL) adalah per-koneksi dan tidak
// bocor ke koneksi lain dari connection pool yang tidak mengatur konteks.
func contextLeakCheck(t *testing.T, userID uuid.UUID, projectID uuid.UUID) error {
	t.Helper()
	tx1, err := suiteAppDB.BeginTx(context.Background())
	if err != nil {
		return err
	}
	if _, err := tx1.Exec(context.Background(), "SET LOCAL app.current_user_id = '"+userID.String()+"'"); err != nil {
		tx1.Rollback(context.Background())
		return err
	}
	var n1 int
	if err := tx1.QueryRow(context.Background(), "SELECT count(*) FROM projects WHERE id = $1", projectID).Scan(&n1); err != nil {
		tx1.Rollback(context.Background())
		return err
	}
	if err := tx1.Commit(context.Background()); err != nil {
		return err
	}
	if n1 != 1 {
		return &contextLeakError{msg: "conn1 should see own project"}
	}

	// Koneksi 2 (bukan transaksi yang sama): tidak mengatur context.
	var n2 int
	err = suiteAppDB.Pool.QueryRow(context.Background(), "SELECT count(*) FROM projects WHERE id = $1", projectID).Scan(&n2)
	if err == nil && n2 != 0 {
		return &contextLeakError{msg: "conn2 without context leaked data"}
	}
	return nil
}

type contextLeakError struct{ msg string }

func (e *contextLeakError) Error() string { return e.msg }

var _ = uuid.New
