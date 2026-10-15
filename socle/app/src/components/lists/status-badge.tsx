// Nouveau dans le socle.
import { DOCUMENT_STATUS, type DocumentStatus } from "@/domain/enums";
import { cn } from "@/lib/cn";

const TONES: Record<DocumentStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-300",
  issued: "bg-brand-50 text-brand-900 ring-brand-100",
  sent: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-urgent-50 text-urgent-700 ring-urgent-600/30",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1", TONES[status])}>{DOCUMENT_STATUS.labels[status]}</span>;
}
