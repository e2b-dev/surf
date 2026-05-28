"use server";

import { redirect } from "next/navigation";

import { createSessionForUser, getInitializedDatabase } from "@/lib/auth";
import { verifyUserPassword } from "@/lib/auth-store";

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _state: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  if (!email.trim() || !password) {
    return { error: "Enter an email and password." };
  }

  const user = await verifyUserPassword(
    await getInitializedDatabase(),
    email,
    password
  );

  if (!user) {
    return { error: "Invalid email or password." };
  }

  await createSessionForUser(user.id);
  redirect("/");
}
