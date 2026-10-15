import { describe, expect, it } from "vitest";
import {
  arrowHead,
  compactPoints,
  dimensionGeometry,
  distanceToSegment,
  erase,
  sketchDocSchema,
  touches,
  unit,
  type Shape,
} from "./sketch";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("géométrie", () => {
  it("la pointe d'une flèche part en arrière de l'extrémité, de part et d'autre", () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(left.x).toBeLessThan(100);
    expect(right.x).toBeLessThan(100);
    near(left.y, -right.y);
  });

  it("une cote a deux traits perpendiculaires et un texte jamais à l'envers", () => {
    const g = dimensionGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(g.ticks[0]).toEqual([{ x: 0, y: 10 }, { x: 0, y: -10 }]);
    near(g.angle, 0);
    // Tracée de droite à gauche, la cote garde un texte lisible.
    near(dimensionGeometry({ x: 100, y: 0 }, { x: 0, y: 0 }, 10).angle, 0);
    // Texte au-dessus de la ligne (y plus petit à l'écran).
    expect(g.textAt.y).toBeLessThan(0);
    expect(dimensionGeometry({ x: 100, y: 0 }, { x: 0, y: 0 }, 10).textAt.y).toBeLessThan(0);
  });

  it("distance d'un point à un segment", () => {
    expect(distanceToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
    expect(distanceToSegment({ x: -30, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(50);
  });

  it("l'unité suit la taille de l'image", () => {
    expect(unit({ width: 2000, height: 1414 })).toBe(2);
  });
});

describe("gomme", () => {
  const shapes: Shape[] = [
    { kind: "pen", color: "black", size: 1, pressure: false, points: [[0, 0, 0.5], [100, 0, 0.5]] },
    { kind: "line", color: "red", size: 2, from: { x: 0, y: 200 }, to: { x: 100, y: 200 } },
    { kind: "text", color: "blue", size: 2, at: { x: 300, y: 300 }, text: "Fissure" },
  ];

  it("retire seulement les formes touchées", () => {
    expect(erase(shapes, [{ x: 50, y: 3 }], 5, 1).map((s) => s.kind)).toEqual(["line", "text"]);
    expect(erase(shapes, [{ x: 50, y: 100 }], 5, 1)).toHaveLength(3);
    expect(touches(shapes[2], { x: 320, y: 290 }, 2, 1)).toBe(true);
  });
});

describe("format enregistré", () => {
  it("accepte un croquis complet et refuse une couleur ou une taille inconnue", () => {
    const doc = { version: 1, width: 2000, height: 1414, shapes: [{ kind: "dimension", color: "red", size: 2, from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, text: "1,20 m" }] };
    expect(sketchDocSchema.safeParse(doc).success).toBe(true);
    expect(sketchDocSchema.safeParse({ ...doc, shapes: [{ ...doc.shapes[0], color: "green" }] }).success).toBe(false);
    expect(sketchDocSchema.safeParse({ ...doc, shapes: [{ ...doc.shapes[0], size: 4 }] }).success).toBe(false);
  });

  it("arrondit les points au dixième de pixel", () => {
    expect(compactPoints([[1.234, 5.678, 0.4567]])).toEqual([[1.2, 5.7, 0.46]]);
  });
});
