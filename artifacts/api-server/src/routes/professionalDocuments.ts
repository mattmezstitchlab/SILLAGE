import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { Router, type NextFunction, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { generateDocumentPdf } from "../lib/documentPdf";

type Database = typeof pool;
type DbRow = Record<string, any>;
type OwnerResolver = (request: Request) => Promise<string | null> | string | null;

export interface ProfessionalDocumentsRouterOptions {
  db?: Database;
  resolveOwner?: OwnerResolver;
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date ISO invalide.");
const country = z.string().trim().length(2).transform((value) => value.toUpperCase());
const address = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  country: country.default("FR"),
});

const profileInput = z.object({
  legalForm: z.enum(["ei", "company"]),
  legalName: z.string().trim().min(1).max(200),
  companyLegalForm: z.string().trim().max(100).nullable().optional(),
  companySize: z.enum(["micro", "pme", "eti", "large"]),
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  tradeName: z.string().trim().max(200).nullable().optional(),
  capitalSocialCents: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  siren: z.string().regex(/^\d{9}$/).nullable().optional(),
  siret: z.string().regex(/^\d{14}$/).nullable().optional(),
  address,
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).nullable().optional(),
  vatRegime: z.enum(["franchise", "standard"]),
  vatNumber: z.string().trim().max(40).nullable().optional(),
  revision: z.number().int().positive().optional(),
});

const clientInput = z.object({
  kind: z.enum(["individual", "business"]),
  firstName: z.string().trim().max(100).nullable().optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address,
  vatNumber: z.string().trim().max(40).nullable().optional(),
  revision: z.number().int().positive().optional(),
});

const contact = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});
const fee = z.object({
  label: z.string().trim().min(1).max(200),
  amountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  grossFeeCents: z.number().int().min(0).max(1_000_000_000).optional(),
  cachets: z.number().int().min(0).max(1_000_000).optional(),
  hours: z.number().int().min(0).max(1_000_000).optional(),
});
const checklistItem = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(300),
  checked: z.boolean(),
  sourceUrl: z.string().url().nullable().optional().refine(
    (value) => !value || /(?:\.gouv\.fr$|service-public\.fr$|urssaf\.fr$|francetravail\.fr$|unedic\.org$|culture\.gouv\.fr$|legifrance\.gouv\.fr$)/i.test(new URL(value).hostname),
    "La source de checklist doit être un site officiel.",
  ),
});
const dossierInput = z.object({
  name: z.string().trim().min(1).max(200),
  clientId: uuid.nullable().optional(),
  startDate: date,
  endDate: date.nullable().optional(),
  pathway: z.enum(["invoiced_service", "salaried_employment"]),
  preparatoryContacts: z.array(contact).max(30).optional().default([]),
  fees: z.array(fee).max(50).optional().default([]),
  checklist: z.array(checklistItem).max(50).optional().default([]),
  revision: z.number().int().positive().optional(),
});
const lineItem = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1_000_000),
  unitAmountCents: z.number().int().min(0).max(1_000_000_000),
  taxRateBps: z.number().int().min(0).max(2500).optional(),
});
const documentInput = z.object({
  type: z.enum(["quote", "contract", "invoice"]),
  title: z.string().trim().min(1).max(200),
  clientId: uuid.nullable().optional(),
  dossierId: uuid.nullable().optional(),
  lineItems: z.array(lineItem).max(100).default([]),
  serviceDate: date.nullable().optional(),
  dueDate: date.nullable().optional(),
  validUntil: date.nullable().optional(),
  discountTerms: z.string().trim().max(500).nullable().optional(),
  latePaymentRate: z.string().trim().max(200).nullable().optional(),
  serviceType: z.string().trim().max(100).nullable().optional(),
  orderNumber: z.string().trim().max(100).nullable().optional(),
  paymentTerms: z.string().trim().max(2000).nullable().optional(),
  contractText: z.string().max(20_000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  revision: z.number().int().positive().optional(),
});
const issueInput = z.object({
  revision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(120),
  sourcesReviewed: z.literal(true),
});
const creditInput = z.object({
  amountCents: z.number().int().positive().max(1_000_000_000),
  title: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(1000).optional().default(""),
  idempotencyKey: z.string().trim().min(8).max(120),
  sourcesReviewed: z.literal(true),
});

function ownerFromClerk(request: Request): string | null {
  const auth = getAuth(request);
  const claims = auth?.sessionClaims as { userId?: string } | undefined;
  const ownerId = claims?.userId || auth?.userId;
  return typeof ownerId === "string" && ownerId.length > 0 ? ownerId : null;
}

function sendError(response: Response, error: unknown): void {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if ((error as { code?: string })?.code === "23505") {
    response.status(409).json({ error: "Cette opération entre en conflit avec une donnée existante." });
    return;
  }
  response.status(500).json({ error: "Le service professionnel est temporairement indisponible." });
}

function routeParam(value: string | string[]): string {
  return typeof value === "string" ? value : value[0] ?? "";
}

function requireUuid(value: string, label: string): string {
  if (!uuid.safeParse(value).success) throw new HttpError(400, `${label} invalide.`);
  return value;
}

function jsonValue(value: unknown): unknown {
  return value ?? null;
}

function mapProfile(row: DbRow) {
  return {
    id: row.id,
    legalForm: row.legal_form,
    legalName: row.legal_name,
    firstName: row.first_name,
    lastName: row.last_name,
    tradeName: row.trade_name,
    capitalSocialCents: row.capital_social_cents,
    registrationNumber: row.registration_number,
    siren: row.siren,
    siret: row.siret,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      postalCode: row.postal_code,
      city: row.city,
      country: row.country,
    },
    email: row.email,
    phone: row.phone,
    vatRegime: row.vat_regime,
    vatNumber: row.vat_number,
    companyLegalForm: row.company_legal_form,
    companySize: row.company_size,
    revision: row.revision,
  };
}

function mapClient(row: DbRow) {
  return {
    id: row.id,
    kind: row.kind,
    firstName: row.first_name,
    lastName: row.last_name,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      postalCode: row.postal_code,
      city: row.city,
      country: row.country,
    },
    vatNumber: row.vat_number,
    revision: row.revision,
  };
}

