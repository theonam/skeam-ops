"use client";
// Nouveau dans le socle.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/components/ui/dialog";
import { Field, Textarea, TextInput } from "@/components/ui/field";

type Values = Record<string, string | number | null>;

const GROUPS: { title: string; fields: [string, string, "text" | "area" | "number"][] }[] = [
  {
    title: "Identité",
    fields: [
      ["legalName", "Raison sociale", "text"],
      ["tradeName", "Nom commercial", "text"],
      ["legalForm", "Forme juridique", "text"],
      ["shareCapital", "Capital", "text"],
      ["siret", "SIRET", "text"],
      ["rcs", "RCS", "text"],
      ["vatNumber", "N° de TVA intracommunautaire", "text"],
    ],
  },
  {
    title: "Coordonnées",
    fields: [
      ["line1", "Adresse", "text"],
      ["line2", "Complément", "text"],
      ["postalCode", "Code postal", "text"],
      ["city", "Ville", "text"],
      ["phone", "Téléphone", "text"],
      ["email", "Mail", "text"],
    ],
  },
  {
    title: "Documents",
    fields: [
      ["iban", "IBAN", "text"],
      ["bic", "BIC", "text"],
      ["headerText", "Texte d'en-tête", "area"],
      ["legalMentions", "Mentions légales en pied de page", "area"],
      ["quoteValidityDays", "Validité d'un devis, en jours", "number"],
      ["paymentTermsDays", "Délai de paiement, en jours", "number"],
      ["pdfFilenamePattern", "Nom des PDF : {numero}, {client}, {objet}, {date}", "text"],
    ],
  },
  {
    title: "Gabarits de mail",
    fields: [
      ["quoteEmailSubject", "Objet, devis", "text"],
      ["quoteEmailBody", "Message, devis", "area"],
      ["invoiceEmailSubject", "Objet, facture", "text"],
      ["invoiceEmailBody", "Message, facture", "area"],
    ],
  },
];

/** En-tête, mentions, IBAN et gabarits des documents : tout ce qui varie d'une entreprise à l'autre, sans code. */
export function SettingsForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    const result = await callApi("/api/parametres", "PUT", values);
    setMessage(result.ok ? { ok: true, text: "Paramètres enregistrés." } : { ok: false, text: result.error });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-6"
    >
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="grid gap-3 rounded-2xl bg-white p-4 shadow-card tablet:grid-cols-2">
          <legend className="px-1 font-semibold">{g.title}</legend>
          {g.fields.map(([key, label, kind]) => (
            <Field key={key} label={label} htmlFor={`s-${key}`} className={kind === "area" ? "tablet:col-span-2" : undefined}>
              {kind === "area" ? (
                <Textarea id={`s-${key}`} rows={3} value={String(values[key] ?? "")} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
              ) : (
                <TextInput
                  id={`s-${key}`}
                  type={kind === "number" ? "number" : "text"}
                  value={String(values[key] ?? "")}
                  onChange={(e) => setValues({ ...values, [key]: kind === "number" ? Number(e.target.value) : e.target.value })}
                />
              )}
            </Field>
          ))}
        </fieldset>
      ))}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-emerald-800" : "text-sm text-urgent-700"}>
          {message.text}
        </p>
      ) : null}
      <Button type="submit">Enregistrer</Button>
    </form>
  );
}
