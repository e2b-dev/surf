import AppShell from "@/components/app-shell";
import { requireCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireCurrentUser();

  return <AppShell userEmail={user.email} />;
}
