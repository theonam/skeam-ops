// Nouveau dans le socle.
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
