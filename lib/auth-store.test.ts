import assert from "node:assert/strict";
import { test } from "node:test";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

import {
  createUser,
  initializeDatabase,
  createSession,
  createSandboxRecord,
  deleteSandboxRecordForUser,
  getLatestActiveSandboxForUser,
  getSandboxForUser,
  touchSandboxForUser,
  verifyPassword,
} from "./auth-store";

function createTestPool(): Pool {
  const memoryDb = newDb();
  const adapter = memoryDb.adapters.createPg();

  return new adapter.Pool();
}

test("database initialization seeds the default admin user", async (t) => {
  const db = createTestPool();
  t.after(() => db.end());

  await initializeDatabase(db);

  const { rows } = await db.query<{
    id: string;
    email: string;
    password_hash: string;
  }>("select id, email, password_hash from users where email = $1", ["admin"]);
  const admin = rows[0];

  assert.equal(admin.email, "admin");
  assert.notEqual(admin.password_hash, "admin");
  assert.equal(verifyPassword("admin", admin.password_hash), true);
});

test("sandbox records are only returned for their owning user", async (t) => {
  const db = createTestPool();
  t.after(() => db.end());
  await initializeDatabase(db);

  const userA = await createUser(db, "a@example.com", "password-a");
  const userB = await createUser(db, "b@example.com", "password-b");

  await createSandboxRecord(db, {
    userId: userA.id,
    sandboxId: "sandbox-a",
    vncUrl: "https://vnc-a.example.test",
  });

  assert.equal(
    (await getSandboxForUser(db, userA.id, "sandbox-a"))?.vncUrl,
    "https://vnc-a.example.test"
  );
  assert.equal(await getSandboxForUser(db, userB.id, "sandbox-a"), null);
});

test("latest active sandbox is selected until its timer expires", async (t) => {
  const db = createTestPool();
  t.after(() => db.end());
  await initializeDatabase(db);

  const user = await createUser(db, "resume@example.com", "password");
  const expiredAt = new Date(Date.now() - 60_000);
  const activeExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const latestExpiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await createSandboxRecord(db, {
    userId: user.id,
    sandboxId: "expired-sandbox",
    vncUrl: "https://expired.example.test",
    timeoutMs: 60 * 60 * 1000,
    expiresAt: expiredAt,
  });
  await createSandboxRecord(db, {
    userId: user.id,
    sandboxId: "active-sandbox",
    vncUrl: "https://active.example.test",
    timeoutMs: 60 * 60 * 1000,
    expiresAt: activeExpiresAt,
  });
  await touchSandboxForUser(db, user.id, "active-sandbox");
  await createSandboxRecord(db, {
    userId: user.id,
    sandboxId: "latest-sandbox",
    vncUrl: "https://latest.example.test",
    timeoutMs: 8 * 60 * 60 * 1000,
    expiresAt: latestExpiresAt,
  });
  await touchSandboxForUser(db, user.id, "latest-sandbox");

  const latest = await getLatestActiveSandboxForUser(db, user.id);

  assert.equal(latest?.sandboxId, "latest-sandbox");
  assert.equal(latest?.timeoutMs, 8 * 60 * 60 * 1000);
  assert.equal(latest?.expiresAt.getTime(), latestExpiresAt.getTime());
});

test("sandbox records can update timer state and be deleted for a user", async (t) => {
  const db = createTestPool();
  t.after(() => db.end());
  await initializeDatabase(db);

  const userA = await createUser(db, "owner@example.com", "password");
  const userB = await createUser(db, "other@example.com", "password");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await createSandboxRecord(db, {
    userId: userA.id,
    sandboxId: "sandbox-to-update",
    vncUrl: "https://sandbox.example.test",
  });
  await touchSandboxForUser(db, userA.id, "sandbox-to-update", {
    timeoutMs: 24 * 60 * 60 * 1000,
    expiresAt,
  });

  const updated = await getSandboxForUser(db, userA.id, "sandbox-to-update");
  assert.equal(updated?.timeoutMs, 24 * 60 * 60 * 1000);
  assert.equal(updated?.expiresAt.getTime(), expiresAt.getTime());

  assert.equal(
    await deleteSandboxRecordForUser(db, userB.id, "sandbox-to-update"),
    false
  );
  assert.equal(
    await deleteSandboxRecordForUser(db, userA.id, "sandbox-to-update"),
    true
  );
  assert.equal(await getSandboxForUser(db, userA.id, "sandbox-to-update"), null);
});

test("sessions map opaque tokens back to users", async (t) => {
  const db = createTestPool();
  t.after(() => db.end());
  await initializeDatabase(db);

  const user = await createUser(db, "session@example.com", "password");
  const session = await createSession(db, user.id);

  const { rows } = await db.query<{ email: string }>(
    "select users.email from sessions join users on users.id = sessions.user_id where sessions.token = $1",
    [session.token]
  );

  assert.equal(rows[0].email, "session@example.com");
  assert.ok(session.expiresAt.getTime() > Date.now());
});
