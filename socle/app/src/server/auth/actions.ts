"use server";

import { redirect } from "next/navigation";
import { destroySession } from "./session";

// Origine : egm-app `src/server/auth/actions.ts`.
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/connexion");
}
