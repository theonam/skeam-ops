"use client";

import { ArrowDown, ArrowUp, Ban, FileDown, Heading, Mail, Plus, Save, Send, Sigma, StickyNote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { useAttachments } from "@/components/attachments/use-attachments";
import { useFileDrop } from "@/components/attachments/use-file-drop";
import { DocumentEmailDialog, type EmailDefaults } from "@/components/documents/email-dialog";
import { DocumentPreview } from "@/components/documents/document-preview";
import { StatusBadge } from "@/components/lists/status-badge";
import { Button } from "@/components/ui/button";
import { callApi } from "@/components/ui/dialog";
import { Field, Select, TextInput } from "@/components/ui/field";
import { DOCUMENT_TYPE, VAT_RATES_BP, type DocumentStatus, type DocumentType, type LineType } from "@/domain/enums";
import { formatCents, formatCentsPlain, formatQuantityMilli, formatRateBp, parseScaled } from "@/domain/money";
import { computeTotals } from "@/domain/totals";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { buildDocumentView, type CompanyInfo } from "@/lib/documents/view";
import type { AttachmentView } from "@/server/attachments/service";

/**
 * Fiche d'un document à lignes. Brouillon : saisie des lignes avec totaux et aperçu en direct,
 * enregistrement sans quitter la fiche, puis émission. Document émis : lecture seule, PDF, brouillon
 * de mail Outlook, annulation. Photos, PDF et mails se déposent n'importe où sur la fiche.
 * Un profil sans droit sur les prix voit la fiche sans aucun montant : le serveur ne les envoie pas.
 *
 * Origine : egm-app `src/components/quotes/quote-editor.tsx`, réduit à l'essentiel générique :
 * sans catalogue BTP, rabais ni prix de marché.
 */

export type EditorLine = {
  key: string;
  type: LineType;
  articleId: string | null;
  code: string | null;
  label: string;
  unit: string | null;
  quantityText: string;
  priceText: string;
  vatRateBp: number;
};

export type ArticleOption = { id: string; code: string; label: string; unit: string; unitPriceCents: number; vatRateBp: number };

type Props = {
  document: {
    id: string;
    type: DocumentType;
    status: DocumentStatus;
    number: string | null;
    clientId: string;
    clientName: string;
    subject: string;
    documentDate: string | null;
    dueDate: string | null;
    buyerName: string | null;
    buyerAddress: string | null;
    cancelReason: string | null;
  };
  lines: EditorLine[];
  showPrices: boolean;
  canWrite: boolean;
  canIssue: boolean;
  canAddFiles: boolean;
  canEditFiles: boolean;
  company: CompanyInfo | null;
  clients: { id: string; label: string; name: string; address: string }[];
  articles: ArticleOption[];
  attachments: AttachmentView[];
};

let counter = 0;
const newKey = () => `l${Date.now()}-${counter++}`;

function toPayload(line: EditorLine) {
  if (line.type !== "item") return { type: line.type, label: line.label };
  return {
    type: "item" as const,
    articleId: line.articleId,
    code: line.code,
    label: line.label,
    unit: line.unit,
    quantityMilli: parseScaled(line.quantityText, 1000) ?? 0,
    unitPriceCents: parseScaled(line.priceText, 100) ?? 0,
    vatRateBp: line.vatRateBp,
  };
}

export function DocumentEditor(props: Props) {
  const { document: doc, showPrices, canWrite, canIssue, company } = props;
  const router = useRouter();
  const editable = canWrite && doc.status === "draft";
  const [clientId, setClientId] = useState(doc.clientId);
  const [subject, setSubject] = useState(doc.subject);
  const [lines, setLines] = useState<EditorLine[]>(props.lines);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [articleSearch, setArticleSearch] = useState("");
  const [mail, setMail] = useState<EmailDefaults | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const owner = { type: "document" as const, id: doc.id };
  const files = useAttachments({ owner, initial: props.attachments });
  const dragging = useFileDrop(rootRef, files.addFiles, props.canAddFiles);

  const payloadLines = useMemo(() => lines.map(toPayload), [lines]);
  const totals = useMemo(() => computeTotals(payloadLines), [payloadLines]);
  const client = props.clients.find((c) => c.id === clientId);
  const view = useMemo(() => {
    if (!showPrices || !company) return null;
    return buildDocumentView({
      type: doc.type,
      number: doc.number,
      status: doc.status,
      date: doc.documentDate ?? new Date().toISOString().slice(0, 10),
      dueDate: doc.dueDate,
      subject,
      company,
      buyer: doc.status === "draft" && client ? { name: client.name, address: client.address } : { name: doc.buyerName ?? doc.clientName, address: doc.buyerAddress },
      lines: payloadLines,
      annex: files.items
        .filter((a) => (a.kind === "photo" || a.kind === "sketch") && a.displayable)
        .map((a) => ({ id: a.id, src: `/fichiers/${a.id}?v=${a.version}`, caption: a.filename })),
    });
  }, [showPrices, company, doc, subject, client, payloadLines, files.items]);

  function update(next: EditorLine[]) {
    setLines(next);
    setDirty(true);
    setMessage(null);
  }

  function patch(key: string, change: Partial<EditorLine>) {
    update(lines.map((l) => (l.key === key ? { ...l, ...change } : l)));
  }

  function move(index: number, delta: number) {
    const next = [...lines];
    const [line] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, line);
    update(next);
  }

  function add(type: LineType, article?: ArticleOption) {
    const base: EditorLine = { key: newKey(), type, articleId: null, code: null, label: "", unit: null, quantityText: "1", priceText: "0", vatRateBp: 2000 };
    if (article) {
      Object.assign(base, { articleId: article.id, code: article.code, label: article.label, unit: article.unit, priceText: formatCentsPlain(article.unitPriceCents), vatRateBp: article.vatRateBp });
    }
    update([...lines, base]);
  }

  const matches = useMemo(() => {
    const q = articleSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return props.articles.filter((a) => a.code.toLowerCase().includes(q) || a.label.toLowerCase().includes(q)).slice(0, 12);
  }, [articleSearch, props.articles]);

  async function save(): Promise<boolean> {
    setBusy(true);
    const result = await callApi(`/api/documents/${doc.id}`, "PUT", { clientId, subject, lines: payloadLines });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return false;
    }
    setDirty(false);
    setMessage({ tone: "ok", text: "Brouillon enregistré." });
    router.refresh();
    return true;
  }

  async function issue() {
    if (!window.confirm("Émettre ce document ? Il recevra son numéro définitif et ne pourra plus être modifié.")) return;
    if (dirty && !(await save())) return;
    setBusy(true);
    const result = await callApi<{ number: string }>(`/api/documents/${doc.id}/emettre`, "POST");
    setBusy(false);
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMessage({ tone: "ok", text: `Document émis sous le numéro ${result.data.number}.` });
    router.refresh();
  }

  async function cancel() {
    const reason = window.prompt("Motif de l'annulation ?");
    if (!reason) return;
    const result = await callApi(`/api/documents/${doc.id}/annuler`, "POST", { reason });
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Supprimer ce brouillon ?")) return;
    const result = await callApi(`/api/documents/${doc.id}`, "DELETE");
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    router.push("/documents");
  }

  async function openMail() {
    const result = await callApi<{ to: string; subject: string; body: string }>(`/api/documents/${doc.id}/mail`, "GET");
    if (!result.ok) return setMessage({ tone: "error", text: result.error });
    setMail({ ...result.data, attachmentName: `${doc.number ?? "document"}.pdf` });
  }

  const title = `${DOCUMENT_TYPE.labels[doc.type]} ${doc.number ?? "brouillon"}`;

  return (
    <div ref={rootRef} data-document-editor className={cn("relative px-4 pb-8 tablet:px-6", dragging && "outline-2 outline-dashed outline-brand-600")}>
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-brand-900/20 text-lg font-bold text-brand-900">Déposez les fichiers sur la fiche</div>
      ) : null}
      <header className="flex flex-wrap items-center gap-3 py-4">
        <h1 className="text-xl font-extrabold tablet:text-2xl">{title}</h1>
        <StatusBadge status={doc.status} />
        {doc.documentDate ? <span className="text-sm text-slate-600">du {formatDate(doc.documentDate)}</span> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {editable ? (
            <>
              <Button variant="secondary" onClick={() => void save()} disabled={busy}>
                <Save aria-hidden className="size-4" /> Enregistrer
              </Button>
              <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
                <Trash2 aria-hidden className="size-4" /> Supprimer
              </Button>
            </>
          ) : null}
          {editable && canIssue ? (
            <Button onClick={() => void issue()} disabled={busy}>
              <Send aria-hidden className="size-4" /> Émettre
            </Button>
          ) : null}
          {showPrices ? (
            <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50">
              <FileDown aria-hidden className="size-4" /> PDF
            </a>
          ) : null}
          {canWrite && (doc.status === "issued" || doc.status === "sent") ? (
            <Button onClick={() => void openMail()}>
              <Mail aria-hidden className="size-4" /> Préparer le mail
            </Button>
          ) : null}
          {canIssue && (doc.status === "issued" || doc.status === "sent") ? (
            <Button variant="ghost" onClick={() => void cancel()}>
              <Ban aria-hidden className="size-4" /> Annuler le document
            </Button>
          ) : null}
        </div>
      </header>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={cn("mb-3 rounded-lg px-3 py-2 text-sm", message.tone === "error" ? "bg-urgent-50 text-urgent-700" : "bg-emerald-50 text-emerald-800")}>
          {message.text}
        </p>
      ) : null}
      {doc.status === "cancelled" && doc.cancelReason ? <p className="mb-3 rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700">Annulé : {doc.cancelReason}</p> : null}

      <div className="grid gap-6 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] wide:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-card tablet:grid-cols-2">
            <Field label="Client" htmlFor="doc-client">
              {editable ? (
                <Select id="doc-client" value={clientId} onChange={(e) => (setClientId(e.target.value), setDirty(true))}>
                  {props.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <p id="doc-client" className="py-2 font-medium">
                  {doc.buyerName ?? doc.clientName}
                </p>
              )}
            </Field>
            <Field label="Objet" htmlFor="doc-subject">
              {editable ? (
                <TextInput id="doc-subject" value={subject} onChange={(e) => (setSubject(e.target.value), setDirty(true))} />
              ) : (
                <p id="doc-subject" className="py-2">
                  {doc.subject}
                </p>
              )}
            </Field>
          </section>

          <section aria-label="Lignes" className="rounded-2xl bg-white p-2 shadow-card tablet:p-4">
            <ol className="space-y-2">
              {lines.map((line, i) => (
                <li key={line.key} data-line-type={line.type} className="rounded-xl ring-1 ring-slate-200">
                  <LineRow line={line} total={totals.lineTotals[i]} editable={editable} showPrices={showPrices} onPatch={(c) => patch(line.key, c)} onMove={(d) => move(i, d)} onDelete={() => update(lines.filter((l) => l.key !== line.key))} first={i === 0} last={i === lines.length - 1} />
                </li>
              ))}
            </ol>
            {lines.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucune ligne.</p> : null}
            {editable ? (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <TextInput aria-label="Ajouter un article" placeholder="Ajouter un article : code ou libellé" value={articleSearch} onChange={(e) => setArticleSearch(e.target.value)} />
                  {matches.length > 0 ? (
                    <ul role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl bg-white p-1 shadow-pop ring-1 ring-slate-200">
                      {matches.map((a) => (
                        <li key={a.id}>
                          <button type="button" role="option" aria-selected={false} onClick={() => (add("item", a), setArticleSearch(""))} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100">
                            <span className="font-mono text-xs text-slate-500">{a.code}</span>
                            <span className="flex-1 truncate">{a.label}</span>
                            <span className="tabular-nums">{formatCents(a.unitPriceCents)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => add("item")}>
                    <Plus aria-hidden className="size-4" /> Ligne libre
                  </Button>
                  <Button variant="secondary" onClick={() => add("title")}>
                    <Heading aria-hidden className="size-4" /> Titre
                  </Button>
                  <Button variant="secondary" onClick={() => add("note")}>
                    <StickyNote aria-hidden className="size-4" /> Note
                  </Button>
                  <Button variant="secondary" onClick={() => add("subtotal")}>
                    <Sigma aria-hidden className="size-4" /> Sous-total
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          {showPrices ? (
            <section aria-label="Totaux" data-totals className="ml-auto max-w-sm space-y-1 rounded-2xl bg-white p-4 text-sm shadow-card">
              <p className="flex justify-between">
                <span>Total HT</span>
                <span className="tabular-nums">{formatCents(totals.totalHtCents)}</span>
              </p>
              {totals.vat.map((v) => (
                <p key={v.rateBp} className="flex justify-between text-slate-600">
                  <span>TVA {formatRateBp(v.rateBp)} sur {formatCents(v.baseCents)}</span>
                  <span className="tabular-nums">{formatCents(v.vatCents)}</span>
                </p>
              ))}
              <p className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
                <span>Total TTC</span>
                <span className="tabular-nums">{formatCents(totals.totalTtcCents)}</span>
              </p>
            </section>
          ) : null}

          <section className="@container rounded-2xl bg-white p-4 shadow-card">
            <AttachmentsPanel
              state={files}
              owner={owner}
              canWrite={props.canAddFiles}
              onDelete={
                props.canEditFiles
                  ? async (a) => {
                      const result = await callApi(`/api/attachments/${a.id}`, "DELETE");
                      if (!result.ok) setMessage({ tone: "error", text: result.error });
                      return result.ok;
                    }
                  : undefined
              }
            />
          </section>
        </div>

        {view ? (
          <section aria-label="Aperçu" className="min-w-0 desktop:sticky desktop:top-4 desktop:self-start">
            <div className="h-[70vh] desktop:h-[calc(100dvh-2rem)]">
              <DocumentPreview view={view} title={`Aperçu ${title}`} />
            </div>
          </section>
        ) : null}
      </div>

      {mail ? (
        <DocumentEmailDialog
          endpoint={`/api/documents/${doc.id}/mail`}
          documentLabel={doc.type === "quote" ? "devis" : "facture"}
          note={doc.status === "issued" ? "Le document sera marqué envoyé." : null}
          defaults={mail}
          onPrepared={() => {
            setMail(null);
            router.refresh();
          }}
          onClose={() => setMail(null)}
        />
      ) : null}
    </div>
  );
}

function LineRow({
  line,
  total,
  editable,
  showPrices,
  onPatch,
  onMove,
  onDelete,
  first,
  last,
}: {
  line: EditorLine;
  total: number | null;
  editable: boolean;
  showPrices: boolean;
  onPatch: (change: Partial<EditorLine>) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
}) {
  const tools = editable ? (
    <div className="flex shrink-0 items-center">
      <button type="button" aria-label="Monter" disabled={first} onClick={() => onMove(-1)} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30">
        <ArrowUp aria-hidden className="size-4" />
      </button>
      <button type="button" aria-label="Descendre" disabled={last} onClick={() => onMove(1)} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30">
        <ArrowDown aria-hidden className="size-4" />
      </button>
      <button type="button" aria-label="Supprimer la ligne" onClick={onDelete} className="grid size-9 place-items-center rounded-lg text-urgent-700 hover:bg-urgent-50">
        <Trash2 aria-hidden className="size-4" />
      </button>
    </div>
  ) : null;

  if (line.type === "subtotal") {
    return (
      <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 font-semibold">
        <span className="flex-1">Sous-total</span>
        {showPrices && total !== null ? <span className="tabular-nums">{formatCents(total)}</span> : null}
        {tools}
      </div>
    );
  }
  if (line.type === "title" || line.type === "note") {
    return (
      <div className="flex items-center gap-2 p-2">
        {editable ? (
          <TextInput aria-label={line.type === "title" ? "Titre" : "Note"} value={line.label} onChange={(e) => onPatch({ label: e.target.value })} className={line.type === "title" ? "font-bold" : "italic"} />
        ) : (
          <p className={cn("flex-1 px-1", line.type === "title" ? "font-bold" : "text-slate-600 italic")}>{line.label}</p>
        )}
        {tools}
      </div>
    );
  }
  const quantity = formatQuantityMilli(parseScaled(line.quantityText, 1000) ?? 0);
  if (!editable) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
        {line.code ? <span className="font-mono text-xs text-slate-500">{line.code}</span> : null}
        <span className="min-w-0 flex-1 basis-48">{line.label}</span>
        <span className="text-sm text-slate-600 tabular-nums">
          {quantity} {line.unit}
        </span>
        {showPrices ? (
          <>
            <span className="text-sm tabular-nums">× {formatCents(parseScaled(line.priceText, 100) ?? 0)}</span>
            <span className="text-sm text-slate-600">TVA {formatRateBp(line.vatRateBp)}</span>
            <span className="ml-auto font-medium tabular-nums">{total !== null ? formatCents(total) : ""}</span>
          </>
        ) : null}
      </div>
    );
  }
  // Deux rangées : la désignation garde toute la largeur, les nombres se rangent dessous.
  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center gap-2">
        <TextInput aria-label="Code" value={line.code ?? ""} onChange={(e) => onPatch({ code: e.target.value || null })} className="w-24 shrink-0 tablet:w-28" />
        <TextInput aria-label="Libellé" value={line.label} onChange={(e) => onPatch({ label: e.target.value })} className="min-w-0 flex-1" />
        {tools}
      </div>
      <div className="grid grid-cols-2 gap-2 tablet:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_6rem_minmax(0,1fr)] tablet:items-center">
        <TextInput aria-label="Unité" value={line.unit ?? ""} onChange={(e) => onPatch({ unit: e.target.value || null })} />
        <TextInput aria-label="Quantité" inputMode="decimal" value={line.quantityText} onChange={(e) => onPatch({ quantityText: e.target.value })} aria-invalid={parseScaled(line.quantityText, 1000) === null} className="text-right" />
        <TextInput aria-label="Prix unitaire HT" inputMode="decimal" value={line.priceText} onChange={(e) => onPatch({ priceText: e.target.value })} aria-invalid={parseScaled(line.priceText, 100) === null} className="text-right" />
        <Select aria-label="TVA" value={line.vatRateBp} onChange={(e) => onPatch({ vatRateBp: Number(e.target.value) })}>
          {VAT_RATES_BP.map((r) => (
            <option key={r} value={r}>
              {formatRateBp(r)}
            </option>
          ))}
        </Select>
        <span className="col-span-2 text-right font-medium tabular-nums tablet:col-span-1">{total !== null ? formatCents(total) : ""}</span>
      </div>
    </div>
  );
}
