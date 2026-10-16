import "server-only";
import { ZodError } from "zod";
import type { Permission } from "@/config/access";
import { can } from "@/domain/access";
import { userFromRequest, type CurrentUser } from "@/server/auth/session";

/**
 * Outils communs aux routes de l'API : authentification, droit, contrôle d'origine, réponses JSON.
 * Une route ne renvoie jamais un objet de la base sans être passée par le service de sa ressource,
 * qui applique les droits au champ.
 */

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 500,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? "Saisie invalide." }, 400);
  console.error(error);
  return json({ error: "Erreur inattendue, réessayez." }, 500);
}

/**
 * Écriture depuis un autre site : refusée. Les navigateurs envoient l'en-tête Origin sur toute requête
 * d'écriture ; un client sans navigateur n'a pas le cookie d'un utilisateur, donc rien à détourner.
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Origine refusée.");
  }
  if (!host || originHost !== host) throw new HttpError(403, "Origine refusée.");
}

/** Utilisateur de la requête, avec le droit demandé. 401 sans session, 403 sans le droit. */
export async function authorize(request: Request, permission?: Permission): Promise<CurrentUser> {
  assertSameOrigin(request);
  const user = await userFromRequest(request);
  if (!user) throw new HttpError(401, "Connexion requise.");
  if (permission && !can(user.profile, permission)) throw new HttpError(403, "Action non autorisée pour votre profil.");
  return user;
}

/** Enveloppe une route : toute erreur devient une réponse JSON propre. */
export function route<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
