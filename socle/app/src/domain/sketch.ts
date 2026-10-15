import { z } from "zod";

/**
 * Croquis vectoriel : ce qui est enregistré en base (table `sketches`) pour pouvoir rééditer un croquis,
 * et la géométrie commune à l'affichage et à l'image finale (flèches, cotes, gomme).
 * Coordonnées en pixels de l'image de fond (ou de la page blanche). Aucune dépendance au navigateur.
 */
export const SKETCH_FORMAT_VERSION = 1;

/** Page blanche : format A4 paysage. */
export const BLANK_PAGE = { width: 2000, height: 1414 } as const;

export const SKETCH_COLORS = { black: "#111827", red: "#dc2626", blue: "#1d4ed8" } as const;
export type SketchColor = keyof typeof SKETCH_COLORS;
export const COLOR_LABELS: Record<SketchColor, string> = { black: "Noir", red: "Rouge", blue: "Bleu" };

export type SketchSize = 1 | 2 | 3;
export const SIZE_LABELS: Record<SketchSize, string> = { 1: "Fin", 2: "Moyen", 3: "Épais" };

export type Point = { x: number; y: number };

const coordinate = z.number().finite().min(-100_000).max(100_000);
const point = z.object({ x: coordinate, y: coordinate });
const style = { color: z.enum(["black", "red", "blue"]), size: z.union([z.literal(1), z.literal(2), z.literal(3)]) };

export const shapeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pen"),
    ...style,
    /** [x, y, pression] ; la pression vaut 0,5 sans stylet. */
    points: z.array(z.tuple([coordinate, coordinate, z.number().min(0).max(1)])).min(1).max(20_000),
    pressure: z.boolean(),
  }),
  z.object({ kind: z.literal("line"), ...style, from: point, to: point }),
  z.object({ kind: z.literal("arrow"), ...style, from: point, to: point }),
  z.object({ kind: z.literal("dimension"), ...style, from: point, to: point, text: z.string().max(40) }),
  z.object({ kind: z.literal("text"), ...style, at: point, text: z.string().min(1).max(200) }),
]);

export type Shape = z.infer<typeof shapeSchema>;
export type ShapeKind = Shape["kind"];

export const sketchDocSchema = z.object({
  version: z.literal(SKETCH_FORMAT_VERSION),
  width: z.int().min(100).max(10_000),
  height: z.int().min(100).max(10_000),
  shapes: z.array(shapeSchema).max(5_000),
});
export type SketchDoc = z.infer<typeof sketchDocSchema>;

/** Unité de dessin : un millième du plus grand côté, pour que les épaisseurs suivent la taille de l'image. */
export function unit(doc: { width: number; height: number }): number {
  return Math.max(doc.width, doc.height) / 1000;
}

/** Épaisseur d'un trait (ligne, flèche, cote) en pixels de l'image. */
export function strokeWidth(size: SketchSize, u: number): number {
  return [0, 2.5, 5, 10][size] * u;
}

/** Diamètre du trait libre, qui varie ensuite avec la pression. */
export function penDiameter(size: SketchSize, u: number): number {
  return [0, 4, 8, 16][size] * u;
}

export function fontSize(size: SketchSize, u: number): number {
  return [0, 22, 32, 46][size] * u;
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Les deux branches de la pointe d'une flèche dessinée de `from` vers `to`. */
export function arrowHead(from: Point, to: Point, length: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  return [
    { x: to.x - length * Math.cos(angle - spread), y: to.y - length * Math.sin(angle - spread) },
    { x: to.x - length * Math.cos(angle + spread), y: to.y - length * Math.sin(angle + spread) },
  ];
}

/**
 * Cote : la ligne mesurée, un trait perpendiculaire à chaque bout, et le texte au milieu, au-dessus de la ligne,
 * toujours lisible (jamais à l'envers).
 */
export function dimensionGeometry(from: Point, to: Point, tick: number) {
  const length = distance(from, to) || 1;
  const nx = -(to.y - from.y) / length;
  const ny = (to.x - from.x) / length;
  const ticks: [Point, Point][] = [from, to].map((p) => [
    { x: p.x + nx * tick, y: p.y + ny * tick },
    { x: p.x - nx * tick, y: p.y - ny * tick },
  ]);
  let angle = Math.atan2(to.y - from.y, to.x - from.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle <= -Math.PI / 2) angle += Math.PI;
  // Le texte se place du côté « haut » de la ligne une fois redressée.
  const side = Math.cos(angle) * ny - Math.sin(angle) * nx >= 0 ? -1 : 1;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return { ticks, angle, textAt: { x: mid.x + side * nx * tick * 1.4, y: mid.y + side * ny * tick * 1.4 } };
}

/** Distance d'un point à un segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Largeur approximative d'un texte (pour la gomme et la sélection), sans mesurer la police. */
export function approximateTextWidth(text: string, size: number): number {
  return text.length * size * 0.58;
}

/** La gomme (de rayon `radius`) touche-t-elle cette forme ? */
export function touches(shape: Shape, p: Point, radius: number, u: number): boolean {
  switch (shape.kind) {
    case "pen": {
      const reach = radius + penDiameter(shape.size, u) / 2;
      const pts = shape.points;
      if (pts.length === 1) return distance(p, { x: pts[0][0], y: pts[0][1] }) <= reach;
      for (let i = 1; i < pts.length; i++) {
        if (distanceToSegment(p, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] }) <= reach) return true;
      }
      return false;
    }
    case "line":
    case "arrow":
    case "dimension":
      return distanceToSegment(p, shape.from, shape.to) <= radius + strokeWidth(shape.size, u) / 2;
    case "text": {
      const size = fontSize(shape.size, u);
      const width = approximateTextWidth(shape.text, size);
      return p.x >= shape.at.x - radius && p.x <= shape.at.x + width + radius && p.y >= shape.at.y - size - radius && p.y <= shape.at.y + radius;
    }
  }
}

/** Gomme « objet » : retire les formes touchées par le passage de la gomme. */
export function erase(shapes: readonly Shape[], path: readonly Point[], radius: number, u: number): Shape[] {
  return shapes.filter((shape) => !path.some((p) => touches(shape, p, radius, u)));
}

/** Arrondit les coordonnées au dixième de pixel : données plus légères, aucune différence visible. */
export function compactPoints(points: readonly [number, number, number][]): [number, number, number][] {
  const round = (v: number, f: number) => Math.round(v * f) / f;
  return points.map(([x, y, pressure]) => [round(x, 10), round(y, 10), round(pressure, 100)]);
}

export function emptySketch(width: number, height: number): SketchDoc {
  return { version: SKETCH_FORMAT_VERSION, width: Math.round(width), height: Math.round(height), shapes: [] };
}
