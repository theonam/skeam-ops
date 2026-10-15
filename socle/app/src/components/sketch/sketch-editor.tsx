"use client";

import { Eraser, Loader2, Minus, MoveUpRight, Pencil, Redo2, Ruler, Type, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BLANK_PAGE,
  COLOR_LABELS,
  compactPoints,
  emptySketch,
  erase,
  SIZE_LABELS,
  SKETCH_COLORS,
  unit,
  type Point,
  type Shape,
  type ShapeKind,
  type SketchColor,
  type SketchDoc,
  type SketchSize,
} from "@/domain/sketch";
import { cn } from "@/lib/cn";
import type { AttachmentOwner, AttachmentView } from "@/server/attachments/service";
import { drawShape, drawSketch, penPath, renderSketchImage } from "./render";

type Tool = ShapeKind | "eraser";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "pen", label: "Crayon", icon: <Pencil className="size-5" /> },
  { id: "line", label: "Ligne", icon: <Minus className="size-5 -rotate-45" /> },
  { id: "arrow", label: "Flèche", icon: <MoveUpRight className="size-5" /> },
  { id: "dimension", label: "Cote", icon: <Ruler className="size-5" /> },
  { id: "text", label: "Texte", icon: <Type className="size-5" /> },
  { id: "eraser", label: "Gomme", icon: <Eraser className="size-5" /> },
];

/**
 * Ce qu'on ouvre : un croquis existant, une photo à annoter, une page blanche, ou une photo pas encore
 * envoyée (onglet Photo : on annote d'abord, on choisit la fiche ensuite ; `doc` rouvre l'annotation).
 */
export type SketchTarget =
  | { mode: "edit"; attachmentId: string }
  | { mode: "photo"; background: { id: string; url: string } }
  | { mode: "blank" }
  | { mode: "local"; background: { url: string }; doc: SketchDoc | null };

/** Annotation faite sans fiche : les formes et l'image dessinée, envoyées plus tard. */
export type ExportedSketch = { doc: SketchDoc; image: Blob };

type Drawing =
  | { kind: "pen"; points: [number, number, number][]; pressure: boolean; predicted: [number, number, number][] }
  | { kind: "line" | "arrow" | "dimension"; from: Point; to: Point }
  | { kind: "eraser"; before: Shape[] };

type TextEntry = { kind: "text" | "dimension"; at: Point; from?: Point; to?: Point; value: string };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Photo de fond illisible."));
    image.src = url;
  });
}

/**
 * Éditeur de croquis plein écran, au stylet, au doigt ou à la souris.
 * Deux canvas superposés : le dessin terminé (redessiné seulement quand il change) et le trait en cours
 * (redessiné à chaque mouvement, avec les points intermédiaires et prédits du stylet) : aucune latence visible.
 * Avec un stylet, le doigt et la paume sont ignorés.
 */
