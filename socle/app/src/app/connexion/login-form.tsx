"use client";

// Origine : egm-app `src/app/connexion/login-form.tsx`.

import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  // La page d'origine (?next=…) est lue au moment de l'envoi : la page reste entièrement statique.
  const [state, action, pending] = useActionState<LoginState, FormData>((prev, formData) => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) formData.set("next", next);
    return login(prev, formData);
  }, {});
  // Bouton actif une fois la page prête : un clic trop précoce enverrait le formulaire sans retour d'erreur.
  const ready = useSyncExternalStore(subscribeNever, () => true, () => false);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="username" className="text-sm font-medium">
          Identifiant
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={state.username}
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-urgent-50 px-3 py-2 text-sm text-urgent-700">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}

function subscribeNever() {
  return () => {};
}
