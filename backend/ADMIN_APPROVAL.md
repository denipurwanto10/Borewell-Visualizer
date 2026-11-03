# Admin Approval — Borewell Engineering Visualizer v2.0.0

## Ringkasan

Dokumen ini menjelaskan workflow persetujuan Admin untuk akun pengguna baru. Semua pengguna baru dibuat dengan status `PENDING` dan tidak dapat login hingga di-approve oleh Admin.

## Alur Persetujuan

```
Registrasi (PENDING) → Admin Approval → APPROVED → Login
                              ↳ Reject → REJECTED (tidak dapat login)
                              ↳ Suspend → SUSPENDED (tidak dapat login)
```

## Endpoint Admin

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/v1/admin/users/pending` | Daftar pengguna menunggu approval |
| GET | `/api/v1/admin/users` | Daftar semua pengguna (dengan filter status/role) |
| POST | `/api/v1/admin/users/{id}/approve` | Setujui pengguna (status → approved) |
| POST | `/api/v1/admin/users/{id}/reject` | Tolak pengguna (status → rejected, alasan wajib) |
| POST | `/api/v1/admin/users/{id}/suspend` | Tangguhkan pengguna (status → suspended, alasan wajib) |
| POST | `/api/v1/admin/users/{id}/unsuspend` | Aktifkan kembali (status → approved) |

## Kontrol Akses

- Hanya `ADMIN` dengan status `APPROVED` yang dapat mengakses endpoint admin.
- `USER` tidak dapat mengakses endpoint admin (403 Forbidden).
- Admin tidak dapat approve/reject/suspend/unsuspend dirinya sendiri.
- Admin tidak dapat menonaktifkan Admin terakhir (minimal 1 admin approved harus tersisa).
- Admin tidak dapat mengubah role sendiri melalui endpoint approval.

## Aktivitas Log

Semua perubahan status dicatat di `activity_logs`:
- `user.approve` dengan metadata `{ approved_by: "<admin-uuid>" }`
- `user.reject` dengan metadata `{ rejected_by: "<admin-uuid>", reason: "<alasan>" }`
- `user.suspend` dengan metadata `{ suspended_by: "<admin-uuid>", reason: "<alasan>" }`
- `user.unsuspend` dengan metadata `{ unsuspended_by: "<admin-uuid>" }`

## Session Revocation

Saat pengguna di-reject atau di-suspend:
- Semua refresh session aktif untuk pengguna tersebut dicabut (`revoked_at` diisi).
- Refresh token yang sudah dicabut tidak dapat digunakan untuk refresh.
- Access token yang sudah diterbitkan masih berlaku hingga masa berlaku habis (15 menit), tetapi `GET /auth/me` akan menolak karena memeriksa status di database.

## Bootstrap Admin Pertama

```
go run ./cmd/bootstrap-admin --email admin@local --password "SecurePass123!" --name "Administrator"
```

Jika admin pertama sudah tersedia, command berhenti dengan pesan:
```
admin user already exists, bootstrap not allowed
```

## Validasi Input

- Alasan penolakan/penangguhan: maksimal 500 karakter, wajib diisi.
- User ID: harus UUID valid, harus ada di database.
- Status target harus `PENDING` untuk approve/reject.

## Keterbatasan

- Tidak ada email notification saat approval/reject.
- Tidak ada fitur bulk approve/reject.
- Tidak ada fitur appeal untuk pengguna yang ditolak.