function mapDossier(row: DbRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    pathway: row.pathway,
    preparatoryContacts: row.preparatory_contacts ?? [],
    fees: row.fees ?? [],
    checklist: row.checklist ?? [],
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DbRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    clientId: row.client_id,
    dossierId: row.dossier_id,
    status: row.status,
    documentNumber: row.document_number,
    issueDate: row.issue_date,
    currency: row.currency,
    identitySnapshot: jsonValue(row.identity_snapshot),
    clientSnapshot: jsonValue(row.client_snapshot),
    lineItems: row.line_items ?? [],
    serviceDate: row.service_date,
    dueDate: row.due_date,
    validUntil: row.valid_until,
    discountTerms: row.discount_terms,
    latePaymentRate: row.late_payment_rate,
    serviceType: row.service_type,
    orderNumber: row.order_number,
    paymentTerms: row.payment_terms,
    contractText: row.contract_text,
    notes: row.notes,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    revision: row.revision,
    issuedAt: row.issued_at,
    originalInvoiceId: row.original_invoice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRevision(row: DbRow) {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    snapshot: row.snapshot,
    createdAt: row.created_at,
  };
}

function calculateTotals(
  items: Array<z.infer<typeof lineItem>>,
  regime?: "franchise" | "standard",
  configuredRates: number[] = [],
) {
  let subtotalCents = 0;
  let taxCents = 0;
  const normalized = items.map((item) => {
    const net = item.quantity * item.unitAmountCents;
    if (!Number.isSafeInteger(net) || net > 2_000_000_000) {
      throw new HttpError(400, "Le montant d'une ligne dépasse la limite autorisée.");
    }
    const rate = regime === "franchise" ? 0 : item.taxRateBps ?? 0;
    if (regime === "franchise" && item.taxRateBps !== undefined && item.taxRateBps !== 0) {
      throw new HttpError(400, "Le régime de franchise en base interdit un taux de TVA non nul.");
    }
    if (regime === "standard" && (item.taxRateBps === undefined || rate !== 2000 || !configuredRates.includes(rate))) {
      throw new HttpError(400, "Ce parcours ne prend en charge que le taux de TVA standard de 20 %.");
    }
    const tax = Math.floor((net * rate + 5000) / 10_000);
    if (
      subtotalCents > 2_000_000_000 - net
      || taxCents > 2_000_000_000 - tax
      || !Number.isSafeInteger(subtotalCents + net)
      || !Number.isSafeInteger(taxCents + tax)
    ) {
      throw new HttpError(400, "Le total du document dépasse la limite autorisée.");
    }
    subtotalCents += net;
    taxCents += tax;
    return { ...item, taxRateBps: rate, lineNetCents: net, lineTaxCents: tax, lineTotalCents: net + tax };
  });
  if (!Number.isSafeInteger(subtotalCents + taxCents) || subtotalCents + taxCents > 2_000_000_000) {
    throw new HttpError(400, "Le total du document dépasse la limite autorisée.");
  }
  return { lineItems: normalized, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

function parisToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const OFFICIAL_SOURCE_HOST = /(?:^|\.)service-public\.fr$|(?:^|\.)economie\.gouv\.fr$|(?:^|\.)impots\.gouv\.fr$|(?:^|\.)guso\.fr$|(?:^|\.)urssaf\.fr$|(?:^|\.)legifrance\.gouv\.fr$/i;
const sourceActions = [
  {
    key: "invoice-identity-and-mentions",
    label: "Vérifier identité, adresse, lignes, TVA, échéance et pénalités avant émission.",
    pathway: "invoiced_service",
    sourceRefs: ["https://entreprendre.service-public.fr/vosdroits/F31808"],
  },
  {
    key: "invoice-pdf-scope",
    label: "Relire le PDF comme rendu ou archive : ne pas le présenter comme une facture électronique transmise.",
    pathway: "invoiced_service",
    sourceRefs: ["https://www.impots.gouv.fr/professionnel/questions/est-ce-quune-facture-envoyee-par-mail-est-une-facture-electronique"],
  },
  {
    key: "salary-dpae",
    label: "Préparer la DPAE avec l'Urssaf avant la prise de fonction ; aucune transmission n'est faite par l'outil.",
    pathway: "salaried_employment",
    sourceRefs: ["https://www.urssaf.fr/accueil/employeur/embaucher-gerer-salaries/embaucher/declaration-prealable-embauche.html"],
  },
  {
    key: "salary-guso-dus",
    label: "Vérifier contrat ou DUS/GUSO, dates, rôle et présence physique avec l'organisme officiel.",
    pathway: "salaried_employment",
    sourceRefs: ["https://www.guso.fr/information/faq/declarations.html"],
  },
];
const sourceNotices = [
  "Outil préparatoire : ne remplace pas un conseil juridique, social, comptable ou fiscal et ne garantit pas la conformité fiscale.",
  "Un PDF est un rendu ou une archive : il ne constitue pas une facture électronique et aucune transmission électronique n'est effectuée.",
  "Aucune signature électronique, aucun paiement et aucune transmission électronique ne sont effectués.",
  "Le parcours salarié ne certifie ni paie ni cotisations et ne remplace pas les déclarations officielles.",
];

function sourceFile(): { path: string; contents: string } | null {
  const candidates = [
    resolve(process.cwd(), "docs", "fr-documents-sources.md"),
    resolve(process.cwd(), "..", "..", "docs", "fr-documents-sources.md"),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  return file ? { path: file, contents: readFileSync(file, "utf8") } : null;
}

function sourceNoticeIsReady(): boolean {
  const source = sourceFile();
  if (!source) return false;
  const officialLinks = [...source.contents.matchAll(/https?:\/\/[^\s)>]+/g)]
    .map((match) => match[0].replace(/[.,;]+$/, ""))
    .filter((url) => {
      try {
        return OFFICIAL_SOURCE_HOST.test(new URL(url).hostname);
      } catch {
        return false;
      }
    });
  return new Set(officialLinks).size >= 5
    && /##\s+Facture\s*:/i.test(source.contents)
    && /###\s+Régime de TVA/i.test(source.contents)
    && /##\s+Numérotation, émission et corrections/i.test(source.contents)
    && /##\s+Dossier spectacle/i.test(source.contents)
    && /##\s+Garde-fous d’émission/i.test(source.contents)
    && /État de la recherche\s*:\s*\d{1,2}\s+[\p{L}]+\s+\d{4}/iu.test(source.contents)
    && /\|\s*Source officielle\s*\|/i.test(source.contents);
}

function sourceMetadata() {
  const source = sourceFile();
  if (!source) {
    return {
      sourceReviewDate: null,
      sources: [],
      actions: sourceActions,
      notices: sourceNotices,
    };
  }
  const contents = source.contents;
  const review = contents.match(/État de la recherche\s*:\s*(\d{1,2})\s+septembre\s+(\d{4})/i);
  const sourceReviewDate = review
    ? `${review[2]}-09-${String(Number(review[1])).padStart(2, "0")}`
    : null;
  const sourceRows = [...contents.matchAll(/^\|\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gmi)];
  const sources = sourceRows.map((match) => {
    const dateMatch = match[3].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return {
      title: match[1].trim(),
      url: match[2].trim(),
      reviewedAt: dateMatch
        ? `${dateMatch[3]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[1])).padStart(2, "0")}`
        : sourceReviewDate,
      summary: match[4].trim(),
      official: true,
    };
  });
  return {
    sourceReviewDate,
    sources,
    actions: sourceActions,
    notices: sourceNotices,
  };
}

function profileSnapshot(row: DbRow) {
  return mapProfile(row);
}

function clientSnapshot(row: DbRow) {
  return mapClient(row);
}

async function ownedClient(database: Database, ownerId: string, clientId: string, lock = false): Promise<DbRow> {
  const result = await database.query(
    `SELECT * FROM sillage_professional_clients
      WHERE id = $1 AND owner_id = $2 ${lock ? "FOR UPDATE" : ""}`,
    [clientId, ownerId],
  );
  if (!result.rowCount) throw new HttpError(404, "Client professionnel introuvable.");
  return result.rows[0];
}

async function ownedDossier(database: Database, ownerId: string, dossierId: string, lock = false): Promise<DbRow> {
  const result = await database.query(
    `SELECT * FROM sillage_professional_dossiers
      WHERE id = $1 AND owner_id = $2 ${lock ? "FOR UPDATE" : ""}`,
    [dossierId, ownerId],
  );
  if (!result.rowCount) throw new HttpError(404, "Dossier professionnel introuvable.");
  return result.rows[0];
}

async function currentSnapshots(database: Database, ownerId: string, clientId: string | null) {
  const profile = await database.query(
    "SELECT * FROM sillage_professional_profiles WHERE owner_id = $1",
    [ownerId],
  );
  const client = clientId ? await ownedClient(database, ownerId, clientId) : null;
  return {
    identitySnapshot: profile.rows[0] ? profileSnapshot(profile.rows[0]) : null,
    clientSnapshot: client ? clientSnapshot(client) : null,
  };
}

function validateClientIdentity(input: z.infer<typeof clientInput>): void {
  if (input.kind === "individual" && (!input.firstName || !input.lastName)) {
    throw new HttpError(400, "Le prénom et le nom du client particulier sont obligatoires.");
  }
  if (input.kind === "business" && !input.companyName) {
    throw new HttpError(400, "La raison sociale du client professionnel est obligatoire.");
  }
}

async function validateDocumentLinks(
  database: Database,
  ownerId: string,
  clientId: string | null,
  dossierId: string | null,
  type: string,
): Promise<DbRow | null> {
  if (type === "invoice" && !dossierId) {
    throw new HttpError(400, "Une facture doit être rattachée à un dossier de prestation facturée.");
  }
  if (clientId) await ownedClient(database, ownerId, clientId);
  const dossier = dossierId ? await ownedDossier(database, ownerId, dossierId) : null;
  if (dossier?.pathway === "salaried_employment" && (type === "invoice" || type === "quote")) {
    throw new HttpError(400, "Un dossier salarié ne peut pas être facturé : utilisez le parcours salaire.");
  }
  return dossier;
}

function formatCents(value: unknown): string {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) return "montant non renseigné";
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")} €`;
}

function statutoryText(profile: DbRow, client: DbRow): string {
  const notices = profile.vat_regime === "franchise"
    ? "TVA non applicable, article 293 B du code général des impôts"
    : `TVA au taux de 20 %, numéro ${profile.vat_number}.`;
  const identity = profile.legal_form === "ei"
    ? `Entrepreneur individuel (EI) : ${profile.first_name} ${profile.last_name}.`
    : `Société ${profile.company_legal_form} : ${profile.legal_name}, capital social ${formatCents(profile.capital_social_cents)}.`;
  const registration = [
    profile.registration_number ? `Immatriculation : ${profile.registration_number}.` : "",
    profile.siren ? `Siren : ${profile.siren}.` : "",
    profile.siret ? `Siret : ${profile.siret}.` : "",
  ].filter(Boolean).join(" ");
  const collection = client.kind === "business"
    ? "En cas de retard : pénalités de retard exigibles et indemnité forfaitaire de 40 € pour frais de recouvrement (client professionnel)."
    : "";
  return [
    identity,
    registration,
    notices,
    "PDF de relecture ou d'archivage uniquement : il ne constitue pas une facture électronique et aucune transmission électronique n'est effectuée.",
    collection,
  ].filter(Boolean).join(" ");
}

async function allocateNumber(
  client: { query: Database["query"] },
  ownerId: string,
  year: number,
  kind: "invoice" | "credit_note",
): Promise<string> {
  await client.query(
    `INSERT INTO sillage_professional_number_counters (owner_id, year, kind, next_number)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (owner_id, year, kind) DO NOTHING`,
    [ownerId, year, kind],
  );
  const counter = await client.query(
    `SELECT next_number FROM sillage_professional_number_counters
      WHERE owner_id = $1 AND year = $2 AND kind = $3 FOR UPDATE`,
    [ownerId, year, kind],
  );
  if (!counter.rowCount) throw new HttpError(500, "Compteur de documents introuvable.");
  const number = Number(counter.rows[0].next_number);
  await client.query(
    `UPDATE sillage_professional_number_counters
        SET next_number = next_number + 1, updated_at = now()
      WHERE owner_id = $1 AND year = $2 AND kind = $3`,
    [ownerId, year, kind],
  );
  return `${kind === "invoice" ? "FAC" : "AVO"}-${year}-${String(number).padStart(4, "0")}`;
}

export function createProfessionalDocumentsRouter(
  options: ProfessionalDocumentsRouterOptions = {},
): Router {
  const database = options.db ?? pool;
  const resolveOwner = options.resolveOwner ?? ownerFromClerk;
  const router = Router();

  const owner = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const ownerId = await resolveOwner(request);
      if (!ownerId) {
        response.status(401).json({ error: "Authentification professionnelle requise." });
        return;
      }
      (request as Request & { professionalOwnerId: string }).professionalOwnerId = ownerId;
      next();
    } catch {
      response.status(401).json({ error: "Impossible de vérifier l'identité professionnelle." });
    }
  };
  const ownerId = (request: Request) =>
    (request as Request & { professionalOwnerId: string }).professionalOwnerId;

  router.get("/professional/profile", owner, async (request, response) => {
    try {
      const result = await database.query(
        "SELECT * FROM sillage_professional_profiles WHERE owner_id = $1",
        [ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Profil professionnel introuvable.");
      response.json(mapProfile(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/professional/profile", owner, async (request, response) => {
    const parsed = profileInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Profil professionnel invalide.", details: parsed.error.flatten() });
      return;
    }
    try {
      const d = parsed.data;
      if (d.vatRegime === "standard" && !d.vatNumber) {
        throw new HttpError(400, "Le numéro de TVA est obligatoire avec le régime réel.");
      }
      if (d.legalForm === "ei" && (!d.firstName || !d.lastName)) {
        throw new HttpError(400, "Le profil EI doit renseigner le prénom et le nom de l'entrepreneur.");
      }
      if (d.legalForm === "company" && (!d.companyLegalForm || d.capitalSocialCents === undefined)) {
        throw new HttpError(400, "Le profil société doit renseigner la forme juridique réelle et le capital social.");
      }
      const existing = await database.query(
        "SELECT id, revision FROM sillage_professional_profiles WHERE owner_id = $1",
        [ownerId(request)],
      );
      if (!existing.rowCount) {
        const result = await database.query(
          `INSERT INTO sillage_professional_profiles
             (owner_id, legal_form, legal_name, company_legal_form, company_size, first_name, last_name, trade_name, capital_social_cents,
              registration_number, siren, siret,
              address_line1, address_line2, postal_code, city, country, email, phone,
                vat_regime, vat_number, vat_rates_bps)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
           RETURNING *`,
          [
             ownerId(request), d.legalForm, d.legalName, d.companyLegalForm ?? null, d.companySize,
             d.firstName ?? null, d.lastName ?? null, d.tradeName ?? null, d.capitalSocialCents ?? null,
             d.registrationNumber ?? null, d.siren ?? null, d.siret ?? null, d.address.line1,
             d.address.line2 ?? null, d.address.postalCode, d.address.city, d.address.country,
             d.email, d.phone ?? null, d.vatRegime, d.vatNumber ?? null,
             JSON.stringify(d.vatRegime === "standard" ? [2000] : []),
          ],
        );
        response.status(200).json(mapProfile(result.rows[0]));
        return;
      }
      if (d.revision === undefined) {
        throw new HttpError(409, "La révision du profil est requise pour cette modification.");
      }
      const result = await database.query(
        `UPDATE sillage_professional_profiles
             SET legal_form=$1, legal_name=$2, company_legal_form=$3, company_size=$4,
                 first_name=$5, last_name=$6, trade_name=$7, capital_social_cents=$8,
                 registration_number=$9, siren=$10, siret=$11, address_line1=$12,
                 address_line2=$13, postal_code=$14, city=$15, country=$16,
                 email=$17, phone=$18, vat_regime=$19, vat_number=$20, vat_rates_bps=$21::jsonb,
                 revision=revision+1, updated_at=now()
           WHERE owner_id=$22 AND revision=$23
          RETURNING *`,
        [
           d.legalForm, d.legalName, d.companyLegalForm ?? null, d.companySize,
           d.firstName ?? null, d.lastName ?? null, d.tradeName ?? null, d.capitalSocialCents ?? null,
           d.registrationNumber ?? null, d.siren ?? null, d.siret ?? null, d.address.line1,
           d.address.line2 ?? null, d.address.postalCode, d.address.city, d.address.country,
           d.email, d.phone ?? null, d.vatRegime, d.vatNumber ?? null,
           JSON.stringify(d.vatRegime === "standard" ? [2000] : []),
           ownerId(request), d.revision,
        ],
      );
      if (!result.rowCount) throw new HttpError(409, "Le profil a été modifié ailleurs. Actualisez-le.");
      response.json(mapProfile(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/professional/profile", owner, async (request, response) => {
    try {
      const result = await database.query(
        "DELETE FROM sillage_professional_profiles WHERE owner_id=$1 RETURNING id",
        [ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Profil professionnel introuvable.");
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/sources", owner, async (_request, response) => {
    response.setHeader("Cache-Control", "private, no-store");
    response.json(sourceMetadata());
  });

  router.get("/professional/clients", owner, async (request, response) => {
    try {
      const result = await database.query(
        "SELECT * FROM sillage_professional_clients WHERE owner_id = $1 ORDER BY created_at DESC",
        [ownerId(request)],
      );
      response.json(result.rows.map(mapClient));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/professional/clients", owner, async (request, response) => {
    const parsed = clientInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Client professionnel invalide.", details: parsed.error.flatten() });
      return;
    }
    try {
      const d = parsed.data;
      validateClientIdentity(d);
      const result = await database.query(
        `INSERT INTO sillage_professional_clients
          (owner_id, kind, first_name, last_name, company_name, contact_name, email, phone,
           address_line1, address_line2, postal_code, city, country, vat_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          ownerId(request), d.kind, d.firstName ?? null, d.lastName ?? null, d.companyName ?? null,
          d.contactName ?? null, d.email ?? null, d.phone ?? null, d.address.line1,
          d.address.line2 ?? null, d.address.postalCode, d.address.city, d.address.country,
          d.vatNumber ?? null,
        ],
      );
      response.status(201).json(mapClient(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/clients/:clientId", owner, async (request, response) => {
    try {
      const row = await ownedClient(database, ownerId(request), requireUuid(routeParam(request.params.clientId), "Client"));
      response.json(mapClient(row));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/professional/clients/:clientId", owner, async (request, response) => {
    const parsed = clientInput.safeParse(request.body);
    if (!parsed.success || parsed.data.revision === undefined) {
      response.status(400).json({ error: "Client ou révision invalide." });
      return;
    }
    try {
      const id = requireUuid(routeParam(request.params.clientId), "Client");
      const d = parsed.data;
      validateClientIdentity(d);
      const result = await database.query(
        `UPDATE sillage_professional_clients
            SET kind=$1, first_name=$2, last_name=$3, company_name=$4, contact_name=$5,
                email=$6, phone=$7, address_line1=$8, address_line2=$9, postal_code=$10,
                city=$11, country=$12, vat_number=$13, revision=revision+1, updated_at=now()
          WHERE id=$14 AND owner_id=$15 AND revision=$16
          RETURNING *`,
        [
          d.kind, d.firstName ?? null, d.lastName ?? null, d.companyName ?? null,
          d.contactName ?? null, d.email ?? null, d.phone ?? null, d.address.line1,
          d.address.line2 ?? null, d.address.postalCode, d.address.city, d.address.country,
          d.vatNumber ?? null, id, ownerId(request), d.revision,
        ],
      );
      if (!result.rowCount) {
        const exists = await database.query(
          "SELECT id FROM sillage_professional_clients WHERE id=$1 AND owner_id=$2",
          [id, ownerId(request)],
        );
        throw new HttpError(exists.rowCount ? 409 : 404, exists.rowCount
          ? "Le client a été modifié ailleurs. Actualisez-le."
          : "Client professionnel introuvable.");
      }
      response.json(mapClient(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/professional/clients/:clientId", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.clientId), "Client");
      const result = await database.query(
        "DELETE FROM sillage_professional_clients WHERE id=$1 AND owner_id=$2 RETURNING id",
        [id, ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Client professionnel introuvable.");
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/dossiers", owner, async (request, response) => {
    try {
      const result = await database.query(
        "SELECT * FROM sillage_professional_dossiers WHERE owner_id=$1 ORDER BY start_date DESC, created_at DESC",
        [ownerId(request)],
      );
      response.json(result.rows.map(mapDossier));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/professional/dossiers", owner, async (request, response) => {
    const parsed = dossierInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Dossier professionnel invalide.", details: parsed.error.flatten() });
      return;
    }
    try {
      const d = parsed.data;
      if (d.endDate && d.endDate < d.startDate) throw new HttpError(400, "La date de fin précède la date de début.");
      if (d.clientId) await ownedClient(database, ownerId(request), d.clientId);
      const result = await database.query(
        `INSERT INTO sillage_professional_dossiers
          (owner_id, client_id, name, start_date, end_date, pathway, preparatory_contacts, fees, checklist)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
         RETURNING *`,
        [
          ownerId(request), d.clientId ?? null, d.name, d.startDate, d.endDate ?? null, d.pathway,
          JSON.stringify(d.preparatoryContacts), JSON.stringify(d.fees), JSON.stringify(d.checklist),
        ],
      );
      response.status(201).json(mapDossier(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/dossiers/:dossierId", owner, async (request, response) => {
    try {
      const row = await ownedDossier(database, ownerId(request), requireUuid(routeParam(request.params.dossierId), "Dossier"));
      response.json(mapDossier(row));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/professional/dossiers/:dossierId", owner, async (request, response) => {
    const parsed = dossierInput.safeParse(request.body);
    if (!parsed.success || parsed.data.revision === undefined) {
      response.status(400).json({ error: "Dossier ou révision invalide." });
      return;
    }
    try {
      const id = requireUuid(routeParam(request.params.dossierId), "Dossier");
      const d = parsed.data;
      if (d.endDate && d.endDate < d.startDate) throw new HttpError(400, "La date de fin précède la date de début.");
      if (d.clientId) await ownedClient(database, ownerId(request), d.clientId);
      const result = await database.query(
        `UPDATE sillage_professional_dossiers
            SET client_id=$1, name=$2, start_date=$3, end_date=$4, pathway=$5,
                preparatory_contacts=$6::jsonb, fees=$7::jsonb, checklist=$8::jsonb,
                revision=revision+1, updated_at=now()
          WHERE id=$9 AND owner_id=$10 AND revision=$11
          RETURNING *`,
        [
          d.clientId ?? null, d.name, d.startDate, d.endDate ?? null, d.pathway,
          JSON.stringify(d.preparatoryContacts), JSON.stringify(d.fees), JSON.stringify(d.checklist),
          id, ownerId(request), d.revision,
        ],
      );
      if (!result.rowCount) {
        const exists = await database.query(
          "SELECT id FROM sillage_professional_dossiers WHERE id=$1 AND owner_id=$2",
          [id, ownerId(request)],
        );
        throw new HttpError(exists.rowCount ? 409 : 404, exists.rowCount
          ? "Le dossier a été modifié ailleurs. Actualisez-le."
          : "Dossier professionnel introuvable.");
      }
      response.json(mapDossier(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/professional/dossiers/:dossierId", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.dossierId), "Dossier");
      const result = await database.query(
        "DELETE FROM sillage_professional_dossiers WHERE id=$1 AND owner_id=$2 RETURNING id",
        [id, ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Dossier professionnel introuvable.");
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/documents", owner, async (request, response) => {
    try {
      const result = await database.query(
        "SELECT * FROM sillage_professional_documents WHERE owner_id=$1 ORDER BY created_at DESC",
        [ownerId(request)],
      );
      response.json(result.rows.map(mapDocument));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/professional/documents", owner, async (request, response) => {
    const parsed = documentInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Document professionnel invalide.", details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    try {
      await validateDocumentLinks(database, ownerId(request), d.clientId ?? null, d.dossierId ?? null, d.type);
      const snapshots = await currentSnapshots(database, ownerId(request), d.clientId ?? null);
      const totals = calculateTotals(
        d.lineItems,
        snapshots.identitySnapshot?.vatRegime,
        snapshots.identitySnapshot?.vatRatesBps,
      );
      const ownerDatabase = await database.connect();
      try {
        await ownerDatabase.query("BEGIN");
        const result = await ownerDatabase.query(
          `INSERT INTO sillage_professional_documents
            (owner_id, client_id, dossier_id, type, title, identity_snapshot, client_snapshot,
             line_items, service_date, due_date, valid_until, discount_terms, late_payment_rate,
             service_type, order_number, payment_terms, contract_text, notes,
             subtotal_cents, tax_cents, total_cents)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING *`,
          [
            ownerId(request), d.clientId ?? null, d.dossierId ?? null, d.type, d.title,
            JSON.stringify(snapshots.identitySnapshot), JSON.stringify(snapshots.clientSnapshot),
             JSON.stringify(totals.lineItems), d.serviceDate ?? null, d.dueDate ?? null,
             d.validUntil ?? null, d.discountTerms ?? null, d.latePaymentRate ?? null,
             d.serviceType ?? null, d.orderNumber ?? null, d.paymentTerms ?? null,
             d.contractText ?? null, d.notes ?? null, totals.subtotalCents, totals.taxCents,
             totals.totalCents,
          ],
        );
        const row = result.rows[0];
        await ownerDatabase.query(
          `INSERT INTO sillage_professional_document_revisions
            (document_id, owner_id, revision, status, snapshot)
           VALUES ($1,$2,$3,'draft',$4::jsonb)`,
          [row.id, ownerId(request), row.revision, JSON.stringify(mapDocument(row))],
        );
        await ownerDatabase.query("COMMIT");
        response.status(201).json(mapDocument(row));
      } catch (error) {
        await ownerDatabase.query("ROLLBACK");
        throw error;
      } finally {
        ownerDatabase.release();
      }
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/documents/:documentId", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.documentId), "Document");
      const result = await database.query(
        "SELECT * FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2",
        [id, ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Document professionnel introuvable.");
      response.json(mapDocument(result.rows[0]));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/professional/documents/:documentId", owner, async (request, response) => {
    const parsed = documentInput.safeParse(request.body);
    if (!parsed.success || parsed.data.revision === undefined) {
      response.status(400).json({ error: "Document ou révision invalide." });
      return;
    }
    const d = parsed.data;
    try {
      const id = requireUuid(routeParam(request.params.documentId), "Document");
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        const existingResult = await client.query(
          "SELECT * FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, ownerId(request)],
        );
        if (!existingResult.rowCount) throw new HttpError(404, "Document professionnel introuvable.");
        const existing = existingResult.rows[0] as DbRow;
        if (existing.status !== "draft") throw new HttpError(409, "Un document émis est immuable et ne peut plus être modifié.");
        if (existing.revision !== d.revision) throw new HttpError(409, "Le document a été modifié ailleurs. Actualisez-le.");
        await validateDocumentLinks(database, ownerId(request), d.clientId ?? null, d.dossierId ?? null, d.type);
        const snapshots = await currentSnapshots(database, ownerId(request), d.clientId ?? null);
        const totals = calculateTotals(
          d.lineItems,
          snapshots.identitySnapshot?.vatRegime,
          snapshots.identitySnapshot?.vatRatesBps,
        );
        const result = await client.query(
          `UPDATE sillage_professional_documents
              SET client_id=$1, dossier_id=$2, type=$3, title=$4, identity_snapshot=$5::jsonb,
                   client_snapshot=$6::jsonb, line_items=$7::jsonb, service_date=$8,
                   due_date=$9, valid_until=$10, discount_terms=$11, late_payment_rate=$12,
                   service_type=$13, order_number=$14, payment_terms=$15, contract_text=$16,
                   notes=$17, subtotal_cents=$18, tax_cents=$19, total_cents=$20,
                   revision=revision+1, updated_at=now()
             WHERE id=$21 AND owner_id=$22 AND status='draft' AND revision=$23
            RETURNING *`,
          [
            d.clientId ?? null, d.dossierId ?? null, d.type, d.title,
            JSON.stringify(snapshots.identitySnapshot), JSON.stringify(snapshots.clientSnapshot),
             JSON.stringify(totals.lineItems), d.serviceDate ?? null, d.dueDate ?? null,
             d.validUntil ?? null, d.discountTerms ?? null, d.latePaymentRate ?? null,
             d.serviceType ?? null, d.orderNumber ?? null, d.paymentTerms ?? null,
             d.contractText ?? null, d.notes ?? null, totals.subtotalCents, totals.taxCents,
             totals.totalCents, id, ownerId(request), d.revision,
          ],
        );
        if (!result.rowCount) throw new HttpError(409, "Le document a été modifié ailleurs. Actualisez-le.");
        const row = result.rows[0];
        await client.query(
          `INSERT INTO sillage_professional_document_revisions
            (document_id, owner_id, revision, status, snapshot)
           VALUES ($1,$2,$3,'draft',$4::jsonb)`,
          [id, ownerId(request), row.revision, JSON.stringify(mapDocument(row))],
        );
        await client.query("COMMIT");
        response.json(mapDocument(row));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/professional/documents/:documentId", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.documentId), "Document");
      const result = await database.query(
        "DELETE FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2 AND status='draft' RETURNING id",
        [id, ownerId(request)],
      );
      if (!result.rowCount) {
        const exists = await database.query(
          "SELECT status FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2",
          [id, ownerId(request)],
        );
        throw new HttpError(exists.rowCount ? 409 : 404,
          exists.rowCount ? "Un document émis ne peut pas être supprimé." : "Document professionnel introuvable.");
      }
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/professional/documents/:documentId/revisions", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.documentId), "Document");
      const exists = await database.query(
        "SELECT id FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2",
        [id, ownerId(request)],
      );
      if (!exists.rowCount) throw new HttpError(404, "Document professionnel introuvable.");
      const result = await database.query(
        `SELECT id, revision, status, snapshot, created_at
           FROM sillage_professional_document_revisions
          WHERE document_id=$1 AND owner_id=$2 ORDER BY revision DESC`,
        [id, ownerId(request)],
      );
      response.json(result.rows.map(mapRevision));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/professional/documents/:documentId/issue", owner, async (request, response) => {
    const parsed = issueInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Émission invalide : révision, idempotence et lecture des sources officielles sont requises." });
      return;
    }
    if (!sourceNoticeIsReady()) {
      response.status(400).json({ error: "L'émission est temporairement bloquée : les sources officielles françaises n'ont pas encore été relues et datées." });
      return;
    }
    const id = requireUuid(routeParam(request.params.documentId), "Document");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT * FROM sillage_professional_documents
          WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
        [id, ownerId(request)],
      );
      if (!result.rowCount) throw new HttpError(404, "Document professionnel introuvable.");
      const document = result.rows[0] as DbRow;
      const idempotent = await client.query(
        `SELECT * FROM sillage_professional_documents
          WHERE owner_id=$1 AND issue_idempotency_key=$2 FOR UPDATE`,
        [ownerId(request), parsed.data.idempotencyKey],
      );
      if (idempotent.rowCount) {
        if (idempotent.rows[0].id !== id) {
          throw new HttpError(409, "Cette clé d'idempotence est déjà utilisée par un autre document.");
        }
        await client.query("COMMIT");
        response.json(mapDocument(idempotent.rows[0]));
        return;
      }
      if (document.status !== "draft") throw new HttpError(409, "Ce document est déjà émis et immuable.");
      if (document.type !== "invoice") throw new HttpError(400, "Seules les factures peuvent être émises depuis ce parcours.");
      if (document.revision !== parsed.data.revision) throw new HttpError(409, "Le document a été modifié ailleurs. Actualisez-le.");
      if (!document.client_id) throw new HttpError(400, "Une facture doit avoir un client.");
      const profileResult = await client.query(
        "SELECT * FROM sillage_professional_profiles WHERE owner_id=$1 FOR SHARE",
        [ownerId(request)],
      );
      if (!profileResult.rowCount) throw new HttpError(400, "Complétez le profil professionnel avant d'émettre une facture.");
      const profile = profileResult.rows[0] as DbRow;
      const clientRow = await ownedClient(client as unknown as Database, ownerId(request), document.client_id, true);
      if (profile.country !== "FR" || clientRow.country !== "FR") {
        throw new HttpError(400, "La facturation étrangère n'est pas prise en charge par ce fournisseur.");
      }
      if (profile.legal_form === "ei" && (!profile.first_name || !profile.last_name || !profile.siren)) {
        throw new HttpError(400, "Une facture EI exige prénom, nom et numéro Siren.");
      }
      if (profile.legal_form === "company" && (!profile.company_legal_form || !profile.siren || profile.capital_social_cents === null)) {
        throw new HttpError(400, "Une facture société exige la forme juridique réelle, le Siren et le capital social.");
      }
      if (!profile.company_size) {
        throw new HttpError(400, "Déclarez la taille de l'entreprise avant émission.");
      }
      if (profile.vat_regime === "standard" && !profile.vat_number) {
        throw new HttpError(400, "Le numéro de TVA est obligatoire avec le régime réel.");
      }
      if (profile.vat_regime === "standard" && JSON.stringify(profile.vat_rates_bps ?? []) !== "[2000]") {
        throw new HttpError(400, "Seul le taux de TVA de 20 % est pris en charge dans ce MVP.");
      }
      if (profile.vat_regime === "franchise" && (profile.vat_rates_bps ?? []).some((rate: unknown) => Number(rate) !== 0)) {
        throw new HttpError(400, "Le régime de franchise en base ne peut pas porter de TVA collectée.");
      }
      if (!document.due_date || !document.payment_terms) {
        throw new HttpError(400, "Une facture doit préciser la date d'échéance et les conditions de paiement.");
      }
      if (clientRow.kind === "business" && !document.late_payment_rate) {
        throw new HttpError(400, "Une facture B2B doit préciser le taux des pénalités de retard.");
      }
      if (profile.vat_regime === "standard" && clientRow.kind === "business" && !clientRow.vat_number) {
        throw new HttpError(400, "Le numéro de TVA du client professionnel est requis pour cette facture taxable domestique.");
      }
      const configuredRates = [2000];
      const issueDate = parisToday();
      if (clientRow.kind === "business" && ["eti", "large"].includes(profile.company_size)
        && issueDate >= "2026-09-01") {
        throw new HttpError(400, "L'émission B2B de cette taille d'entreprise relève de la facturation électronique depuis le 1er septembre 2026 et reste hors périmètre.");
      }
      if (clientRow.kind === "business" && ["micro", "pme"].includes(profile.company_size) && issueDate >= "2027-09-01") {
        throw new HttpError(400, "L'émission B2B PME/micro après le 1er septembre 2027 nécessite une transmission électronique hors périmètre.");
      }
      let dossierRow: DbRow | null = null;
      if (document.dossier_id) {
        const dossierResult = await client.query(
          "SELECT pathway, start_date, end_date FROM sillage_professional_dossiers WHERE id=$1 AND owner_id=$2 FOR SHARE",
          [document.dossier_id, ownerId(request)],
        );
        if (!dossierResult.rowCount) throw new HttpError(404, "Dossier professionnel introuvable.");
        if (dossierResult.rows[0].pathway === "salaried_employment") {
          throw new HttpError(400, "Un dossier salarié ne peut pas donner lieu à une facture.");
        }
        dossierRow = dossierResult.rows[0];
      }
      const serviceDate = document.service_date
        ?? dossierRow?.end_date
        ?? dossierRow?.start_date
        ?? null;
      if (!serviceDate) {
        throw new HttpError(400, "La facture doit préciser la date de livraison ou de fin de prestation.");
      }
      const totals = calculateTotals(
        document.line_items as Array<z.infer<typeof lineItem>>,
        profile.vat_regime,
        configuredRates,
      );
      if (totals.lineItems.length === 0 || totals.lineItems.every((item) => item.lineTotalCents <= 0) || totals.totalCents <= 0) {
        throw new HttpError(400, "Une facture doit contenir au moins une ligne significative et un total strictement positif.");
      }
      if (document.due_date < issueDate) {
        throw new HttpError(400, "La date d'échéance ne peut pas précéder la date d'émission.");
      }
      const year = Number(issueDate.slice(0, 4));
      const number = await allocateNumber(client, ownerId(request), year, "invoice");
      const notes = [document.notes, statutoryText(profile, clientRow)].filter(Boolean).join("\n\n");
      const discountTerms = document.discount_terms || "Escompte pour paiement anticipé : néant";
      const issuedRevision = document.revision + 1;
      const identity = profileSnapshot(profile);
      const customer = clientSnapshot(clientRow);
      const updated = await client.query(
        `UPDATE sillage_professional_documents
            SET status='issued', document_number=$1, issue_date=$2, service_date=$3,
                discount_terms=$4, identity_snapshot=$5::jsonb, client_snapshot=$6::jsonb,
                line_items=$7::jsonb, notes=$8, subtotal_cents=$9, tax_cents=$10, total_cents=$11,
                issue_idempotency_key=$12, revision=$13, updated_at=now()
          WHERE id=$14 AND owner_id=$15 AND status='draft' AND revision=$16
          RETURNING *`,
        [
          number, issueDate, serviceDate, discountTerms, JSON.stringify(identity),
          JSON.stringify(customer), JSON.stringify(totals.lineItems), notes, totals.subtotalCents,
          totals.taxCents, totals.totalCents, parsed.data.idempotencyKey, issuedRevision,
          id, ownerId(request), parsed.data.revision,
        ],
      );
      if (!updated.rowCount) throw new HttpError(409, "La facture a été modifiée ailleurs.");
      const row = updated.rows[0];
      await client.query(
        `INSERT INTO sillage_professional_document_revisions
          (document_id, owner_id, revision, status, snapshot)
         VALUES ($1,$2,$3,'issued',$4::jsonb)`,
        [id, ownerId(request), issuedRevision, JSON.stringify(mapDocument(row))],
      );
      await client.query("COMMIT");
      response.json(mapDocument(row));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      sendError(response, error);
    } finally {
      client.release();
    }
  });

  router.post("/professional/documents/:documentId/credit-notes", owner, async (request, response) => {
    const parsed = creditInput.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Avoir invalide : montant positif, idempotence et lecture des sources officielles requis." });
      return;
    }
    if (!sourceNoticeIsReady()) {
      response.status(400).json({ error: "L'émission est temporairement bloquée : les sources officielles françaises n'ont pas encore été relues et datées." });
      return;
    }
    const originalId = requireUuid(routeParam(request.params.documentId), "Facture");
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const originalResult = await client.query(
        `SELECT * FROM sillage_professional_documents
          WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
        [originalId, ownerId(request)],
      );
      if (!originalResult.rowCount) throw new HttpError(404, "Facture d'origine introuvable.");
      const original = originalResult.rows[0] as DbRow;
      const idempotent = await client.query(
        `SELECT * FROM sillage_professional_documents
          WHERE owner_id=$1 AND issue_idempotency_key=$2 FOR UPDATE`,
        [ownerId(request), parsed.data.idempotencyKey],
      );
      if (idempotent.rowCount) {
        if (idempotent.rows[0].original_invoice_id !== originalId) {
          throw new HttpError(409, "Cette clé d'idempotence est déjà utilisée par un autre avoir.");
        }
        await client.query("COMMIT");
        response.status(201).json(mapDocument(idempotent.rows[0]));
        return;
      }
      if (original.type !== "invoice" || original.status !== "issued") {
        throw new HttpError(400, "Un avoir ne peut être rattaché qu'à une facture émise.");
      }
      const allocation = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS credited
           FROM sillage_professional_credit_allocations
          WHERE original_invoice_id=$1 AND owner_id=$2`,
        [originalId, ownerId(request)],
      );
      const credited = Number(allocation.rows[0].credited);
      const remaining = original.total_cents - credited;
      if (parsed.data.amountCents > remaining) {
        throw new HttpError(409, `Le montant de l'avoir dépasse le solde disponible (${remaining} centimes).`);
      }
      const issueDate = parisToday();
      const year = Number(issueDate.slice(0, 4));
      const number = await allocateNumber(client, ownerId(request), year, "credit_note");
      const tax = original.total_cents > 0
        ? Number(
          (BigInt(parsed.data.amountCents) * BigInt(original.tax_cents)
            + BigInt(Math.floor(original.total_cents / 2)))
          / BigInt(original.total_cents),
        )
        : 0;
      const net = parsed.data.amountCents - tax;
      const item = {
        description: parsed.data.title,
        quantity: 1,
        unitAmountCents: net,
        taxRateBps: original.tax_cents > 0 && original.subtotal_cents > 0
          ? Number((BigInt(original.tax_cents) * 10_000n) / BigInt(original.subtotal_cents))
          : 0,
        lineNetCents: net,
        lineTaxCents: tax,
        lineTotalCents: parsed.data.amountCents,
      };
      const notes = [
        `AVOIR ${number} — Référence facture ${original.document_number}.`,
        `TVA reversée proportionnellement à la facture d'origine : ${formatCents(tax)} sur ${formatCents(parsed.data.amountCents)}. Le cumul des avoirs est plafonné au total de la facture.`,
        parsed.data.reason,
        typeof original.notes === "string" ? original.notes : "",
      ].filter(Boolean).join("\n\n");
      const inserted = await client.query(
        `INSERT INTO sillage_professional_documents
          (owner_id, client_id, dossier_id, type, status, title, document_number, issue_date,
           identity_snapshot, client_snapshot, line_items, service_date, due_date, discount_terms,
           late_payment_rate, service_type, order_number, payment_terms, notes,
           subtotal_cents, tax_cents, total_cents, issue_idempotency_key, original_invoice_id, issued_at)
          VALUES ($1,$2,$3,'credit_note','issued',$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,
                  $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now())
         RETURNING *`,
        [
          ownerId(request), original.client_id, original.dossier_id, parsed.data.title, number,
          issueDate, JSON.stringify(original.identity_snapshot), JSON.stringify(original.client_snapshot),
           JSON.stringify([item]), original.service_date, original.due_date, original.discount_terms,
           original.late_payment_rate, original.service_type, original.order_number,
           original.payment_terms, notes, net, tax, parsed.data.amountCents,
           parsed.data.idempotencyKey, originalId,
        ],
      );
      const row = inserted.rows[0];
      await client.query(
        `INSERT INTO sillage_professional_document_revisions
          (document_id, owner_id, revision, status, snapshot)
         VALUES ($1,$2,1,'issued',$3::jsonb)`,
        [row.id, ownerId(request), JSON.stringify(mapDocument(row))],
      );
      await client.query(
        `INSERT INTO sillage_professional_credit_allocations
          (owner_id, original_invoice_id, credit_note_id, amount_cents)
         VALUES ($1,$2,$3,$4)`,
        [ownerId(request), originalId, row.id, parsed.data.amountCents],
      );
      await client.query("COMMIT");
      response.status(201).json(mapDocument(row));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      sendError(response, error);
    } finally {
      client.release();
    }
  });

  router.get("/professional/documents/:documentId/download", owner, async (request, response) => {
    try {
      const id = requireUuid(routeParam(request.params.documentId), "Document");
      const parsedRevision = request.query.revision === undefined
        ? undefined
        : z.coerce.number().int().positive().safeParse(request.query.revision);
      if (parsedRevision && !parsedRevision.success) throw new HttpError(400, "Révision PDF invalide.");
      const documentResult = await database.query(
        "SELECT * FROM sillage_professional_documents WHERE id=$1 AND owner_id=$2",
        [id, ownerId(request)],
      );
      if (!documentResult.rowCount) throw new HttpError(404, "Document professionnel introuvable.");
      let snapshot: DbRow;
      if (parsedRevision?.data !== undefined) {
        const revision = await database.query(
          `SELECT snapshot FROM sillage_professional_document_revisions
            WHERE document_id=$1 AND owner_id=$2 AND revision=$3`,
          [id, ownerId(request), parsedRevision.data],
        );
        if (!revision.rowCount) throw new HttpError(404, "Version de document introuvable.");
        snapshot = revision.rows[0].snapshot;
      } else {
        snapshot = mapDocument(documentResult.rows[0]);
      }
      const pdf = generateDocumentPdf(snapshot);
      const title = String(snapshot.title ?? "document")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim().slice(0, 100) || "document";
      const ascii = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_");
      response.setHeader("Cache-Control", "private, no-store");
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Length", pdf.length);
      response.setHeader("Content-Disposition", `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${title}.pdf`)}`);
      response.end(pdf);
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

export default createProfessionalDocumentsRouter();