/**
 * Jeu de démonstration entièrement fictif : aucune personne, entreprise ni adresse réelle.
 * Villes imaginaires, codes postaux 00xxx, mails en .example, téléphones dans les plages que
 * l'ARCEP réserve à la fiction. Tirage pseudo-aléatoire à graine fixe : `--reset` recrée tout à l'identique.
 * Origine : egm-app `scripts/demo-data/`, contenu neutre sans métier.
 */

export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PREFIXES = ["Atelier", "Maison", "Société", "Cabinet", "Groupe", "Ets", "Agence", "Coopérative"];
export const NAMES = ["Alpha", "Bêta", "Gamma", "Delta", "Epsilon", "Zêta", "Orion", "Véga", "Altaïr", "Sirius", "Lyra", "Cassiopée", "Pégase", "Andromède", "Persée", "Hydra"];
export const CITIES = ["Démoville", "Exempleville", "Fictiveville", "Testbourg", "Modèle-sur-Mer", "Saint-Essai", "Prototype-les-Bains"];
export const STREETS = ["rue de l'Exemple", "avenue Fictive", "boulevard du Modèle", "place de l'Essai", "chemin du Prototype", "allée de la Démo"];
export const CATEGORIES = ["Main d'œuvre", "Fournitures", "Déplacements", "Location", "Forfaits", "Prestations intellectuelles"];
export const UNITS = ["h", "u", "j", "forfait", "m", "m²", "kg"];
export const SUBJECTS = ["Intervention de maintenance", "Fourniture et pose", "Étude préalable", "Prestation mensuelle", "Remise en état", "Installation", "Audit et conseil"];
const FICTION_PHONES = ["01 99 00", "06 39 98"];

export function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

export function fictionPhone(rand: () => number): string {
  const pair = () => String(Math.floor(rand() * 100)).padStart(2, "0");
  return `${pick(rand, FICTION_PHONES)} ${pair()} ${pair()}`;
}

export const DEMO_COMPANY = {
  legalName: "Entreprise Démo",
  tradeName: "Entreprise Démo",
  legalForm: "SAS",
  shareCapital: "10 000 €",
  siret: "00000000000000",
  rcs: "Démoville",
  vatNumber: "FR00000000000",
  line1: "1 rue de l'Exemple",
  postalCode: "00100",
  city: "Démoville",
  phone: "01 99 00 00 00",
  email: "contact@entreprise-demo.example",
  iban: "FR76 0000 0000 0000 0000 0000 000",
  bic: "DEMOFRPP",
  headerText: "Données de démonstration, entièrement fictives",
  legalMentions:
    "En cas de retard de paiement : pénalités au taux de trois fois le taux d'intérêt légal, et indemnité forfaitaire pour frais de recouvrement de 40 €. Pas d'escompte pour paiement anticipé.",
};
