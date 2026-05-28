"use server";

import { redirect } from "next/navigation";

import { createSessionForUser, getInitializedDatabase } from "@/lib/auth";
import { createUser } from "@/lib/auth-store";

export interface SignupFormState {
  error?: string;
}

export async function signupAction(
  _state: SignupFormState,
  formData: FormData
): Promise<SignupFormState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  if (!email.trim() || !password) {
    return { error: "Enter an email and password." };
  }

  if (password.length < 6) {
    return { error: "Use a password with at least 6 characters." };
  }

  try {
    const user = await createUser(await getInitializedDatabase(), email, password);
    await createSessionForUser(user.id);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return { error: "A user with that email already exists." };
    }

    throw error;
  }

  redirect("/");
}
