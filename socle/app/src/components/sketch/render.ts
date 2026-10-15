"use client";
// Origine : egm-app `src/components/sketch/render.ts`.

import { getStroke } from "perfect-freehand";
import {
  arrowHead,
  dimensionGeometry,
  fontSize,
  penDiameter,
  SKETCH_COLORS,
  strokeWidth,
  type Shape,
  type SketchDoc,
} from "@/domain/sketch";

/**
 * Dessin des formes d'un croquis sur un canvas, en coordonnées de l'image. Sert à l'écran (éditeur)
 * comme à l'image enregistrée : ce qu'on voit est exactement ce qui part en annexe du devis.
 */

type PenShape = Extract<Shape, { kind: "pen" }>;

/** Contour d'un trait libre (polygone de perfect-freehand) converti en chemin lissé. */
function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

export function penPath(points: PenShape["points"], size: PenShape["size"], pressure: boolean, u: number, complete = true): Path2D {
  return outlineToPath(
    getStroke(points, {
      size: penDiameter(size, u),
      thinning: pressure ? 0.6 : 0.45,
      smoothing: 0.5,
      streamline: 0.35,
      simulatePressure: !pressure,
      last: complete,
    }),
  );
}

// Un trait libre terminé ne change plus : son chemin est calculé une seule fois.
const pathCache = new WeakMap<PenShape, Path2D>();

function font(px: number): string {
  return `600 ${px}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
}

/** Texte lisible sur une photo : liseré blanc sous les lettres. */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  ctx.font = font(px);
  ctx.lineJoin = "round";
  ctx.lineWidth = px / 5;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function segment(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, u: number) {
  const color = SKETCH_COLORS[shape.color];
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (shape.kind) {
    case "pen": {
      let path = pathCache.get(shape);
      if (!path) {
        path = penPath(shape.points, shape.size, shape.pressure, u);
        pathCache.set(shape, path);
      }
      ctx.fill(path);
      break;
    }
    case "line":
    case "arrow": {
      const width = strokeWidth(shape.size, u);
      ctx.lineWidth = width;
      ctx.beginPath();
      segment(ctx, shape.from, shape.to);
      if (shape.kind === "arrow") {
        const [left, right] = arrowHead(shape.from, shape.to, Math.max(width * 4, 14 * u));
        segment(ctx, shape.to, left);
        segment(ctx, shape.to, right);
      }
      ctx.stroke();
      break;
    }
    case "dimension": {
      const width = strokeWidth(shape.size, u);
      const geometry = dimensionGeometry(shape.from, shape.to, Math.max(width * 3, 10 * u));
      ctx.lineWidth = width;
      ctx.beginPath();
      segment(ctx, shape.from, shape.to);
      for (const [a, b] of geometry.ticks) segment(ctx, a, b);
      ctx.stroke();
      if (shape.text) {
        ctx.translate(geometry.textAt.x, geometry.textAt.y);
        ctx.rotate(geometry.angle);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        haloText(ctx, shape.text, 0, 0, fontSize(shape.size, u), color);
      }
      break;
    }
    case "text":
      ctx.textBaseline = "alphabetic";
      haloText(ctx, shape.text, shape.at.x, shape.at.y, fontSize(shape.size, u), color);
      break;
  }
  ctx.restore();
}

/** Fond (photo ou page blanche) puis toutes les formes. */
export function drawSketch(ctx: CanvasRenderingContext2D, doc: SketchDoc, background: CanvasImageSource | null, u: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, doc.width, doc.height);
  if (background) ctx.drawImage(background, 0, 0, doc.width, doc.height);
  for (const shape of doc.shapes) drawShape(ctx, shape, u);
}

/** Image finale à la taille réelle : JPEG sur une photo (plus léger), PNG sur une page blanche (net). */
export async function renderSketchImage(doc: SketchDoc, background: CanvasImageSource | null, u: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Dessin impossible sur cet appareil.");
  drawSketch(ctx, doc, background, u);
  const type = background ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error("Image du croquis impossible à produire.");
  return blob;
}
