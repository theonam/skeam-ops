import { hash, verify } from "@node-rs/argon2";

// Paramètres argon2id recommandés par l'OWASP (19 Mio, 2 passes).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Empreinte factice : un identifiant inconnu coûte le même temps de calcul qu'un mauvais mot de passe,
// ce qui empêche de deviner quels identifiants existent.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("identifiant-inconnu");
  await verifyPassword(await dummyHash, password);
}
