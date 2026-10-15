import { describe, expect, it } from "vitest";
import { buildEml } from "@/server/mail/eml";
import { guessMimeType, mailFormatOf, parseMailFile } from "./mail-files";

describe("lecture des mails glissés", () => {
  it("reconnaît les formats Outlook", () => {
    expect(mailFormatOf({ name: "Demande.MSG", type: "" })).toBe("msg");
    expect(mailFormatOf({ name: "x", type: "message/rfc822" })).toBe("eml");
    expect(mailFormatOf({ name: "photo.jpg", type: "image/jpeg" })).toBeNull();
    expect(guessMimeType("IMG_0001.JPG")).toBe("image/jpeg");
  });

  it("lit un .eml et ses pièces jointes", async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const eml = buildEml({
      to: ["contact@exemple.example"],
      subject: "Demande de devis — fuite salle de bain",
      text: "Bonjour, merci de passer voir le logement 1204.",
      attachments: [{ filename: "fuite.jpg", contentType: "image/jpeg", content: photo }],
    });
    const file = Object.assign(new Blob([eml], { type: "message/rfc822" }), { name: "demande.eml" });
    const mail = await parseMailFile(file);
    expect(mail.format).toBe("eml");
    expect(mail.subject).toBe("Demande de devis — fuite salle de bain");
    expect(mail.bodyText).toContain("logement 1204");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]).toMatchObject({ filename: "fuite.jpg", mimeType: "image/jpeg", size: 7 });
    expect(mail.attachments[0].content).toEqual(photo);
  });
});
