import { describe, expect, it } from "vitest";
import { checkFile, fitWithin, MAX_ATTACHMENT_BYTES, safeFilename, shouldDownscale } from "./attachments";

describe("checkFile", () => {
  it("reconnaît la nature d'après l'extension, même sans type déclaré", () => {
    expect(checkFile({ name: "Demande.MSG", type: "", size: 10 })).toMatchObject({ ok: true, kind: "email" });
    expect(checkFile({ name: "bon.pdf", type: "application/octet-stream", size: 10 })).toMatchObject({ ok: true, kind: "pdf" });
    expect(checkFile({ name: "IMG_0001.HEIC", type: "", size: 10 })).toMatchObject({ ok: true, kind: "photo", mimeType: "image/heic" });
  });

  it("accepte une image collée sans extension", () => {
    expect(checkFile({ name: "image", type: "image/png", size: 10 })).toMatchObject({ ok: true, kind: "photo", extension: "png" });
  });

  it("refuse les fichiers vides, trop gros ou d'un type inconnu", () => {
    expect(checkFile({ name: "a.jpg", type: "image/jpeg", size: 0 }).ok).toBe(false);
    expect(checkFile({ name: "a.jpg", type: "image/jpeg", size: MAX_ATTACHMENT_BYTES + 1 }).ok).toBe(false);
    expect(checkFile({ name: "setup.exe", type: "application/x-msdownload", size: 10 }).ok).toBe(false);
  });
});

describe("réduction des photos", () => {
  it("ramène le côté le plus long à la limite en gardant les proportions", () => {
    expect(fitWithin(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3024, 4032, 480)).toEqual({ width: 360, height: 480 });
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });

  it("ne réduit que les photos grandes ou lourdes", () => {
    expect(shouldDownscale(4032, 3024, 900_000)).toBe(true);
    expect(shouldDownscale(1600, 1200, 3_000_000)).toBe(true);
    expect(shouldDownscale(1600, 1200, 400_000)).toBe(false);
  });
});

describe("safeFilename", () => {
  it("retire les caractères interdits et garde les accents", () => {
    expect(safeFilename('Fuite  "salle de bain"/étage 2.jpg')).toBe("Fuite _salle de bain__étage 2.jpg");
    expect(safeFilename("   ")).toBe("fichier");
  });
});
