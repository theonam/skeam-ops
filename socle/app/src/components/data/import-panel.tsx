"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SheetSummary = { source: string; entity: string; read: number; created: number; updated: number; rejected: number; missing: string[]; ignored: string[] };
type Result = { dryRun: boolean; sheets: SheetSummary[]; report: string };

function download(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import Excel : simulation d'abord, avec le rapport des lignes rejetées, puis import réel.
 * Les classeurs se déposent sur la zone ou se choisissent. Origine : egm-app `scripts/import-client-data.ts`,
 * porté dans l'application.
 */
export function ImportPanel({ entities }: { entities: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(apply: boolean) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const f of files) form.append("file", f);
    if (apply) form.set("apply", "1");
    try {
      const response = await fetch("/api/import", { method: "POST", body: form });
      const data = (await response.json()) as Result & { error?: string };
      if (!response.ok) setError(data.error ?? "Import impossible.");
      else setResult(data);
    } catch {
      setError("Réseau indisponible : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        data-import-drop
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFiles(Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".xlsx")));
          setResult(null);
        }}
        className="grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center"
      >
        <FileSpreadsheet aria-hidden className="size-8 text-brand-600" />
        <p className="text-sm text-slate-700">Déposez un ou plusieurs classeurs .xlsx, ou</p>
        <Button variant="secondary" onClick={() => input.current?.click()}>
          <Upload aria-hidden className="size-4" /> Choisir des fichiers
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          multiple
          hidden
          data-testid="import-input"
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setResult(null);
          }}
        />
        <p className="text-xs text-slate-500">Contenus reconnus : {entities.join(", ")}. Un titre au-dessus du tableau est ignoré.</p>
      </div>
      {files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{files.map((f) => f.name).join(", ")}</span>
          <Button variant="secondary" disabled={busy} onClick={() => void run(false)}>
            Simuler
          </Button>
          <Button disabled={busy || !result?.dryRun} onClick={() => void run(true)}>
            Importer
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700">
          {error}
        </p>
      ) : null}
      {result ? (
        <div data-import-result className="space-y-2 rounded-2xl bg-white p-4 shadow-card">
          <p className="font-semibold">{result.dryRun ? "Simulation : rien n'a été écrit." : "Import effectué."}</p>
          <ul className="space-y-1 text-sm">
            {result.sheets.map((s) => (
              <li key={s.source}>
                <strong>{s.source}</strong> → {s.entity} : {s.read} lignes, {s.created} {result.dryRun ? "à créer" : "créées"}, {s.updated} {result.dryRun ? "à mettre à jour" : "mises à jour"},{" "}
                <span className={s.rejected ? "font-semibold text-urgent-700" : undefined}>{s.rejected} rejetées</span>
                {s.missing.length ? <span className="block text-urgent-700">Manque : {s.missing.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => download(result.report, `rapport-import-${new Date().toISOString().slice(0, 10)}.xlsx`)}>
            <FileSpreadsheet aria-hidden className="size-4" /> Rapport des lignes rejetées
          </Button>
        </div>
      ) : null}
    </div>
  );
}
