import { FIELD_POLICY, MATRIX, type Permission, type Profile, type Resource } from "@/config/access";

/**
 * Contrôle des droits, fonctions pures. Le serveur les appelle à chaque lecture et écriture.
 * Origine : egm-app `src/domain/permissions.ts` (`can`), étendu des droits au champ.
 */

export function can(profile: Profile, permission: Permission): boolean {
  return MATRIX[profile].includes(permission);
}

export function permissionsOf(profile: Profile): readonly Permission[] {
  return MATRIX[profile];
}

/** Champs de la ressource que ce profil n'a pas le droit de voir. */
export function hiddenFields(profile: Profile, resource: Resource): string[] {
  const policy: Record<string, Permission> = FIELD_POLICY[resource];
  return Object.entries(policy)
    .filter(([, permission]) => !can(profile, permission))
    .map(([field]) => field);
}

export function canSeeField(profile: Profile, resource: Resource, field: string): boolean {
  return !hiddenFields(profile, resource).includes(field);
}

/**
 * Retire d'une sélection de colonnes celles que le profil ne peut pas voir : la base ne renvoie alors
 * jamais la donnée interdite. À utiliser pour construire chaque `select` d'une ressource protégée.
 */
export function visibleColumns<T extends Record<string, unknown>>(profile: Profile, resource: Resource, columns: T): Partial<T> {
  const hidden = new Set(hiddenFields(profile, resource));
  return Object.fromEntries(Object.entries(columns).filter(([key]) => !hidden.has(key))) as Partial<T>;
}

/** Copie de l'objet sans les champs interdits ; seconde barrière, appliquée à toute réponse de l'API. */
export function redact<T extends Record<string, unknown>>(profile: Profile, resource: Resource, row: T): Partial<T> {
  const hidden = new Set(hiddenFields(profile, resource));
  if (hidden.size === 0) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.has(key))) as Partial<T>;
}
