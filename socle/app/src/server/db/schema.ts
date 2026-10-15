import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { PROFILES } from "@/config/access";
import { ATTACHMENT_KIND, DOCUMENT_STATUS, DOCUMENT_TYPE, LINE_TYPE, MAIL_SENDER_IMPL } from "@/domain/enums";

/**
 * Modèle de données du socle. Conventions, reprises d'egm-app `src/server/db/schema/` :
 * identifiants UUID, montants en centimes entiers, quantités en millièmes, taux en points de base,
 * horodatages avec fuseau. Ce que Drizzle ne sait pas décrire, déclencheurs compris, est dans
 * une migration SQL écrite à la main : `db/migrations/0001_integrite.sql`.
 */

const id = () => uuid().primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
/** Montant en centimes entiers. Jamais de nombre flottant pour de l'argent. */
const cents = () => bigint({ mode: "number" });
/** Quantité en millièmes d'unité. */
const milli = () => bigint({ mode: "number" });

export const userProfile = pgEnum("user_profile", PROFILES);
export const documentType = pgEnum("document_type", DOCUMENT_TYPE.values);
export const documentStatus = pgEnum("document_status", DOCUMENT_STATUS.values);
export const lineType = pgEnum("line_type", LINE_TYPE.values);
export const attachmentKind = pgEnum("attachment_kind", ATTACHMENT_KIND.values);
export const mailSenderImpl = pgEnum("mail_sender_impl", MAIL_SENDER_IMPL.values);

// --- Comptes ---------------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    username: text().notNull(),
    displayName: text().notNull(),
    email: text(),
    profile: userProfile().notNull(),
    passwordHash: text().notNull(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  // Identifiant insensible à la casse.
  (t) => [uniqueIndex("users_username_lower_key").on(sql`lower(${t.username})`)],
);

/** Sessions. L'identifiant est l'empreinte SHA-256 du jeton du cookie : une fuite de la table ne permet pas de se connecter. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userAgent: text(),
  },
  (t) => [index("auth_sessions_user_id_idx").on(t.userId)],
);

/** Préférences par utilisateur : colonnes et tri des listes. */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: jsonb().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// --- Paramètres de l'entreprise ----------------------------------------------------------------

/** Une seule ligne : identité, coordonnées bancaires, mentions des documents, gabarits de mail. */
export const companySettings = pgTable(
  "company_settings",
  {
    id: integer().primaryKey().default(1),
    legalName: text().notNull(),
    tradeName: text(),
    legalForm: text(),
    shareCapital: text(),
    siret: text(),
    rcs: text(),
    vatNumber: text(),
    line1: text(),
    line2: text(),
    postalCode: text(),
    city: text(),
    phone: text(),
    email: text(),
    iban: text(),
    bic: text(),
    /** Texte libre affiché sous l'identité, en tête des documents. */
    headerText: text(),
    /** Mentions légales en pied de document : pénalités de retard, indemnité forfaitaire, assurance. */
    legalMentions: text(),
    quoteValidityDays: integer().notNull().default(30),
    paymentTermsDays: integer().notNull().default(30),
    quoteEmailSubject: text(),
    quoteEmailBody: text(),
    invoiceEmailSubject: text(),
    invoiceEmailBody: text(),
    pdfFilenamePattern: text().notNull().default("{numero} - {client}"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("company_settings_singleton", sql`${t.id} = 1`)],
);

/**
 * Compteurs de numérotation : une ligne par type de document et par période. La ligne est verrouillée
 * par l'attribution d'un numéro jusqu'à la fin de la transaction qui crée le document.
 */
export const documentCounters = pgTable(
  "document_counters",
  {
    documentType: documentType().notNull(),
    period: integer().notNull(),
    lastValue: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.documentType, t.period] }), check("document_counters_last_value_positive", sql`${t.lastValue} >= 0`)],
);

// --- Référentiels ------------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: id(),
    code: text().notNull(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    line1: text(),
    postalCode: text(),
    city: text(),
    siret: text(),
    /** Notes internes : visibles seulement de qui peut modifier les clients (droit au champ). */
    internalNotes: text(),
    ...timestamps,
  },
  (t) => [unique("clients_code_key").on(t.code), index("clients_name_idx").on(t.name)],
);

export const articles = pgTable(
  "articles",
  {
    id: id(),
    code: text().notNull(),
    label: text().notNull(),
    category: text(),
    unit: text().notNull().default("u"),
    unitPriceCents: cents().notNull().default(0),
    costCents: cents(),
    vatRateBp: integer().notNull().default(2000),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("articles_code_key").on(t.code), check("articles_vat_rate_range", sql`${t.vatRateBp} between 0 and 10000`)],
);

// --- Documents ---------------------------------------------------------------------------------