export function SketchEditor({
  owner,
  target,
  onSaved,
  onExport,
  onClose,
}: {
  /** Fiche où enregistrer le croquis ; absente avec `onExport`. */
  owner?: AttachmentOwner;
  target: SketchTarget;
  onSaved?: (attachment: AttachmentView) => void;
  /** Rend l'annotation au lieu de l'enregistrer (onglet Photo). */
  onExport?: (sketch: ExportedSketch) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  const [doc, setDoc] = useState<SketchDoc | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<SketchColor>("red");
  const [size, setSize] = useState<SketchSize>(2);
  const [view, setView] = useState({ scale: 1, width: 0, height: 0 });
  const [text, setText] = useState<TextEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const history = useRef<{ past: Shape[][]; future: Shape[][] }>({ past: [], future: [] });
  // Copie dans l'état de la taille de l'historique, pour activer ou non Annuler et Rétablir.
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  const docRef = useRef<SketchDoc | null>(null);
  const drawing = useRef<Drawing | null>(null);
  const activePointer = useRef<number | null>(null);
  const penSeen = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Écran passé en arrière-plan (navigation) : une fenêtre modale restée ouverte bloquerait toute la page.
    return () => dialog?.close();
  }, []);

  // --- Chargement : croquis existant, photo ou page blanche ------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (target.mode === "edit") {
          const response = await fetch(`/api/sketches/${target.attachmentId}`, { cache: "no-store" });
          if (!response.ok) throw new Error("Croquis introuvable.");
          const data = (await response.json()) as { doc: SketchDoc; backgroundId: string | null };
          const image = data.backgroundId ? await loadImage(`/fichiers/${data.backgroundId}`).catch(() => null) : null;
          if (cancelled) return;
          setBackground(image);
          setBackgroundId(image ? data.backgroundId : null);
          setDoc(data.doc);
        } else if (target.mode === "local") {
          const image = await loadImage(target.background.url);
          if (cancelled) return;
          setBackground(image);
          setBackgroundId(null);
          setDoc(target.doc ?? emptySketch(image.naturalWidth, image.naturalHeight));
        } else if (target.mode === "photo") {
          const image = await loadImage(target.background.url);
          if (cancelled) return;
          setBackground(image);
          setBackgroundId(target.background.id);
          setDoc(emptySketch(image.naturalWidth, image.naturalHeight));
        } else {
          setDoc(emptySketch(BLANK_PAGE.width, BLANK_PAGE.height));
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Ouverture impossible.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  // --- Taille d'affichage : le croquis entier tient dans la zone, proportions conservées --------
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area || !doc) return;
    const fit = () => {
      // Zone intérieure, marges déduites.
      const style = getComputedStyle(area);
      const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const scale = Math.min(width / doc.width, height / doc.height);
      setView({ scale, width: Math.floor(doc.width * scale), height: Math.floor(doc.height * scale) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [doc?.width, doc?.height, doc]);

  const u = doc ? unit(doc) : 1;

  const prepare = useCallback(
    (canvas: HTMLCanvasElement | null, options?: CanvasRenderingContext2DSettings) => {
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(view.width * dpr);
      const height = Math.round(view.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d", options);
      ctx?.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, 0, 0);
      return ctx;
    },
    [view],
  );

  // Dessin terminé : redessiné quand les formes, le fond ou la taille changent.
  useEffect(() => {
    if (!doc || view.width === 0) return;
    const ctx = prepare(baseRef.current);
    if (ctx) drawSketch(ctx, doc, background, u);
  }, [doc, background, view, prepare, u]);

  const drawLive = useCallback(() => {
    frame.current = null;
    // Contexte « désynchronisé » : le navigateur affiche le trait sans attendre la composition de la page.
    const ctx = prepare(liveRef.current, { desynchronized: true });
    const current = drawing.current;
    const d = docRef.current;
    if (!ctx || !d) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    if (!current || current.kind === "eraser") return;
    if (current.kind === "pen") {
      ctx.fillStyle = SKETCH_COLORS[color];
      ctx.fill(penPath([...current.points, ...current.predicted], size, current.pressure, unit(d), false));
    } else {
      drawShape(ctx, { kind: current.kind, color, size, from: current.from, to: current.to, text: "" } as Shape, unit(d));
    }
  }, [prepare, color, size]);

  const scheduleLive = useCallback(() => {
    frame.current ??= requestAnimationFrame(drawLive);
  }, [drawLive]);

  // --- Historique ----------------------------------------------------------------------------
  const commitShapes = useCallback((next: Shape[], before?: Shape[]) => {
    const d = docRef.current;
    if (!d) return;
    history.current.past.push(before ?? d.shapes);
    history.current.future = [];
    const updated = { ...d, shapes: next };
    docRef.current = updated;
    setDoc(updated);
    setDirty(true);
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  }, []);

  const undo = useCallback(() => {
    const d = docRef.current;
    const previous = history.current.past.pop();
    if (!d || !previous) return;
    history.current.future.push(d.shapes);
    const updated = { ...d, shapes: previous };
    docRef.current = updated;
    setDoc(updated);
    setDirty(true);
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  }, []);

  const redo = useCallback(() => {
    const d = docRef.current;
    const next = history.current.future.pop();
    if (!d || !next) return;
    history.current.past.push(d.shapes);
    const updated = { ...d, shapes: next };
    docRef.current = updated;
    setDoc(updated);
    setDirty(true);
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });
  }, []);

  // --- Pointeur ------------------------------------------------------------------------------
  function toImage(e: { clientX: number; clientY: number }): Point {
    const rect = liveRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / view.scale, y: (e.clientY - rect.top) / view.scale };
  }

  function pressureOf(e: PointerEvent): number {
    return e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
  }

  function eraserRadius(): number {
    return [0, 8, 16, 30][size] * u;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!doc || text) return;
    if (e.pointerType === "pen") penSeen.current = true;
    // Avec un stylet, la main posée sur l'écran ne dessine pas.
    if (e.pointerType === "touch" && penSeen.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activePointer.current !== null) return;
    e.preventDefault();
    activePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché : le trait se termine normalement.
    }
    const p = toImage(e);
    if (tool === "pen") {
      drawing.current = { kind: "pen", points: [[p.x, p.y, pressureOf(e.nativeEvent)]], pressure: e.pointerType === "pen", predicted: [] };
    } else if (tool === "eraser") {
      drawing.current = { kind: "eraser", before: doc.shapes };
      const next = erase(doc.shapes, [p], eraserRadius(), u);
      if (next.length !== doc.shapes.length) {
        const updated = { ...doc, shapes: next };
        docRef.current = updated;
        setDoc(updated);
      }
    } else if (tool === "text") {
      drawing.current = null;
    } else {
      drawing.current = { kind: tool, from: p, to: p };
    }
    scheduleLive();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const current = drawing.current;
    if (!current || e.pointerId !== activePointer.current) return;
    const native = e.nativeEvent;
    // Points intermédiaires : un stylet envoie bien plus de positions que d'images affichées.
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const all = events.length > 0 ? events : [native];
    if (current.kind === "pen") {
      for (const ev of all) {
        const p = toImage(ev);
        current.points.push([p.x, p.y, pressureOf(ev)]);
      }
      const predicted = typeof native.getPredictedEvents === "function" ? native.getPredictedEvents() : [];
      current.predicted = predicted.map((ev) => {
        const p = toImage(ev);
        return [p.x, p.y, pressureOf(ev)];
      });
    } else if (current.kind === "eraser") {
      const d = docRef.current!;
      const next = erase(d.shapes, all.map(toImage), eraserRadius(), u);
      if (next.length !== d.shapes.length) {
        const updated = { ...d, shapes: next };
        docRef.current = updated;
        setDoc(updated);
      }
    } else {
      current.to = toImage(native);
    }
    scheduleLive();
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) {
    if (e.pointerId !== activePointer.current) return;
    activePointer.current = null;
    const current = drawing.current;
    drawing.current = null;
    scheduleLive();
    const d = docRef.current;
    if (!d) return;
    const p = toImage(e);
    if (tool === "text" && !cancelled) {
      setText({ kind: "text", at: p, value: "" });
      return;
    }
    if (!current || cancelled) {
      if (current?.kind === "eraser") {
        docRef.current = { ...d, shapes: current.before };
        setDoc(docRef.current);
      }
      return;
    }
    if (current.kind === "pen") {
      commitShapes([...d.shapes, { kind: "pen", color, size, points: compactPoints(current.points), pressure: current.pressure }]);
    } else if (current.kind === "eraser") {
      if (d.shapes.length !== current.before.length) commitShapes(d.shapes, current.before);
    } else {
      const length = Math.hypot(current.to.x - current.from.x, current.to.y - current.from.y);
      if (length < 6 * u) return;
      if (current.kind === "dimension") {
        setText({
          kind: "dimension",
          at: { x: (current.from.x + current.to.x) / 2, y: (current.from.y + current.to.y) / 2 },
          from: current.from,
          to: current.to,
          value: "",
        });
        return;
      }
      commitShapes([...d.shapes, { kind: current.kind, color, size, from: current.from, to: current.to }]);
    }
  }

  function commitText() {
    const entry = text;
    setText(null);
    const d = docRef.current;
    if (!entry || !d) return;
    const value = entry.value.trim();
    if (entry.kind === "dimension" && entry.from && entry.to) {
      commitShapes([...d.shapes, { kind: "dimension", color, size, from: entry.from, to: entry.to, text: value.slice(0, 40) }]);
    } else if (value) {
      commitShapes([...d.shapes, { kind: "text", color, size, at: entry.at, text: value.slice(0, 200) }]);
    }
  }

  // --- Enregistrement -----------------------------------------------------------------------
  async function save() {
    const d = docRef.current;
    if (!d || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const image = await renderSketchImage(d, background, unit(d));
      if (onExport) {
        setDirty(false);
        onExport({ doc: d, image });
        onClose();
        return;
      }
      if (!owner) throw new Error("Fiche inconnue.");
      const form = new FormData();
      form.set("ownerType", owner.type);
      form.set("ownerId", owner.id);
      form.set("doc", JSON.stringify(d));
      form.set("image", image, background ? "croquis.jpg" : "croquis.png");
      if (target.mode === "edit") form.set("attachmentId", target.attachmentId);
      if (backgroundId) form.set("backgroundId", backgroundId);
      const response = await fetch("/api/sketches", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { attachment?: AttachmentView; error?: string };
      if (!response.ok || !body.attachment) throw new Error(body.error ?? "Enregistrement impossible.");
      setDirty(false);
      onSaved?.(body.attachment);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (dirty && !window.confirm("Fermer sans enregistrer le croquis ?")) return;
    onClose();
  }

  // Raccourcis dans l'éditeur, avant ceux de la fiche en dessous (phase de capture).
  const keys = useRef({ undo, redo, save, close });
  useEffect(() => {
    keys.current = { undo, redo, save, close };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        e.stopPropagation();
        keys.current.redo();
      } else if (mod && key === "s") {
        e.preventDefault();
        e.stopPropagation();
        void keys.current.save();
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const canUndo = historySize.past > 0;
  const canRedo = historySize.future > 0;
  const title =
    target.mode === "edit"
      ? "Modifier le croquis"
      : target.mode === "photo"
        ? "Dessiner sur la photo"
        : target.mode === "local"
          ? "Annoter la photo"
          : "Nouveau croquis";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (text) setText(null);
        else close();
      }}
      aria-label={title}
      data-sketch-editor
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-slate-800 p-0 text-white backdrop:bg-slate-900"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 bg-slate-900 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" onClick={close} aria-label="Fermer le croquis" className="grid size-12 place-items-center rounded-lg hover:bg-white/10">
            <X aria-hidden className="size-6" />
          </button>
          <h2 className="mr-auto truncate px-1 font-semibold">{title}</h2>
          <button type="button" onClick={undo} disabled={!canUndo} aria-label="Annuler" title="Annuler (Ctrl+Z)" className="grid size-12 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30">
            <Undo2 aria-hidden className="size-5" />
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} aria-label="Rétablir" title="Rétablir (Ctrl+Y)" className="grid size-12 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30">
            <Redo2 aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!doc || saving}
            className="ml-1 inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-4 font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {onExport ? "Terminer" : "Enregistrer"}
          </button>
        </div>

        <div ref={areaRef} className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-2">
          {loadError ? (
            <p role="alert" className="rounded-lg bg-white p-4 text-slate-900">
              {loadError}
            </p>
          ) : !doc ? (
            <Loader2 aria-label="Chargement" className="size-8 animate-spin" />
          ) : (
            <div className="relative shadow-2xl" style={{ width: view.width, height: view.height }}>
              <canvas ref={baseRef} className="absolute inset-0 size-full" aria-hidden />
              <canvas
                ref={liveRef}
                className={cn("absolute inset-0 size-full touch-none select-none", tool === "eraser" ? "cursor-cell" : tool === "text" ? "cursor-text" : "cursor-crosshair")}
                style={{ touchAction: "none" }}
                role="img"
                aria-label={`Zone de dessin, ${doc.shapes.length} élément(s)`}
                data-shapes={doc.shapes.length}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => finish(e)}
                onPointerCancel={(e) => finish(e, true)}
                onContextMenu={(e) => e.preventDefault()}
              />
              {text ? (
                <input
                  autoFocus
                  value={text.value}
                  onChange={(e) => setText({ ...text, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitText();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setText(null);
                    }
                  }}
                  onBlur={commitText}
                  aria-label={text.kind === "dimension" ? "Valeur de la cote" : "Texte"}
                  placeholder={text.kind === "dimension" ? "ex. 1,20 m" : "Texte"}
                  maxLength={text.kind === "dimension" ? 40 : 200}
                  className="absolute h-11 w-48 -translate-y-1/2 rounded-lg bg-white px-3 text-base text-slate-900 shadow-lg ring-2 ring-brand-600 focus:outline-none"
                  style={{
                    left: Math.min(Math.max(0, text.at.x * view.scale - (text.kind === "dimension" ? 96 : 0)), Math.max(0, view.width - 192)),
                    top: Math.min(Math.max(22, text.at.y * view.scale), view.height - 22),
                  }}
                />
              ) : null}
            </div>
          )}
        </div>

        {saveError ? (
          <p role="alert" className="bg-urgent-600 px-4 py-2 text-sm">
            {saveError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-slate-900 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" role="toolbar" aria-label="Outils de dessin">
          <div className="flex gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                aria-pressed={tool === t.id}
                className={cn("flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px]", tool === t.id ? "bg-white text-slate-900" : "hover:bg-white/10")}
              >
                <span aria-hidden>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Couleur">
            {(Object.keys(SKETCH_COLORS) as SketchColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={COLOR_LABELS[c]}
                onClick={() => setColor(c)}
                className={cn("grid size-12 place-items-center rounded-full", color === c && "ring-2 ring-white")}
              >
                <span className="size-8 rounded-full ring-2 ring-white/40" style={{ background: SKETCH_COLORS[c] }} />
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Épaisseur">
            {([1, 2, 3] as SketchSize[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                aria-label={SIZE_LABELS[s]}
                onClick={() => setSize(s)}
                className={cn("grid size-12 place-items-center rounded-lg", size === s ? "bg-white/20 ring-2 ring-white" : "hover:bg-white/10")}
              >
                <span className="rounded-full bg-white" style={{ width: [0, 6, 11, 18][s], height: [0, 6, 11, 18][s] }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}
