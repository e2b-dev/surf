import Link from "next/link";
import { redirect } from "next/navigation";

import Frame from "@/components/frame";
import Logo from "@/components/logo";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="flex h-dvh w-full items-center justify-center p-4">
      <Frame
        classNames={{
          wrapper: "w-full max-w-md",
          frame: "p-6 sm:p-8",
        }}
      >
        <div className="mb-8 flex items-center gap-3">
          <Logo width={36} height={36} />
          <div>
            <h1 className="text-xl font-medium">Create account</h1>
            <p className="text-sm text-fg-400">Start a private sandbox.</p>
          </div>
        </div>

        <SignupForm />

        <p className="mt-6 text-sm text-fg-400">
          Already have an account?{" "}
          <Link className="text-accent underline underline-offset-2" href="/login">
            Sign in
          </Link>
        </p>
      </Frame>
    </main>
  );
}
