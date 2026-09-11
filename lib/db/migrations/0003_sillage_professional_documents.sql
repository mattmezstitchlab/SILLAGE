CREATE TABLE IF NOT EXISTS "sillage_professional_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL UNIQUE,
  "legal_form" text NOT NULL CHECK ("legal_form" IN ('ei', 'company')),
  "legal_name" text NOT NULL,
  "company_legal_form" text,
  "company_size" text CHECK ("company_size" IN ('micro', 'pme', 'eti', 'large')),
  "first_name" text,
  "last_name" text,
  "trade_name" text,
  "capital_social_cents" integer,
  "registration_number" text,
  "siren" text,
  "siret" text,
  "address_line1" text NOT NULL,
  "address_line2" text,
  "postal_code" text NOT NULL,
  "city" text NOT NULL,
  "country" text NOT NULL DEFAULT 'FR',
  "email" text NOT NULL,
  "phone" text,
  "vat_regime" text NOT NULL CHECK ("vat_regime" IN ('franchise', 'standard')),
  "vat_number" text,
  "vat_rates_bps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('individual', 'business')),
  "first_name" text,
  "last_name" text,
  "company_name" text,
  "contact_name" text,
  "email" text,
  "phone" text,
  "address_line1" text NOT NULL,
  "address_line2" text,
  "postal_code" text NOT NULL,
  "city" text NOT NULL,
  "country" text NOT NULL DEFAULT 'FR',
  "vat_number" text,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_professional_clients_owner_idx"
  ON "sillage_professional_clients" ("owner_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_dossiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "client_id" uuid,
  "name" text NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text,
  "pathway" text NOT NULL CHECK ("pathway" IN ('invoiced_service', 'salaried_employment')),
  "preparatory_contacts" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_professional_dossiers_owner_idx"
  ON "sillage_professional_dossiers" ("owner_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "client_id" uuid,
  "dossier_id" uuid,
  "type" text NOT NULL CHECK ("type" IN ('quote', 'contract', 'invoice', 'credit_note')),
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'issued')),
  "title" text NOT NULL,
  "document_number" text,
  "issue_date" text,
  "currency" text NOT NULL DEFAULT 'EUR' CHECK ("currency" = 'EUR'),
  "identity_snapshot" jsonb,
  "client_snapshot" jsonb,
  "original_invoice_id" uuid,
  "line_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "service_date" text,
  "due_date" text,
  "valid_until" text,
  "discount_terms" text,
  "late_payment_rate" text,
  "service_type" text,
  "order_number" text,
  "payment_terms" text,
  "contract_text" text,
  "notes" text,
  "subtotal_cents" integer NOT NULL DEFAULT 0 CHECK ("subtotal_cents" >= 0),
  "tax_cents" integer NOT NULL DEFAULT 0 CHECK ("tax_cents" >= 0),
  "total_cents" integer NOT NULL DEFAULT 0 CHECK ("total_cents" >= 0),
  "revision" integer NOT NULL DEFAULT 1,
  "issue_idempotency_key" text,
  "issued_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_professional_documents_owner_idx"
  ON "sillage_professional_documents" ("owner_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sillage_professional_document_number_once"
  ON "sillage_professional_documents" ("owner_id", "document_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sillage_professional_document_issue_idempotency"
  ON "sillage_professional_documents" ("owner_id", "issue_idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_document_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "owner_id" text NOT NULL,
  "revision" integer NOT NULL,
  "status" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE ("document_id", "revision")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_professional_document_revisions_owner_idx"
  ON "sillage_professional_document_revisions" ("owner_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_number_counters" (
  "owner_id" text NOT NULL,
  "year" integer NOT NULL,
  "kind" text NOT NULL,
  "next_number" integer NOT NULL DEFAULT 1 CHECK ("next_number" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("owner_id", "year", "kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sillage_professional_credit_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL,
  "original_invoice_id" uuid NOT NULL,
  "credit_note_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sillage_professional_credit_allocations_invoice_idx"
  ON "sillage_professional_credit_allocations" ("original_invoice_id", "created_at");