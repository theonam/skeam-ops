import type { ReactNode } from "react";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 px-4 pt-4 pb-2 tablet:px-6 tablet:pt-6">
      <h1 className="truncate text-xl font-extrabold tracking-tight text-ink tablet:text-[28px]">{title}</h1>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
