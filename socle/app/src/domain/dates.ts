// Origine : egm-app `src/domain/dates.ts`.
/** Dates calendaires « AAAA-MM-JJ » en heure de Paris (date d'un devis, validité d'un prix). */
const parisDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

export function parisDate(date: Date): string {
  return parisDay.format(date);
}

/** Ajoute des jours à une date calendaire, sans effet de changement d'heure. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
