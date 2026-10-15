"use client";

import { AlertCircle, Camera, Download, ExternalLink, File, FileSpreadsheet, FileText, ImageOff, Images, Mail, Paperclip, PenLine, Plus, RotateCw, Trash2, Upload, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { SketchEditor, type SketchTarget } from "@/components/sketch/sketch-editor";
import { ACCEPTED_FILES, formatBytes } from "@/domain/attachments";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { AttachmentOwner, AttachmentView } from "@/server/attachments/service";
import { CameraDialog } from "./camera-dialog";
import { Lightbox, type LightboxItem } from "./lightbox";
import { hasNativeCameraInput, isTouchDevice } from "./upload";
import type { AttachmentsState } from "./use-attachments";

type CameraMode = "native" | "in-page" | "none";
const noSubscribe = () => () => {};
function cameraMode(): CameraMode {
  if (hasNativeCameraInput()) return "native";
  if (isTouchDevice() && "mediaDevices" in navigator) return "in-page";
  return "none";
}

/** Adresse d'un fichier ; la version change quand le fichier change (croquis réédité), ce qui contourne le cache. */
const fileUrl = (a: AttachmentView, variant?: "vignette" | "telecharger") => `/fichiers/${a.id}?v=${a.version}${variant ? `&${variant}` : ""}`;
const thumbUrl = (a: AttachmentView) => (a.hasThumbnail ? fileUrl(a, "vignette") : a.displayable ? fileUrl(a) : null);

// Colonnes selon la largeur du bloc lui-même (colonne étroite à côté de la fiche, ou pleine largeur).
const GRID = "grid grid-cols-3 gap-2 @md:grid-cols-4 @2xl:grid-cols-6";
const ROUND_ACTION = "flex cursor-pointer flex-col items-center gap-1.5 text-xs font-bold text-ink";
const ROUND_ICON =
  "grid size-14 place-items-center rounded-full bg-white text-brand-600 shadow-card ring-1 ring-slate-200 transition-transform duration-150 ease-out-soft active:scale-95";

/**
 * Photos et documents d'une fiche, en une seule grille de vignettes : photos et croquis d'abord, puis
 * documents et mails. Les fichiers se déposent n'importe où sur la fiche (voir useFileDrop).
 */
export function AttachmentsPanel({
  state,
  owner,
  canWrite,
  onDelete,
}: {
  state: AttachmentsState;
  /** Fiche propriétaire ; absente tant que la fiche n'est pas créée (pas de croquis avant). */
  owner: AttachmentOwner | null;
  canWrite: boolean;
  /** Suppression côté serveur ; absente tant que la fiche n'est pas créée. */
  onDelete?: (attachment: AttachmentView) => Promise<boolean>;
}) {
  const camera = useSyncExternalStore(noSubscribe, cameraMode, () => "none" as CameraMode);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [sketch, setSketch] = useState<SketchTarget | null>(null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const router = useRouter();
  const { items, pending, rejected } = state;
  const canSketch = canWrite && owner !== null;

  function sketchSaved(saved: AttachmentView) {
    // Dessiné sur une photo : le croquis remplace la photo (gardée en fond pour le rééditer, plus montrée).
    const replaced = sketch?.mode === "photo" ? sketch.background.id : null;
    state.setItems((list) =>
      (list.some((a) => a.id === saved.id) ? list.map((a) => (a.id === saved.id ? saved : a)) : [...list, saved]).filter((a) => a.id !== replaced),
    );
    router.refresh();
  }

  const photos = items.filter((a) => a.kind === "photo" || a.kind === "sketch");
  const documents = items.filter((a) => a.kind !== "photo" && a.kind !== "sketch");
  const childrenOf = (id: string) => items.filter((a) => a.parentId === id);
  const viewable: (LightboxItem & { attachment: AttachmentView })[] = photos.flatMap((a) => {
    const src = a.displayable ? fileUrl(a) : a.hasThumbnail ? fileUrl(a, "vignette") : null;
    const downloadUrl = fileUrl(a, "telecharger");
    return src ? [{ id: a.id, filename: a.filename, src, downloadUrl, createdAt: a.createdAt, uploadedBy: a.uploadedBy, attachment: a }] : [];
  });

  async function remove(attachment: AttachmentView) {
    if (!onDelete) return;
    const children = childrenOf(attachment.id).length;
    const what =
      attachment.kind === "photo"
        ? "cette photo"
        : attachment.kind === "sketch"
          ? "ce croquis"
        : attachment.kind === "email"
          ? children > 0
            ? `ce mail et les ${children} fichier(s) qui en sont issus`
            : "ce mail"
          : "ce document";
    if (!window.confirm(`Supprimer ${what} ?`)) return;
    if (await onDelete(attachment)) {
      state.setItems((list) => list.filter((a) => a.id !== attachment.id && a.parentId !== attachment.id));
    }
  }

  const total = items.length + pending.length;
  const opened = items.find((a) => a.id === openedId) ?? null;
  const pick = (files: FileList | null) => state.addFiles(Array.from(files ?? []));
  const fileInputId = useId();

  // Sur téléphone et tablette : quatre actions rondes, une par geste. Au bureau : deux boutons et le glisser-déposer.
  const touch = camera !== "none";
  const fileInput = (
    <input
      id={fileInputId}
      type="file"
      multiple
      accept={ACCEPTED_FILES}
      className="sr-only"
      data-testid="attachment-input"
      onChange={(e) => {
        pick(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return (
    <section aria-labelledby="attachments-title" className="@container space-y-4">
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <h2 id="attachments-title" className="text-base font-extrabold whitespace-nowrap">
          Photos et documents
        </h2>
        {total > 0 ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 tabular">{total}</span> : null}
        {canWrite && !touch ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canSketch ? (
              <button
                type="button"
                onClick={() => setSketch({ mode: "blank" })}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
              >
                <PenLine aria-hidden className="size-4" /> Croquis
              </button>
            ) : null}
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-slate-300 transition-colors focus-within:ring-2 focus-within:ring-brand-600 hover:bg-slate-50">
              <Plus aria-hidden className="size-4" /> Ajouter
              {fileInput}
            </label>
          </div>
        ) : null}
      </div>

      {canWrite && touch ? (
        <div className="grid grid-cols-4 gap-2">
          {camera === "native" ? (
            <label className={ROUND_ACTION}>
              <span className={cn(ROUND_ICON, "bg-brand-600 text-white ring-0")}>
                <Camera aria-hidden className="size-6" />
              </span>
              Photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }} />
            </label>
          ) : (
            <button type="button" onClick={() => setCameraOpen(true)} className={ROUND_ACTION}>
              <span className={cn(ROUND_ICON, "bg-brand-600 text-white ring-0")}>
                <Camera aria-hidden className="size-6" />
              </span>
              Photo
            </button>
          )}
          {/* Sans « capture » : le téléphone propose ses photos (galerie). */}
          <label className={ROUND_ACTION}>
            <span className={ROUND_ICON}>
              <Images aria-hidden className="size-6" />
            </span>
            Galerie
            <input type="file" accept="image/*" multiple className="sr-only" data-testid="gallery-input" onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }} />
          </label>
          {canSketch ? (
            <button type="button" onClick={() => setSketch({ mode: "blank" })} className={ROUND_ACTION}>
              <span className={ROUND_ICON}>
                <PenLine aria-hidden className="size-6" />
              </span>
              Croquis
            </button>
          ) : null}
          <label className={ROUND_ACTION}>
            <span className={ROUND_ICON}>
              <Paperclip aria-hidden className="size-6" />
            </span>
            Fichier
            {fileInput}
          </label>
        </div>
      ) : null}

      {rejected.length > 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-2xl bg-urgent-50 p-3 text-sm text-urgent-700">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <ul className="flex-1 space-y-0.5">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <button type="button" onClick={state.dismissRejected} aria-label="Fermer" className="grid size-8 place-items-center rounded-full hover:bg-urgent-600/10">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <ul className="space-y-2" aria-label="Envois en cours">
          {pending.map((p) => (
            <li key={p.key} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2">
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local avant envoi
                <img src={p.previewUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white">
                  <FileText aria-hidden className="size-5 text-slate-500" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.file.name}</p>
                {p.status === "error" ? (
                  <p className="text-xs text-urgent-700">{p.error}</p>
                ) : p.status === "queued" ? (
                  <p className="text-xs text-slate-500">Sera enregistré avec la demande · {formatBytes(p.file.size)}</p>
                ) : (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(p.progress * 100)} aria-label={`Envoi de ${p.file.name}`}>
                    <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${Math.max(4, p.progress * 100)}%` }} />
                  </div>
                )}
              </div>
              {p.status === "error" ? (
                <button type="button" onClick={() => state.retry(p.key)} aria-label="Réessayer" className="grid size-10 place-items-center rounded-full hover:bg-white">
                  <RotateCw aria-hidden className="size-4" />
                </button>
              ) : null}
              {p.status !== "uploading" ? (
                <button type="button" onClick={() => state.cancel(p.key)} aria-label={`Retirer ${p.file.name}`} className="grid size-10 place-items-center rounded-full hover:bg-white">
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {photos.length > 0 ? (
        <ul className={GRID} aria-label="Photos">
          {photos.map((a) => {
            const thumb = thumbUrl(a);
            const index = viewable.findIndex((v) => v.id === a.id);
            return (
              <li key={a.id} className="relative">
                <button
                  type="button"
                  onClick={() => index >= 0 && setViewer(index)}
                  className="block aspect-square w-full overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 transition-transform duration-150 ease-out-soft hover:scale-[1.02] active:scale-[0.98]"
                  aria-label={`Voir ${a.filename}`}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par l'application
                    <img src={thumb} alt={a.filename} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center p-1 text-center text-xs text-slate-500">
                      <ImageOff aria-hidden className="size-5" />
                      {a.filename}
                    </span>
                  )}
                </button>
                {a.kind === "sketch" || a.parentId ? (
                  <span
                    title={a.kind === "sketch" ? "Croquis" : "Issue d'un mail"}
                    className="pointer-events-none absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-white/95 text-brand-900 shadow-card"
                  >
                    {a.kind === "sketch" ? <PenLine aria-hidden className="size-3.5" /> : <Mail aria-hidden className="size-3.5" />}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {documents.length > 0 ? (
        <ul className={GRID} aria-label="Documents">
          {documents.map((a) => {
            const look = docLook(a);
            const Icon = look.icon;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenedId(a.id)}
                  aria-label={`Ouvrir ${docTitle(a)}`}
                  className="flex aspect-square w-full flex-col items-start justify-between overflow-hidden rounded-2xl bg-slate-50 p-3 text-left ring-1 ring-slate-200 transition-[transform,background-color] duration-150 ease-out-soft hover:bg-white active:scale-[0.98]"
                >
                  <span className={cn("grid size-9 place-items-center rounded-full", look.tone)}>
                    <Icon aria-hidden className="size-[18px]" />
                  </span>
                  <span className="w-full min-w-0">
                    <span className="line-clamp-2 text-xs leading-snug font-bold break-words text-ink">{docTitle(a)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{docMeta(a, childrenOf(a.id).length)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {total === 0 ? (
        canWrite && !touch ? (
          <label htmlFor={fileInputId} className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600 transition-colors hover:border-brand-600 hover:bg-brand-50/50">
            <Upload aria-hidden className="size-6 text-brand-600" />
            <span className="font-semibold text-ink">Glissez ici photos, PDF ou mails Outlook</span>
            <span className="text-xs">ou cliquez pour choisir · Ctrl+V colle une image</span>
          </label>
        ) : (
          <p className="text-sm text-slate-500">Aucune photo ni document pour l&apos;instant.</p>
        )
      ) : canWrite && !touch ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Upload aria-hidden className="size-3.5" /> Glissez des fichiers n&apos;importe où sur la fiche, ou collez une image (Ctrl+V).
        </p>
      ) : null}

      {opened ? (
        <DocumentDialog
          attachment={opened}
          extracted={childrenOf(opened.id).length}
          onClose={() => setOpenedId(null)}
          onDelete={canWrite && onDelete ? () => void remove(opened).then(() => setOpenedId(null)) : undefined}
        />
      ) : null}
      {cameraOpen ? <CameraDialog onPhoto={(file) => state.addFiles([file])} onClose={() => setCameraOpen(false)} /> : null}
      {viewer !== null && viewable[viewer] ? (
        <Lightbox
          items={viewable}
          index={viewer}
          onIndexChange={setViewer}
          onClose={() => setViewer(null)}
          onDelete={
            canWrite && onDelete
              ? (id) => {
                  const found = viewable.find((v) => v.id === id);
                  if (found) void remove(found.attachment).then(() => setViewer(null));
                }
              : undefined
          }
          annotate={
            canSketch
              ? (id) => {
                  const found = viewable.find((v) => v.id === id)?.attachment;
                  if (!found) return null;
                  if (found.kind === "sketch") return { label: "Modifier le croquis", run: () => setSketch({ mode: "edit", attachmentId: found.id }) };
                  if (found.displayable) return { label: "Dessiner sur la photo", run: () => setSketch({ mode: "photo", background: { id: found.id, url: fileUrl(found) } }) };
                  return null;
                }
              : undefined
          }
        />
      ) : null}
      {sketch && owner ? (
        <SketchEditor
          owner={owner}
          target={sketch}
          onSaved={sketchSaved}
          onClose={() => {
            setSketch(null);
            setViewer(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** Titre d'un document : l'objet d'un mail, sinon le nom du fichier. */
function docTitle(a: AttachmentView): string {
  return a.email?.subject || a.filename;
}

function docMeta(a: AttachmentView, extracted: number): string {
  if (a.email) return [a.email.from, extracted > 0 ? `${extracted} fichier(s)` : null].filter(Boolean).join(" · ");
  return `${formatBytes(a.sizeBytes)}${a.parentId ? " · issu d'un mail" : ""}`;
}

/** Icône et couleur selon le type : on reconnaît un mail, un PDF ou un tableur d'un coup d'œil. */
function docLook(a: AttachmentView): { icon: LucideIcon; tone: string } {
  const type = a.mimeType.toLowerCase();
  if (a.kind === "email") return { icon: Mail, tone: "bg-brand-100 text-brand-700" };
  if (type === "application/pdf") return { icon: FileText, tone: "bg-urgent-50 text-urgent-700" };
  if (type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") return { icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-700" };
  if (type.includes("word")) return { icon: FileText, tone: "bg-brand-50 text-brand-600" };
  return { icon: File, tone: "bg-slate-100 text-slate-600" };
}

/** Détail d'un document : panneau qui monte du bas sur téléphone, fenêtre centrée au-delà. */
function DocumentDialog({
  attachment: a,
  extracted,
  onClose,
  onDelete,
}: {
  attachment: AttachmentView;
  extracted: number;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  const look = docLook(a);
  const Icon = look.icon;
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={docTitle(a)}
      className="m-auto mb-0 max-h-[85dvh] w-full max-w-none overflow-auto rounded-t-3xl bg-white p-0 text-ink shadow-pop backdrop:bg-slate-900/40 open:animate-sheet-up tablet:mb-auto tablet:w-[min(34rem,100vw)] tablet:rounded-3xl tablet:open:animate-pop-in"
    >
      <div className="space-y-4 p-5 tablet:p-6">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", look.tone)}>
            <Icon aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold break-words">{docTitle(a)}</h3>
            <p className="text-sm text-slate-600">
              {a.email
                ? [a.email.from, a.email.date ? formatDateTime(a.email.date) : null, extracted > 0 ? `${extracted} fichier(s) extrait(s)` : null]
                    .filter(Boolean)
                    .join(" · ")
                : `${formatBytes(a.sizeBytes)} · ajouté le ${formatDateTime(a.createdAt)}${a.parentId ? " · issu d'un mail" : ""}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-slate-100">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {a.email ? (
          <p className="max-h-72 overflow-y-auto rounded-2xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">{a.email.excerpt || "(mail sans texte)"}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {a.kind !== "email" ? (
            <a href={fileUrl(a)} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
              <ExternalLink aria-hidden className="size-4" /> Ouvrir
            </a>
          ) : null}
          <a href={fileUrl(a, "telecharger")} className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50">
            <Download aria-hidden className="size-4" /> Télécharger
          </a>
          {onDelete ? (
            <button type="button" onClick={onDelete} className="ml-auto inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-urgent-700 hover:bg-urgent-50">
              <Trash2 aria-hidden className="size-4" /> Supprimer
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
