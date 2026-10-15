// Origine : egm-app `src/server/preferences/actions.ts`.
"use server";

import { requireUser } from "@/server/auth/session";
import { listKeySchema, listPreferencesSchema, writeListPreferences } from "./list-preferences";

/** Mémorise les colonnes et le tri d'une liste pour l'utilisateur connecté. */
export async function saveListPreferences(key: string, value: unknown): Promise<void> {
  const user = await requireUser();
  const parsedKey = listKeySchema.parse(key);
  const parsedValue = listPreferencesSchema.parse(value);
  await writeListPreferences(user.id, parsedKey, parsedValue);
}
