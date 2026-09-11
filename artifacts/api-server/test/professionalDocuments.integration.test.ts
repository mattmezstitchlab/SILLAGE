import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { pool } from "@workspace/db";
import { createProfessionalDocumentsRouter } from "../src/routes/professionalDocuments";

const ownerId = `professional-owner-${randomUUID()}`;
const otherOwnerId = `professional-other-${randomUUID()}`;
const app = express();
app.use(express.json());
app.use(
  createProfessionalDocumentsRouter({
    resolveOwner: (request) => {
      const identity = request.header("x-integration-identity");
      return identity === "owner" ? ownerId : identity === "other-owner" ? otherOwnerId : null;
    },
  }),
);

let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const ids = {
  client: "",
  billedDossier: "",
  salaryDossier: "",
  quote: "",
  contract: "",
  invoiceA: "",
  invoiceB: "",
  invoiceIdempotent: "",
};

function request(path: string, init: RequestInit = {}, identity = "owner") {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-integration-identity": identity,
      ...(init.headers ?? {}),
    },
  });
}

const json = (value: unknown) => JSON.stringify(value);
const profile = {
  legalForm: "ei",
  legalName: "DJ Test EI",
  firstName: "DJ",
  lastName: "Test",
  siren: "123456789",
  siret: "12345678901234",
  address: { line1: "1 rue des Tests", postalCode: "75001", city: "Paris", country: "FR" },
  email: "dj.test@example.test",
  vatRegime: "standard",
  vatNumber: "FR00123456789",
  companySize: "micro",
};
const lineItems = [{ description: "Prestation DJ", quantity: 1, unitAmountCents: 10000, taxRateBps: 2000 }];
const issueFields = {
  serviceDate: "2026-09-12",
  dueDate: "2026-10-12",
  paymentTerms: "Paiement à 30 jours.",
  latePaymentRate: "Taux BCE majoré de 10 points, sous réserve du taux applicable.",
  discountTerms: "Escompte pour paiement anticipé : néant",
};

