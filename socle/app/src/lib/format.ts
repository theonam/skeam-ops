/** Formats d'affichage français, identiques sur le serveur et dans le navigateur (heure de Paris). */
const TIME_ZONE = "Europe/Paris";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFormat.format(new Date(iso)).replace(/,? /, " à ") : "";
}

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** Valeur d'un champ `datetime-local` (heure locale de l'appareil) pour une date ISO. */
export function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Date ISO pour la valeur d'un champ `datetime-local`. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
