import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/config/app";

const DAY_S = 24 * 60 * 60;

/**
 * Prolonge le cookie de session à chaque navigation (session glissante).
 * La validité réelle est vérifiée en base par getCurrentUser() : ce cookie n'est qu'un porteur.
 * Pas de contrôle d'accès ici : les droits se vérifient côté serveur, au plus près des données.
 * Origine : egm-app `src/proxy.ts`.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(sessionCookieName())?.value;
  if (request.method === "GET" && token) {
    const days = Number(process.env.SESSION_TTL_DAYS ?? 30) || 30;
    response.cookies.set(sessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: days * DAY_S,
    });
  }
  return response;
}

export const config = {
  // Pages uniquement : ni fichiers statiques, ni service worker, ni envoi de fichiers
  // (le proxy garderait en mémoire chaque fichier envoyé, limité à 10 Mo).
  matcher: ["/((?!api/|fichiers/|_next/static|_next/image|icons/|fonts/|sw.js|manifest.webmanifest|favicon.ico).*)"],
};
