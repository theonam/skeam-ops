// Origine : egm-app `src/domain/text-search.ts`.
/**
 * Recherche « comme on le pense » : sans tenir compte des majuscules ni des accents, chaque mot tapé
 * doit se trouver quelque part (dans n'importe quel champ), dans n'importe quel ordre.
 */

/** Minuscules, sans accents : « Créteil » et « creteil » se valent. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Mots recherchés, repliés. */
export function searchWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** Vrai si chaque mot se trouve dans l'un des textes. Sans mot, tout correspond. */
export function matchesAll(texts: readonly (string | null | undefined)[], words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = fold(texts.filter(Boolean).join(" \u0000 "));
  return words.every((w) => haystack.includes(w));
}

/** Vrai si au moins un mot se trouve dans ce texte (pour montrer le champ qui a répondu). */
export function hitsAny(text: string, words: readonly string[]): boolean {
  const folded = fold(text);
  return words.some((w) => folded.includes(w));
}

export type Segment = { text: string; hit: boolean };

/** Découpe un texte en morceaux trouvés ou non, pour les surligner (accents conservés à l'affichage). */
export function highlight(text: string, words: readonly string[]): Segment[] {
  if (words.length === 0 || text === "") return [{ text, hit: false }];
  // Texte replié caractère par caractère, chaque caractère replié renvoyant à sa position d'origine.
  let folded = "";
  const origin: number[] = [];
  Array.from(text).forEach((char, index) => {
    for (const f of fold(char)) {
      folded += f;
      origin.push(index);
    }
  });
  const chars = Array.from(text);
  const hit = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + 1)) {
      for (let k = at; k < at + word.length; k++) hit[origin[k]] = true;
    }
  }
  const segments: Segment[] = [];
  chars.forEach((char, i) => {
    const last = segments.at(-1);
    if (last && last.hit === hit[i]) last.text += char;
    else segments.push({ text: char, hit: hit[i] });
  });
  return segments;
}
