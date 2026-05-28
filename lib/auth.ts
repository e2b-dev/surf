import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createSession,
  deleteSession,
  getUserBySessionToken,
  initializeDatabase,
  type SessionRecord,
  type UserRecord,
} from "./auth-store";
import { getAppDatabase, type AppDatabase } from "./db";

export const SESSION_COOKIE_NAME = "surf_session";

let initializationPromise: Promise<void> | null = null;

export async function getInitializedDatabase(): Promise<AppDatabase> {
  const db = getAppDatabase();

  if (!initializationPromise) {
    initializationPromise = initializeDatabase(db);
  }

  await initializationPromise;
  return db;
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getUserBySessionToken(await getInitializedDatabase(), token);
}

export async function requireCurrentUser(): Promise<UserRecord> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function createSessionForUser(userId: string): Promise<SessionRecord> {
  const session = await createSession(await getInitializedDatabase(), userId);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });

  return session;
}

export async function clearCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSession(await getInitializedDatabase(), token);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
