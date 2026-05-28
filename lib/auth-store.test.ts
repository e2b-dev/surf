import assert from "node:assert/strict";
import { test } from "node:test";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

import {
  createUser,
  initializeDatabase,
  createSession,
  createSandboxRecord,
  getSandboxForUser,
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