async function createDocument(type: "quote" | "contract" | "invoice", extra: Record<string, unknown> = {}) {
  const response = await request("/professional/documents", {
    method: "POST",
    body: json({
      type,
      title: `${type} integration`,
      clientId: ids.client,
      ...(type === "invoice" ? { dossierId: ids.billedDossier } : {}),
      lineItems,
      ...extra,
    }),
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<Record<string, any>>;
}

async function issue(id: string, revision: number, key: string) {
  return request(`/professional/documents/${id}/issue`, {
    method: "POST",
    body: json({ revision, idempotencyKey: key, sourcesReviewed: true }),
  });
}

before(async () => {
  await pool.query(
    `DELETE FROM sillage_professional_credit_allocations
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_document_revisions
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_documents
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_dossiers
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_clients
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_profiles
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed.");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const savedProfile = await request("/professional/profile", {
    method: "PUT",
    body: json(profile),
  });
  assert.equal(savedProfile.status, 200);
  const client = await request("/professional/clients", {
    method: "POST",
    body: json({
      kind: "individual",
      firstName: "Client",
      lastName: "Test",
      address: { line1: "2 rue Client", postalCode: "75002", city: "Paris", country: "FR" },
    }),
  });
  assert.equal(client.status, 201);
  ids.client = (await client.json()).id;
  const billedDossier = await request("/professional/dossiers", {
    method: "POST",
    body: json({
      name: "Dossier prestation facturée",
      clientId: ids.client,
      startDate: "2026-09-12",
      endDate: "2026-09-12",
      pathway: "invoiced_service",
    }),
  });
  assert.equal(billedDossier.status, 201);
  ids.billedDossier = (await billedDossier.json()).id;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.query(
    `DELETE FROM sillage_professional_credit_allocations
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_document_revisions
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_documents
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_dossiers
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_clients
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.query(
    `DELETE FROM sillage_professional_profiles
      WHERE owner_id IN ($1,$2)`,
    [ownerId, otherOwnerId],
  );
  await pool.end();
});

test("exposes reviewed source summaries for the frontend", async () => {
  const response = await request("/professional/sources");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.sourceReviewDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(body.sources.length >= 5);
  assert.ok(body.actions.some((action: any) => action.key === "invoice-pdf-scope"));
  assert.ok(body.sources.every((source: any) => source.official && source.reviewedAt && source.summary));
});

test("keeps quote and contract snapshots immutable and downloadable as PDFs", async () => {
  const quote = await createDocument("quote");
  ids.quote = quote.id;
  const patched = await request(`/professional/documents/${quote.id}`, {
    method: "PATCH",
    body: json({ ...quote, title: "quote integration updated", revision: quote.revision }),
  });
  assert.equal(patched.status, 200);
  const revisions = await request(`/professional/documents/${quote.id}/revisions`);
  assert.equal(revisions.status, 200);
  assert.equal((await revisions.json()).length, 2);
  for (const revision of [1, 2]) {
    const pdf = await request(`/professional/documents/${quote.id}/download?revision=${revision}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal((await pdf.arrayBuffer()).byteLength > 100, true);
  }

  const contract = await createDocument("contract");
  ids.contract = contract.id;
  const contractPdf = await request(`/professional/documents/${contract.id}/download`);
  assert.equal(contractPdf.status, 200);
  assert.equal(contractPdf.headers.get("content-type"), "application/pdf");
});

test("blocks salaried dossiers from invoice substitution", async () => {
  const dossierResponse = await request("/professional/dossiers", {
    method: "POST",
    body: json({
      name: "Dossier salarié",
      clientId: ids.client,
      startDate: "2026-09-12",
      pathway: "salaried_employment",
      checklist: [{
        key: "dpae",
        label: "Préparer la DPAE",
        checked: false,
        sourceUrl: "https://www.urssaf.fr/accueil/employeur/embaucher-gerer-salaries/embaucher/declaration-prealable-embauche.html",
      }],
    }),
  });
  assert.equal(dossierResponse.status, 201);
  ids.salaryDossier = (await dossierResponse.json()).id;
  const invoice = await request("/professional/documents", {
    method: "POST",
    body: json({ type: "invoice", title: "salary invoice", dossierId: ids.salaryDossier, lineItems }),
  });
  assert.equal(invoice.status, 400);
});

test("numbers two concurrent invoices uniquely and retries idempotently", async () => {
  const [a, b, same] = await Promise.all([
    createDocument("invoice", issueFields),
    createDocument("invoice", issueFields),
    createDocument("invoice", issueFields),
  ]);
  ids.invoiceA = a.id;
  ids.invoiceB = b.id;
  ids.invoiceIdempotent = same.id;
  const [issuedA, issuedB] = await Promise.all([
    issue(a.id, a.revision, `concurrent-a-${randomUUID()}`),
    issue(b.id, b.revision, `concurrent-b-${randomUUID()}`),
  ]);
  assert.equal(issuedA.status, 200);
  assert.equal(issuedB.status, 200);
  const issuedBodies = await Promise.all([issuedA.json(), issuedB.json()]);
  assert.notEqual(issuedBodies[0].documentNumber, issuedBodies[1].documentNumber);

  const first = await issue(same.id, same.revision, "same-invoice-key-123");
  const retry = await issue(same.id, same.revision, "same-invoice-key-123");
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((await first.json()).id, (await retry.json()).id);
});

test("issued documents cannot be updated or deleted and credit notes reverse VAT proportionally", async () => {
  const invoice = await request(`/professional/documents/${ids.invoiceA}`);
  const issued = await invoice.json();
  const update = await request(`/professional/documents/${ids.invoiceA}`, {
    method: "PATCH",
    body: json({ ...issued, revision: issued.revision }),
  });
  assert.equal(update.status, 409);
  const deletion = await request(`/professional/documents/${ids.invoiceA}`, { method: "DELETE" });
  assert.equal(deletion.status, 409);

  const credit = await request(`/professional/documents/${ids.invoiceA}/credit-notes`, {
    method: "POST",
    body: json({
      amountCents: 10000,
      title: "Avoir partiel",
      idempotencyKey: "credit-partial-key",
      sourcesReviewed: true,
    }),
  });
  assert.equal(credit.status, 201);
  const creditBody = await credit.json();
  assert.equal(creditBody.originalInvoiceId, ids.invoiceA);
  assert.equal(creditBody.taxCents, 1667);
  assert.equal(creditBody.totalCents, 10000);

  const tooLarge = await request(`/professional/documents/${ids.invoiceA}/credit-notes`, {
    method: "POST",
    body: json({
      amountCents: 5001,
      title: "Avoir excessif",
      idempotencyKey: "credit-too-large-key",
      sourcesReviewed: true,
    }),
  });
  assert.equal(tooLarge.status, 409);
});

test("denies guests and other owners on every PDF path", async () => {
  for (const id of [ids.quote, ids.contract, ids.invoiceA]) {
    const guest = await request(`/professional/documents/${id}/download`, {}, "guest");
    assert.equal(guest.status, 401);
    const other = await request(`/professional/documents/${id}/download`, {}, "other-owner");
    assert.equal(other.status, 404);
  }
});