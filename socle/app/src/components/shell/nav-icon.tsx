import { Database, FileText, History, Package, Settings, Users } from "lucide-react";
import type { NavIconName } from "@/config/navigation";

// Origine : egm-app `src/components/shell/nav-icon.tsx`.
const ICONS = { documents: FileText, clients: Users, articles: Package, data: Database, journal: History, settings: Settings } as const;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden className={className} />;
}
