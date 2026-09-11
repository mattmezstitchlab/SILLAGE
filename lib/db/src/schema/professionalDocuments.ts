import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const dates = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Professional documents intentionally use owner_id as their authorization
 * boundary instead of sharing the guest/event tables. The owner id is a Clerk
 * id and is therefore not a database FK.
 */
export const sillageProfessionalProfiles = pgTable(
  "sillage_professional_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    legalForm: text("legal_form").notNull(),
    legalName: text("legal_name").notNull(),
    companyLegalForm: text("company_legal_form"),
    companySize: text("company_size"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    tradeName: text("trade_name"),
    capitalSocialCents: integer("capital_social_cents"),
    registrationNumber: text("registration_number"),
    siren: text("siren"),
    siret: text("siret"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull().default("FR"),
    email: text("email").notNull(),
    phone: text("phone"),
    vatRegime: text("vat_regime").notNull(),
    vatNumber: text("vat_number"),
    vatRatesBps: jsonb("vat_rates_bps").notNull().default([]),
    revision: integer("revision").notNull().default(1),
    ...dates,
  },
  (table) => [
    uniqueIndex("sillage_professional_profiles_owner_once").on(table.ownerId),
    check("sillage_professional_profile_legal_form_valid", sql`${table.legalForm} IN ('ei', 'company')`),
    check("sillage_professional_profile_company_size_valid", sql`${table.companySize} IS NULL OR ${table.companySize} IN ('micro', 'pme', 'eti', 'large')`),
    check("sillage_professional_profile_vat_regime_valid", sql`${table.vatRegime} IN ('franchise', 'standard')`),
  ],
);

export const sillageProfessionalClients = pgTable(
  "sillage_professional_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    companyName: text("company_name"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull().default("FR"),
    vatNumber: text("vat_number"),
    revision: integer("revision").notNull().default(1),
    ...dates,
  },
  (table) => [
    index("sillage_professional_clients_owner_idx").on(table.ownerId, table.createdAt),
    check("sillage_professional_client_kind_valid", sql`${table.kind} IN ('individual', 'business')`),
  ],
);

export const sillageProfessionalDossiers = pgTable(
  "sillage_professional_dossiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    clientId: uuid("client_id"),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    pathway: text("pathway").notNull(),
    preparatoryContacts: jsonb("preparatory_contacts").notNull().default([]),
    fees: jsonb("fees").notNull().default([]),
    checklist: jsonb("checklist").notNull().default([]),
    revision: integer("revision").notNull().default(1),
    ...dates,
  },
  (table) => [
    index("sillage_professional_dossiers_owner_idx").on(table.ownerId, table.createdAt),
    check("sillage_professional_dossier_pathway_valid", sql`${table.pathway} IN ('invoiced_service', 'salaried_employment')`),
  ],
);

export const sillageProfessionalDocuments = pgTable(
  "sillage_professional_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    clientId: uuid("client_id"),
    dossierId: uuid("dossier_id"),
    type: text("type").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    documentNumber: text("document_number"),
    issueDate: text("issue_date"),
    currency: text("currency").notNull().default("EUR"),
    identitySnapshot: jsonb("identity_snapshot"),
    clientSnapshot: jsonb("client_snapshot"),
    lineItems: jsonb("line_items").notNull().default([]),
    serviceDate: text("service_date"),
    dueDate: text("due_date"),
    validUntil: text("valid_until"),
    discountTerms: text("discount_terms"),
    latePaymentRate: text("late_payment_rate"),
    serviceType: text("service_type"),
    orderNumber: text("order_number"),
    paymentTerms: text("payment_terms"),
    contractText: text("contract_text"),
    notes: text("notes"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    issueIdempotencyKey: text("issue_idempotency_key"),
    originalInvoiceId: uuid("original_invoice_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    ...dates,
  },
  (table) => [
    index("sillage_professional_documents_owner_idx").on(table.ownerId, table.createdAt),
    uniqueIndex("sillage_professional_document_number_once")
      .on(table.ownerId, table.documentNumber),
    uniqueIndex("sillage_professional_document_issue_idempotency")
      .on(table.ownerId, table.issueIdempotencyKey),
    check("sillage_professional_document_type_valid", sql`${table.type} IN ('quote', 'contract', 'invoice', 'credit_note')`),
    check("sillage_professional_document_status_valid", sql`${table.status} IN ('draft', 'issued')`),
    check("sillage_professional_document_currency_eur", sql`${table.currency} = 'EUR'`),
    check("sillage_professional_document_amounts_nonnegative", sql`${table.subtotalCents} >= 0 AND ${table.taxCents} >= 0 AND ${table.totalCents} >= 0`),
  ],
);

export const sillageProfessionalDocumentRevisions = pgTable(
  "sillage_professional_document_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id").notNull(),
    ownerId: text("owner_id").notNull(),
    revision: integer("revision").notNull(),
    status: text("status").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sillage_professional_document_revision_once").on(table.documentId, table.revision),
    index("sillage_professional_document_revisions_owner_idx").on(table.ownerId, table.createdAt),
  ],
);

export const sillageProfessionalNumberCounters = pgTable(
  "sillage_professional_number_counters",
  {
    ownerId: text("owner_id").notNull(),
    year: integer("year").notNull(),
    kind: text("kind").notNull(),
    nextNumber: integer("next_number").notNull().default(1),
    ...dates,
  },
  (table) => [
    uniqueIndex("sillage_professional_counter_once").on(table.ownerId, table.year, table.kind),
    check("sillage_professional_counter_number_positive", sql`${table.nextNumber} > 0`),
  ],
);

export const sillageProfessionalCreditAllocations = pgTable(
  "sillage_professional_credit_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id").notNull(),
    originalInvoiceId: uuid("original_invoice_id").notNull(),
    creditNoteId: uuid("credit_note_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sillage_professional_credit_allocations_invoice_idx").on(table.originalInvoiceId, table.createdAt),
    check("sillage_professional_credit_allocation_positive", sql`${table.amountCents} > 0`),
  ],
);

export type ProfessionalProfile = typeof sillageProfessionalProfiles.$inferSelect;
export type ProfessionalClient = typeof sillageProfessionalClients.$inferSelect;
export type ProfessionalDossier = typeof sillageProfessionalDossiers.$inferSelect;
export type ProfessionalDocument = typeof sillageProfessionalDocuments.$inferSelect;