import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { AppDatabase } from "./db";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface UserRecord {
  id: string;
  email: string;
  createdAt: Date;
}

export interface SessionRecord {
  token: string;
  userId: string;
  expiresAt: Date;
}

export interface SandboxRecord {
  sandboxId: string;
  userId: string;
  vncUrl: string;
  createdAt: Date;
  lastSeenAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
}

interface SessionUserRow {
  id: string;
  email: string;
  created_at: Date | string;
  expires_at: Date | string;
}

interface SandboxRow {
  sandbox_id: string;
  user_id: string;
  vnc_url: string;
  created_at: Date | string;
  last_seen_at: Date | string;
}

export async function initializeDatabase(db: AppDatabase): Promise<void> {
  await db.query(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists sessions (
      token text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table if not exists sandboxes (
      sandbox_id text primary key,
      user_id text not null references users(id) on delete cascade,
      vnc_url text not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now()
    );

    create index if not exists sessions_user_id_idx on sessions(user_id);
    create index if not exists sandboxes_user_id_idx on sandboxes(user_id);
  `);

  await seedDefaultAdmin(db);
}

export async function createUser(
  db: AppDatabase,
  email: string,
  password: string
): Promise<UserRecord> {
  const id = randomUUID();
  const normalizedEmail = normalizeEmail(email);
  const { rows } = await db.query<{ id: string; email: string; created_at: Date }>(
    `insert into users (id, email, password_hash)
     values ($1, $2, $3)
     returning id, email, created_at`,
    [id, normalizedEmail, hashPassword(password)]
  );

  return mapUser(rows[0]);
}

export async function getUserByEmail(
  db: AppDatabase,
  email: string
): Promise<(UserRecord & { passwordHash: string }) | null> {
  const { rows } = await db.query<UserRow>(
    "select id, email, password_hash, created_at from users where email = $1",
    [normalizeEmail(email)]
  );
  const row = rows[0];

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: toDate(row.created_at),
  };
}

export async function verifyUserPassword(
  db: AppDatabase,
  email: string,
  password: string
): Promise<UserRecord | null> {
  const user = await getUserByEmail(db, email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function createSession(
  db: AppDatabase,
  userId: string
): Promise<SessionRecord> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query(
    "insert into sessions (token, user_id, expires_at) values ($1, $2, $3)",
    [token, userId, expiresAt]
  );

  return {
    token,
    userId,
    expiresAt,
  };
}

export async function getUserBySessionToken(
  db: AppDatabase,
  token: string | undefined
): Promise<UserRecord | null> {
  if (!token) return null;

  const { rows } = await db.query<SessionUserRow>(
    `select users.id, users.email, users.created_at, sessions.expires_at
     from sessions
     join users on users.id = sessions.user_id
     where sessions.token = $1`,
    [token]
  );
  const row = rows[0];

  if (!row || toDate(row.expires_at).getTime() <= Date.now()) {
    if (row) await deleteSession(db, token);
    return null;
  }

  return mapUser(row);
}

export async function deleteSession(
  db: AppDatabase,
  token: string
): Promise<void> {
  await db.query("delete from sessions where token = $1", [token]);
}

export async function createSandboxRecord(
  db: AppDatabase,
  input: { userId: string; sandboxId: string; vncUrl: string }
): Promise<SandboxRecord> {
  const { rows } = await db.query<SandboxRow>(
    `insert into sandboxes (sandbox_id, user_id, vnc_url)
     values ($1, $2, $3)
     on conflict(sandbox_id) do update set
       user_id = excluded.user_id,
       vnc_url = excluded.vnc_url,
       last_seen_at = now()
     returning sandbox_id, user_id, vnc_url, created_at, last_seen_at`,
    [input.sandboxId, input.userId, input.vncUrl]
  );

  return mapSandbox(rows[0]);
}

export async function touchSandboxForUser(
  db: AppDatabase,
  userId: string,
  sandboxId: string
): Promise<boolean> {
  const result = await db.query(
    "update sandboxes set last_seen_at = now() where user_id = $1 and sandbox_id = $2",
    [userId, sandboxId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getSandboxForUser(
  db: AppDatabase,
  userId: string,
  sandboxId: string
): Promise<SandboxRecord | null> {
  const { rows } = await db.query<SandboxRow>(
    `select sandbox_id, user_id, vnc_url, created_at, last_seen_at
     from sandboxes
     where user_id = $1 and sandbox_id = $2`,
    [userId, sandboxId]
  );
  const row = rows[0];

  return row ? mapSandbox(row) : null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);

  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [scheme, saltValue, hashValue] = storedHash.split(":");
  if (scheme !== "scrypt" || !saltValue || !hashValue) return false;

  const salt = Buffer.from(saltValue, "base64url");
  const expectedHash = Buffer.from(hashValue, "base64url");
  const actualHash = scryptSync(password, salt, expectedHash.length);

  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
}

async function seedDefaultAdmin(db: AppDatabase): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    "select id from users where email = $1",
    ["admin"]
  );

  if (rows[0]) return;

  await createUser(db, "admin", "admin");
}

function mapUser(row: { id: string; email: string; created_at: Date | string }) {
  return {
    id: row.id,
    email: row.email,
    createdAt: toDate(row.created_at),
  };
}

function mapSandbox(row: SandboxRow): SandboxRecord {
  return {
    sandboxId: row.sandbox_id,
    userId: row.user_id,
    vncUrl: row.vnc_url,
    createdAt: toDate(row.created_at),
    lastSeenAt: toDate(row.last_seen_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
