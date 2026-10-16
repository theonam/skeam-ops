import { z } from "zod";

/**
 * Contrôles de saisie des référentiels, partagés par la saisie à la main, l'API et l'import Excel :
 * une donnée importée vaut une donnée saisie.
 * Origine : egm-app `src/domain/referential-input.ts`, réduit aux clients et articles génériques.
 */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères au plus.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const clientInput = z.object({
  code: z.string().trim().min(1, "Code obligatoire.").max(40, "Code : 40 caractères au plus."),
  name: z.string().trim().min(1, "Nom obligatoire.").max(200),
  email: z
    .union([z.literal(""), z.email({ error: "Adresse mail invalide." })])
    .nullable()
    .optional()
    .transform((v) => v || null),
  phone: optional(30),
  line1: optional(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, "Code postal : 5 chiffres.")
    .nullable()
    .optional()
    .transform((v) => v || null),
  city: optional(100),
  siret: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{14}$/.test(v), "SIRET : 14 chiffres.")
    .nullable()
    .optional()
    .transform((v) => v || null),
  internalNotes: optional(2000),
});
export type ClientInput = z.output<typeof clientInput>;

export const articleInput = z.object({
  code: z.string().trim().min(1, "Code obligatoire.").max(40),
  label: z.string().trim().min(1, "Libellé obligatoire.").max(300),
  category: optional(100),
  unit: z.string().trim().min(1, "Unité obligatoire.").max(20),
  unitPriceCents: z.number().int().min(0, "Prix négatif.").max(100_000_000_00),
  costCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  vatRateBp: z
    .number()
    .int()
    .refine((v) => [0, 210, 550, 1000, 2000].includes(v), "Taux de TVA : 0, 2,1, 5,5, 10 ou 20 %."),
  isActive: z.boolean().default(true),
});
export type ArticleInput = z.output<typeof articleInput>;
