-- init-scripts/01-roles.sql
-- This script runs during PostgreSQL container initialization as postgres superuser
-- Creates extensions, roles, and grants

-- Create required extensions (requires superuser)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Create migration role (owner, can run DDL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'borewell_migrate') THEN
        CREATE ROLE borewell_migrate WITH LOGIN PASSWORD 'migrate_password_change_me';
    END IF;
END $$;

-- Create application role (runtime, minimal privileges)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'borewell_app') THEN
        CREATE ROLE borewell_app WITH LOGIN PASSWORD 'app_password_change_me';
    END IF;
END $$;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO borewell_migrate;
GRANT USAGE ON SCHEMA public TO borewell_app;

-- Grant create on schema to migration role
GRANT CREATE ON SCHEMA public TO borewell_migrate;

-- Default privileges for migration role (will own tables)
ALTER DEFAULT PRIVILEGES FOR ROLE borewell_migrate IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO borewell_app;

ALTER DEFAULT PRIVILEGES FOR ROLE borewell_migrate IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO borewell_app;

ALTER DEFAULT PRIVILEGES FOR ROLE borewell_migrate IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO borewell_app;

-- Ensure borewell_app can connect
GRANT CONNECT ON DATABASE borewell TO borewell_app;
GRANT CONNECT ON DATABASE borewell TO borewell_migrate;