import type { Metadata } from "next";
import { connection } from "next/server";
import { appIdentity, currentEdition } from "@/config/app";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

/** Page de connexion. Origine : egm-app `src/app/connexion/page.tsx`, nom de l'application paramétrable. */
export default async function Page() {
  // Lue à chaque requête : le nom et l'édition viennent des variables d'environnement du serveur.
  await connection();
  const app = appIdentity();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-brand-700">{app.name}</p>
          {currentEdition() === "demo" ? (
            <p className="mt-2">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">Démo</span>
            </p>
          ) : null}
          <h1 className="mt-2 text-lg font-semibold">Connexion</h1>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
