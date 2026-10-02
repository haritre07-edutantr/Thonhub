CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE auth_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, return_to TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
--> statement-breakpoint
CREATE TABLE auth_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE pending_uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pathname TEXT NOT NULL UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
