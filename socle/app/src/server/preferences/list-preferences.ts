import "server-only";
// Origine : egm-app `src/server/preferences/list-preferences.ts`.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";

/** Préférences d'une liste : colonnes affichées dans l'ordre choisi (vide = défaut du format), et tri. */
export const listPreferencesSchema = z.object({
  columns: z.array(z.string().max(64)).max(60),
  sort: z.object({ id: z.string().max(64), desc: z.boolean() }).nullable().optional(),
});

export type ListPreferences = z.infer<typeof listPreferencesSchema>;

export const listKeySchema = z.string().regex(/^list:[a-z-]{1,40}$/);

export async function readListPreferences(userId: string, key: string): Promise<ListPreferences | null> {
  const [row] = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, key)));
  const parsed = listPreferencesSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function writeListPreferences(userId: string, key: string, value: ListPreferences) {
  await db
    .insert(userPreferences)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value, updatedAt: new Date() },
    });
}
