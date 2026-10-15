"use client";
// Nouveau dans le socle.

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi, Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";

const FIELDS = [
  ["code", "Code"],
  ["name", "Nom"],
  ["email", "Mail"],
  ["phone", "Téléphone"],
  ["line1", "Adresse"],
  ["postalCode", "Code postal"],
  ["city", "Ville"],
] as const;

/** Saisie d'un client ; les contrôles sont ceux de l'API, les mêmes qu'à l'import. */
export function NewClientButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(form: FormData) {
    const result = await callApi<{ id: string }>("/api/clients", "POST", Object.fromEntries(FIELDS.map(([k]) => [k, String(form.get(k) ?? "")])));
    if (!result.ok) return setError(result.error);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" /> Nouveau client
      </Button>
      {open ? (
        <Dialog title="Nouveau client" onClose={() => setOpen(false)}>
          <form action={submit} className="grid gap-3 tablet:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`client-${key}`}>
                <TextInput id={`client-${key}`} name={key} required={key === "code" || key === "name"} />
              </Field>
            ))}
            {error ? (
              <p role="alert" className="rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700 tablet:col-span-2">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end tablet:col-span-2">
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
