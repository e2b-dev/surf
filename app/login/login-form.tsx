"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type LoginFormState } from "./actions";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono uppercase tracking-wider text-fg-400">
          Email
        </label>
        <Input
          name="email"
          type="text"
          autoComplete="username"
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono uppercase tracking-wider text-fg-400">
          Password
        </label>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-error" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