/**
 * Document commercial à lignes : devis ou facture. Brouillon sans numéro ; à l'émission, numéro
 * attribué et contenu figé, acheteur et coordonnées bancaires compris. Un document numéroté ne se
 * supprime jamais : il s'annule. Les déclencheurs de `0001_integrite.sql` le garantissent en base.
 */
export const documents = pgTable(
  "documents",
  {
    id: id(),
    type: documentType().notNull(),
    status: documentStatus().notNull().default("draft"),
    number: text(),
    clientId: uuid()
      .notNull()
      .references(() => clients.id),
    subject: text().notNull().default(""),
    documentDate: date({ mode: "string" }),
    dueDate: date({ mode: "string" }),
    totalHtCents: cents().notNull().default(0),
    totalVatCents: cents().notNull().default(0),
    totalTtcCents: cents().notNull().default(0),
    buyerName: text(),
    buyerAddress: text(),
    iban: text(),
    bic: text(),
    issuedAt: timestamp({ withTimezone: true }),
    issuedById: uuid().references(() => users.id),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    /** PDF du document émis, produit une seule fois puis toujours resservi à l'identique. */
    pdfStorageKey: text(),
    createdById: uuid().references(() => users.id),
    updatedById: uuid().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    unique("documents_number_key").on(t.number),
    check("documents_number_when_issued", sql`(${t.status} = 'draft') = (${t.number} is null)`),
    index("documents_client_idx").on(t.clientId),
  ],
);

export const documentLines = pgTable(
  "document_lines",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    type: lineType().notNull(),
    articleId: uuid().references(() => articles.id, { onDelete: "set null" }),
    code: text(),
    label: text().notNull().default(""),
    unit: text(),
    quantityMilli: milli(),
    unitPriceCents: cents(),
    vatRateBp: integer(),
    totalHtCents: cents(),
  },
  (t) => [unique("document_lines_position_key").on(t.documentId, t.position)],
);

/** TVA par taux, figée à l'émission. */
export const documentVat = pgTable(
  "document_vat",
  {
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    rateBp: integer().notNull(),
    baseCents: cents().notNull(),
    vatCents: cents().notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.rateBp] })],
);

// --- Pièces jointes ----------------------------------------------------------------------------

/** Photo, croquis, mail, PDF. Le fichier est dans le stockage, jamais en base. Exactement un propriétaire. */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    documentId: uuid().references(() => documents.id, { onDelete: "cascade" }),
    clientId: uuid().references(() => clients.id, { onDelete: "cascade" }),
    kind: attachmentKind().notNull(),
    storageKey: text().notNull(),
    thumbnailStorageKey: text(),
    originalFilename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    sha256: text().notNull(),
    width: integer(),
    height: integer(),
    sortOrder: integer().notNull().default(0),
    parentAttachmentId: uuid(),
    isOriginEmail: boolean().notNull().default(false),
    emailMeta: jsonb(),
    /** Photo ou croquis repris en annexe du PDF du document. */
    inAnnex: boolean().notNull().default(true),
    uploadedById: uuid().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    check("attachments_single_owner", sql`num_nonnulls(${t.documentId}, ${t.clientId}) = 1`),
    foreignKey({ name: "attachments_parent_fk", columns: [t.parentAttachmentId], foreignColumns: [t.id] }).onDelete("cascade"),
    index("attachments_document_idx").on(t.documentId),
    index("attachments_client_idx").on(t.clientId),
  ],
);

/** Croquis : image rendue, pièce jointe de nature croquis, et données vectorielles pour le rééditer. */
export const sketches = pgTable(
  "sketches",
  {
    id: id(),
    attachmentId: uuid()
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    backgroundAttachmentId: uuid().references(() => attachments.id, { onDelete: "set null" }),
    width: integer().notNull(),
    height: integer().notNull(),
    vectorData: jsonb().notNull(),
    formatVersion: integer().notNull().default(1),
    updatedById: uuid().references(() => users.id),
    ...timestamps,
  },
  (t) => [unique("sketches_attachment_key").on(t.attachmentId)],
);

/** Trace des mails préparés depuis l'application. */
export const outboundEmails = pgTable(
  "outbound_emails",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id),
    senderImpl: mailSenderImpl().notNull(),
    toAddresses: text().array().notNull(),
    ccAddresses: text().array().notNull().default(sql`'{}'::text[]`),
    subject: text().notNull(),
    body: text().notNull(),
    pdfStorageKey: text(),
    generatedById: uuid().references(() => users.id),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbound_emails_document_idx").on(t.documentId)],
);

// --- Journal d'audit ---------------------------------------------------------------------------

/**
 * Journal d'audit en ajout seul : un déclencheur refuse toute modification ou suppression de ligne.
 * Une ligne par création, modification, émission, annulation, import, effacement ou connexion.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userId: uuid(),
    username: text(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    summary: text().notNull().default(""),
    details: jsonb(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_at_idx").on(t.at)],
);
