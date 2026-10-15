CREATE TYPE "public"."attachment_kind" AS ENUM('photo', 'sketch', 'email', 'pdf', 'document');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'issued', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('quote', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."line_type" AS ENUM('item', 'title', 'note', 'subtotal');--> statement-breakpoint
CREATE TYPE "public"."mail_sender_impl" AS ENUM('eml_draft');--> statement-breakpoint
CREATE TYPE "public"."user_profile" AS ENUM('admin', 'gestion', 'terrain');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'u' NOT NULL,
	"unit_price_cents" bigint DEFAULT 0 NOT NULL,
	"cost_cents" bigint,
	"vat_rate_bp" integer DEFAULT 2000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_code_key" UNIQUE("code"),
	CONSTRAINT "articles_vat_rate_range" CHECK ("articles"."vat_rate_bp" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"client_id" uuid,
	"kind" "attachment_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_storage_key" text,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"taken_at" timestamp with time zone,
	"parent_attachment_id" uuid,
	"is_origin_email" boolean DEFAULT false NOT NULL,
	"email_meta" jsonb,
	"in_annex" boolean DEFAULT true NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_single_owner" CHECK (num_nonnulls("attachments"."document_id", "attachments"."client_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"username" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text DEFAULT '' NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"line1" text,
	"postal_code" text,
	"city" text,
	"siret" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"legal_form" text,
	"share_capital" text,
	"siret" text,
	"rcs" text,
	"vat_number" text,
	"line1" text,
	"line2" text,
	"postal_code" text,
	"city" text,
	"phone" text,
	"email" text,
	"iban" text,
	"bic" text,
	"header_text" text,
	"legal_mentions" text,
	"quote_validity_days" integer DEFAULT 30 NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"quote_email_subject" text,
	"quote_email_body" text,
	"invoice_email_subject" text,
	"invoice_email_body" text,
	"pdf_filename_pattern" text DEFAULT '{numero} - {client}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_singleton" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"document_type" "document_type" NOT NULL,
	"period" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_document_type_period_pk" PRIMARY KEY("document_type","period"),
	CONSTRAINT "document_counters_last_value_positive" CHECK ("document_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "line_type" NOT NULL,
	"article_id" uuid,
	"code" text,
	"label" text DEFAULT '' NOT NULL,
	"unit" text,
	"quantity_milli" bigint,
	"unit_price_cents" bigint,
	"vat_rate_bp" integer,
	"total_ht_cents" bigint,
	CONSTRAINT "document_lines_position_key" UNIQUE("document_id","position")
);
--> statement-breakpoint
CREATE TABLE "document_vat" (
	"document_id" uuid NOT NULL,
	"rate_bp" integer NOT NULL,
	"base_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL,
	CONSTRAINT "document_vat_document_id_rate_bp_pk" PRIMARY KEY("document_id","rate_bp")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "document_type" NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"client_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"document_date" date,
	"due_date" date,
	"total_ht_cents" bigint DEFAULT 0 NOT NULL,
	"total_vat_cents" bigint DEFAULT 0 NOT NULL,
	"total_ttc_cents" bigint DEFAULT 0 NOT NULL,
	"buyer_name" text,
	"buyer_address" text,
	"iban" text,
	"bic" text,
	"issued_at" timestamp with time zone,
	"issued_by_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"pdf_storage_key" text,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_number_key" UNIQUE("number"),
	CONSTRAINT "documents_number_when_issued" CHECK (("documents"."status" = 'draft') = ("documents"."number" is null))
);
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"sender_impl" "mail_sender_impl" NOT NULL,
	"to_addresses" text[] NOT NULL,
	"cc_addresses" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"pdf_storage_key" text,
	"generated_by_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sketches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"background_attachment_id" uuid,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"vector_data" jsonb NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sketches_attachment_key" UNIQUE("attachment_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"profile" "user_profile" NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_parent_fk" FOREIGN KEY ("parent_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vat" ADD CONSTRAINT "document_vat_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sketches" ADD CONSTRAINT "sketches_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sketches" ADD CONSTRAINT "sketches_background_attachment_id_attachments_id_fk" FOREIGN KEY ("background_attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sketches" ADD CONSTRAINT "sketches_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_document_idx" ON "attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "attachments_client_idx" ON "attachments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "outbound_emails_document_idx" ON "outbound_emails" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" USING btree (lower("username"));