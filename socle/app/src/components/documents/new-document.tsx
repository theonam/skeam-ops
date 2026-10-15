"use client";
// Nouveau dans le socle.

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi, Dialog } from "@/components/ui/dialog";
import { Field, Select, TextInput } from "@/components/ui/field";

/** Création d'un brouillon de devis ou de facture, puis ouverture de sa fiche. */
export function NewDocumentButton({ clients }: { clients: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(form: FormData) {
    const result = await callApi<{ id: string }>("/api/documents", "POST", { type: form.get("type"), clientId: form.get("clientId"), subject: form.get("subject") });
    if (!result.ok) return setError(result.error);
    router.push(`/documents/${result.data.id}`);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> Nouveau
      </Button>
      {open ? (
        <Dialog title="Nouveau document" onClose={() => setOpen(false)}>
          <form action={submit} className="space-y-3">
            <Field label="Type" htmlFor="doc-type">
              <Select id="doc-type" name="type" defaultValue="quote">
                <option value="quote">Devis</option>
                <option value="invoice">Facture</option>
              </Select>
            </Field>
            <Field label="Client" htmlFor="doc-client">
              <Select id="doc-client" name="clientId" required defaultValue="">
                <option value="" disabled>
                  Choisir un client
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objet" htmlFor="doc-subject">
              <TextInput id="doc-subject" name="subject" />
            </Field>
            {error ? (
              <p role="alert" className="rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit">Créer le brouillon</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
