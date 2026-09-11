/**
 * Deterministic PDF rendering for professional documents.
 *
 * The document is rendered directly from the immutable snapshot supplied by
 * the route.  Nothing is written to object storage (or to a local path).  The
 * standard Helvetica fonts are deliberately used here so that the generated
 * file stays self-contained.  Text is encoded as hexadecimal WinAnsi strings:
 * unlike a JavaScript string placed directly in a PDF literal, this preserves
 * French accents, typographic apostrophes, dashes and the euro sign.
 */

type Snapshot = Record<string, any>;

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 50;
const RIGHT = 50;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const BODY_BOTTOM = 74;
const BODY_TOP = PAGE_HEIGHT - 82;

const WIN_ANSI_SPECIALS: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
  // Characters commonly introduced by a rich-text editor.
  "\u2011": 0x2d,
  "\u2212": 0x2d,
  "\u202f": 0x20,
  "\u2009": 0x20,
  "\u200b": 0x20,
};

function record(value: unknown): Snapshot | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Snapshot
    : null;
}

function first(value: Snapshot | null | undefined, ...keys: string[]): unknown {
  if (!value) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") return value[key];
  }
  return undefined;
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function nonEmpty(value: unknown): string | null {
  const result = text(value).trim();
  return result ? result : null;
}

function toWinAnsi(value: unknown): Buffer {
  const input = text(value).replace(/\r\n?/g, "\n");
  const bytes: number[] = [];

  for (const character of input) {
    const code = character.codePointAt(0) ?? 0x3f;
    if (WIN_ANSI_SPECIALS[character] !== undefined) {
      bytes.push(WIN_ANSI_SPECIALS[character]);
    } else if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (code >= 0xa0 && code <= 0xff) {
      // WinAnsi uses the same byte values as ISO-8859-1 for this range.
      bytes.push(code);
    } else if (code === 0x0a || code === 0x09) {
      // A newline is normally split before encoding.  Keeping this fallback
      // makes the encoder safe for a caller that supplies one in a label.
      bytes.push(0x20);
    } else {
      // WinAnsi cannot represent arbitrary Unicode.  French letters and the
      // punctuation used by this module are represented above; for an
      // unexpected character, retain a useful ASCII approximation where
      // possible instead of silently dropping it.
      const decomposed = character.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      if (decomposed.length === 1) {
        const fallback = decomposed.codePointAt(0) ?? 0x3f;
        bytes.push(fallback >= 0x20 && fallback <= 0x7e ? fallback : 0x3f);
      } else {
        bytes.push(0x3f);
      }
    }
  }
  return Buffer.from(bytes);
}

function pdfHex(value: unknown): string {
  return `<${toWinAnsi(value).toString("hex").toUpperCase()}>`;
}

function safeInteger(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function money(cents: unknown): string {
  const amount = safeInteger(cents);
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const euros = Math.floor(absolute / 100).toLocaleString("fr-FR");
  const decimals = String(absolute % 100).padStart(2, "0");
  return `${sign}${euros},${decimals} €`;
}

function percentage(rateBps: unknown): string {
  const rate = safeInteger(rateBps, -1);
  if (rate < 0) return "—";
  const whole = Math.floor(rate / 100);
  const decimal = String(rate % 100).padStart(2, "0");
  return `${whole},${decimal} %`;
}

function frenchDate(value: unknown): string {
  const valueText = nonEmpty(value);
  if (!valueText) return "";
  const match = valueText.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : valueText;
}

function addressLines(value: unknown): string[] {
  const address = record(value);
  if (!address) return [];
  return [
    nonEmpty(first(address, "line1", "addressLine1")),
    nonEmpty(first(address, "line2", "addressLine2")),
    [nonEmpty(first(address, "postalCode", "postal_code")), nonEmpty(address.city)]
      .filter(Boolean)
      .join(" "),
    nonEmpty(first(address, "country")) && text(first(address, "country")).toUpperCase() !== "FR"
      ? text(first(address, "country")).toUpperCase()
      : null,
  ].filter((line): line is string => Boolean(line));
}

function wrapText(value: unknown, maxCharacters: number): string[] {
  const input = text(value).replace(/\t/g, "    ");
  const sourceLines = input.split("\n");
  const lines: string[] = [];

  for (const sourceLine of sourceLines) {
    if (sourceLine.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = sourceLine;
    while (remaining.length > maxCharacters) {
      let splitAt = remaining.lastIndexOf(" ", maxCharacters);
      if (splitAt < Math.floor(maxCharacters * 0.45)) splitAt = maxCharacters;
      lines.push(remaining.slice(0, splitAt).trimEnd());
      remaining = remaining.slice(splitAt).trimStart();
    }
    lines.push(remaining);
  }
  return lines;
}

function documentKind(snapshot: Snapshot): string {
  switch (text(first(snapshot, "type", "documentType")).toLowerCase()) {
    case "quote":
      return "DEVIS";
    case "contract":
      return "CONTRAT — À RELIRE ET VALIDER";
    case "invoice":
      return "FACTURE";
    case "credit_note":
    case "credit-note":
    case "avoir":
      return "AVOIR";
    default:
      return text(first(snapshot, "type", "documentType") || "DOCUMENT").toUpperCase();
  }
}

function isDraft(snapshot: Snapshot): boolean {
  const status = text(first(snapshot, "status")).toLowerCase();
  return status === "" || status === "draft" || status === "brouillon";
}

function isSalaryContract(snapshot: Snapshot): boolean {
  const dossier = record(first(snapshot, "dossierSnapshot", "dossier_snapshot"));
  const pathway = text(first(snapshot, "pathway"))
    || text(first(dossier, "pathway"));
  return text(first(snapshot, "type", "documentType")).toLowerCase() === "contract"
    && (pathway === "salaried_employment"
      || Boolean(first(snapshot, "salaryContract", "salariedEmployment", "employmentContract"))
      || Boolean(first(dossier, "pathway")) && pathway !== "invoiced_service");
}

function originalInvoiceNumber(snapshot: Snapshot, notes: string): string | null {
  const explicit = first(
    snapshot,
    "originalInvoiceNumber",
    "originalDocumentNumber",
    "original_invoice_number",
  );
  if (explicit) return text(explicit);
  const original = record(first(snapshot, "originalInvoice", "original_invoice"));
  const nested = first(original, "documentNumber", "document_number", "number");
  if (nested) return text(nested);
  const match = notes.match(/facture(?:\s+d['’]origine)?\s+([A-Z0-9]+-\d{4}-\d{1,})/i);
  return match?.[1] ?? null;
}

interface RenderLine {
  value: string;
  size?: number;
  leading?: number;
  font?: "regular" | "bold";
  color?: string;
  maxCharacters?: number;
  gapBefore?: number;
}

function snapshotLines(snapshot: Snapshot): RenderLine[] {
  const lines: RenderLine[] = [];
  const kind = documentKind(snapshot);
  const draft = isDraft(snapshot);
  const identity = record(first(snapshot, "identitySnapshot", "identity_snapshot"));
  const client = record(first(snapshot, "clientSnapshot", "client_snapshot"));
  const status = draft ? "BROUILLON" : "ÉMIS";
  const notes = text(first(snapshot, "notes"));

  const add = (
    value: unknown,
    options: Omit<RenderLine, "value"> = {},
  ): void => lines.push({ value: text(value), ...options });
  const blank = (gapBefore = 2): void => add("", { leading: 6, gapBefore });
  const heading = (value: string): void => {
    blank(4);
    add(value, { font: "bold", size: 11, leading: 15, color: "0.12 0.20 0.32" });
  };
  const wrapped = (
    value: unknown,
    options: Omit<RenderLine, "value" | "maxCharacters"> = {},
  ): void => {
    for (const part of wrapText(value, options.size && options.size >= 11 ? 85 : 102)) {
      add(part, options);
    }
  };

  add(kind, { font: "bold", size: 19, leading: 23, color: "0.08 0.16 0.25", maxCharacters: 75 });
  add(first(snapshot, "title") || kind, { font: "bold", size: 12, leading: 17, maxCharacters: 85 });
  add(`${status}${draft ? " — document à relire et valider avant utilisation" : ""}`, {
    font: "bold",
    size: 9,
    leading: 14,
    color: draft ? "0.65 0.20 0.08" : "0.12 0.38 0.22",
  });

  const documentNumber = nonEmpty(first(snapshot, "documentNumber", "document_number"));
  if (documentNumber) add(`Numéro du document : ${documentNumber}`);
  const revision = first(snapshot, "revision");
  if (revision !== undefined && revision !== null) add(`Révision du snapshot : ${text(revision)}`);
  const issueDate = frenchDate(first(snapshot, "issueDate", "issue_date"));
  if (issueDate) add(`Date d'émission : ${issueDate}`);
  const snapshotDate = frenchDate(first(snapshot, "updatedAt", "updated_at", "createdAt", "created_at"));
  if (snapshotDate) add(`Snapshot enregistré le : ${snapshotDate}`);

  heading("Identité du professionnel");
  if (identity) {
    const legalForm = text(first(identity, "legalForm", "legal_form")).toLowerCase();
    const legalName = nonEmpty(first(identity, "legalName", "legal_name"));
    const firstName = nonEmpty(first(identity, "firstName", "first_name"));
    const lastName = nonEmpty(first(identity, "lastName", "last_name"));
    const tradeName = nonEmpty(first(identity, "tradeName", "trade_name"));
    if (legalForm === "ei" || firstName || lastName) {
      if (firstName || lastName) add(`Entrepreneur individuel : ${[firstName, lastName].filter(Boolean).join(" ")} (EI)`);
      if (legalName && legalName !== [firstName, lastName].filter(Boolean).join(" ")) add(`Nom légal : ${legalName}`);
    } else if (legalName) {
      add(`Dénomination sociale : ${legalName}`);
      const companyLegalForm = nonEmpty(first(identity, "companyLegalForm", "company_legal_form", "legalEntityForm"));
      if (companyLegalForm) add(`Forme juridique : ${companyLegalForm}`);
    }
    if (tradeName) add(`Nom commercial : ${tradeName}`);
    const capital = first(identity, "capitalCents", "capital_cents", "capitalSocialCents", "capital_social_cents");
    if (legalForm === "company" && capital !== undefined && capital !== null) {
      add(`Capital social enregistré : ${money(capital)}`);
    }
    const registrationNumber = nonEmpty(first(identity, "registrationNumber", "registration_number"));
    if (registrationNumber) add(`Immatriculation : ${registrationNumber}`);
    const siren = nonEmpty(first(identity, "siren", "SIREN"));
    const siret = nonEmpty(first(identity, "siret", "SIRET"));
    if (siren) add(`Siren : ${siren}`);
    if (siret) add(`Siret : ${siret}`);
    const vatNumber = nonEmpty(first(identity, "vatNumber", "vat_number"));
    if (vatNumber) add(`N° de TVA intracommunautaire : ${vatNumber}`);
    for (const addressLine of addressLines(first(identity, "address"))) add(addressLine);
    const email = nonEmpty(first(identity, "email"));
    const phone = nonEmpty(first(identity, "phone"));
    if (email) add(`Courriel : ${email}`);
    if (phone) add(`Téléphone : ${phone}`);
  } else {
    add("Identité professionnelle non enregistrée dans ce snapshot.", { color: "0.60 0.18 0.10" });
  }

  heading("Client");
  if (client) {
    const kindClient = text(first(client, "kind")).toLowerCase();
    const clientName = kindClient === "business"
      ? nonEmpty(first(client, "companyName", "company_name"))
      : [nonEmpty(first(client, "firstName", "first_name")), nonEmpty(first(client, "lastName", "last_name"))]
        .filter(Boolean)
        .join(" ");
    if (clientName) add(`${kindClient === "business" ? "Dénomination" : "Nom"} : ${clientName}`);
    const contactName = nonEmpty(first(client, "contactName", "contact_name"));
    if (contactName) add(`Contact : ${contactName}`);
    for (const addressLine of addressLines(first(client, "address"))) add(addressLine);
    const clientVat = nonEmpty(first(client, "vatNumber", "vat_number"));
    if (clientVat) add(`N° de TVA client : ${clientVat}`);
    const email = nonEmpty(first(client, "email"));
    const phone = nonEmpty(first(client, "phone"));
    if (email) add(`Courriel client : ${email}`);
    if (phone) add(`Téléphone client : ${phone}`);
  } else {
    add("Client non renseigné dans ce snapshot.", { color: "0.60 0.18 0.10" });
  }

  heading("Prestation et conditions");
  const serviceType = nonEmpty(first(snapshot, "serviceType", "service_type"));
  const serviceDate = frenchDate(first(snapshot, "serviceDate", "service_date"));
  const dueDate = frenchDate(first(snapshot, "dueDate", "due_date"));
  const validUntil = frenchDate(first(snapshot, "validUntil", "valid_until"));
  const orderNumber = nonEmpty(first(snapshot, "orderNumber", "order_number"));
  const discountTerms = nonEmpty(first(snapshot, "discountTerms", "discount_terms"));
  const paymentTerms = nonEmpty(first(snapshot, "paymentTerms", "payment_terms"));
  const latePaymentRate = nonEmpty(first(snapshot, "latePaymentRate", "late_payment_rate"));

  if (serviceType) add(`Nature de la prestation : ${serviceType}`);
  if (serviceDate) add(`Date de livraison ou de prestation : ${serviceDate}`);
  if (dueDate) add(`Date d'échéance : ${dueDate}`);
  if (validUntil) add(`Validité de l'offre : jusqu'au ${validUntil}`);
  if (orderNumber) add(`Bon de commande : ${orderNumber}`);
  if (discountTerms) wrapped(`Escompte / remise : ${discountTerms}`);
  if (paymentTerms) wrapped(`Conditions de paiement : ${paymentTerms}`);
  if (client && text(first(client, "kind")).toLowerCase() === "business") {
    if (latePaymentRate) wrapped(`Pénalités de retard B2B : ${latePaymentRate}`);
    add("Indemnité forfaitaire B2B pour frais de recouvrement : 40 €", { font: "bold" });
  }

  const lineItems = first(snapshot, "lineItems", "line_items");
  heading("Détail des prestations");
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    lineItems.forEach((itemValue: unknown, index: number) => {
      const item = record(itemValue) ?? {};
      const quantity = safeInteger(first(item, "quantity"), 1);
      const unit = first(item, "unitAmountCents", "unit_amount_cents");
      const lineNet = first(item, "lineNetCents", "line_net_cents")
        ?? (unit !== undefined ? quantity * safeInteger(unit) : 0);
      const lineTax = first(item, "lineTaxCents", "line_tax_cents")
        ?? (first(item, "taxCents", "tax_cents") ?? 0);
      const lineTotal = first(item, "lineTotalCents", "line_total_cents")
        ?? safeInteger(lineNet) + safeInteger(lineTax);
      const description = nonEmpty(first(item, "description")) || `Ligne ${index + 1}`;
      blank(1);
      wrapped(`${index + 1}. ${description}`, { font: "bold", size: 9.5, leading: 13 });
      add(
        `Quantité : ${quantity} · Prix unitaire HT : ${money(unit)} · Taux de TVA : ${percentage(first(item, "taxRateBps", "tax_rate_bps"))}`,
        { size: 8.5, leading: 12, maxCharacters: 115 },
      );
      add(
        `Montant HT : ${money(lineNet)} · TVA : ${money(lineTax)} · TTC : ${money(lineTotal)}`,
        { size: 8.5, leading: 12, maxCharacters: 115 },
      );
    });
  } else {
    add("Aucune ligne de prestation.");
  }

  heading("Totaux");
  add(`Total HT : ${money(first(snapshot, "subtotalCents", "subtotal_cents"))}`, { font: "bold" });
  add(`TVA : ${money(first(snapshot, "taxCents", "tax_cents"))}`);
  add(`Total TTC : ${money(first(snapshot, "totalCents", "total_cents"))}`, {
    font: "bold",
    size: 11,
    leading: 15,
  });
  const vatRegime = text(first(identity, "vatRegime", "vat_regime")).toLowerCase();
  if (vatRegime === "franchise") {
    add("TVA non applicable, article 293 B du code général des impôts", { font: "bold" });
  }

  if (text(first(snapshot, "type", "documentType")).toLowerCase() === "credit_note") {
    const originalNumber = originalInvoiceNumber(snapshot, notes);
    if (originalNumber) add(`Facture d'origine : ${originalNumber}`, { font: "bold" });
    else if (first(snapshot, "originalInvoiceId", "original_invoice_id")) {
      add(`Facture d'origine : identifiant ${text(first(snapshot, "originalInvoiceId", "original_invoice_id"))}`, {
        font: "bold",
      });
    }
  }

  if (isSalaryContract(snapshot)) {
    blank(4);
    add("DOCUMENT PRÉPARATOIRE — PARCOURS SALARIÉ", {
      font: "bold",
      size: 11,
      leading: 15,
      color: "0.65 0.20 0.08",
    });
    wrapped(
      "Ce document est préparatoire et doit être relu et validé par un professionnel compétent. Il ne constitue pas une paie, ne calcule aucune cotisation et ne remplace ni le contrat de travail final, ni la DPAE, ni la DUS/GUSO.",
      { size: 9, leading: 13 },
    );
  }

  const contractText = first(snapshot, "contractText", "contract_text");
  if (contractText) {
    heading("Texte contractuel");
    wrapped(contractText, { size: 9, leading: 13, maxCharacters: 102 });
  }
  if (notes) {
    heading("Notes");
    wrapped(notes, { size: 9, leading: 13, maxCharacters: 102 });
  }

  heading("Avertissement");
  wrapped(
    "Ce PDF est un export de relecture ou d'archivage généré depuis le snapshot enregistré. Il ne vaut pas signature électronique probante, dépôt ou transmission officielle, ni transmission réglementaire d'une facture électronique. Les textes contractuels et sociaux doivent être validés par un professionnel.",
    { size: 8.5, leading: 12, maxCharacters: 110 },
  );
  return lines;
}

interface Page {
  commands: string[];
  y: number;
}

function textCommand(value: string, x: number, y: number, size: number, font: "regular" | "bold", color: string): string {
  const fontName = font === "bold" ? "/F2" : "/F1";
  return `${color} rg BT ${fontName} ${size} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm ${pdfHex(value)} Tj ET`;
}

function finishPage(page: Page, snapshot: Snapshot, pageNumber: number, pageCount: number): void {
  const documentNumber = nonEmpty(first(snapshot, "documentNumber", "document_number")) || "document sans numéro";
  const revision = first(snapshot, "revision");
  const snapshotDate = frenchDate(first(snapshot, "updatedAt", "updated_at", "createdAt", "created_at"));
  const revisionText = revision === undefined || revision === null ? "" : ` · Révision ${text(revision)}`;
  const dateText = snapshotDate ? ` · Snapshot ${snapshotDate}` : "";
  const footer = `${documentNumber}${revisionText}${dateText} · Page ${pageNumber}/${pageCount}`;
  page.commands.push(textCommand(footer, LEFT, 46, 7.3, "regular", "0.35 0.35 0.35"));
  page.commands.push(textCommand(
    "Export privé — ne vaut pas signature probante, dépôt officiel ni transmission électronique réglementaire",
    LEFT,
    31,
    6.8,
    "regular",
    "0.35 0.35 0.35",
  ));
}

function drawPageHeader(page: Page, snapshot: Snapshot): void {
  const kind = documentKind(snapshot);
  const title = text(first(snapshot, "title") || kind);
  page.commands.push(textCommand("SILLAGE · DOCUMENT PROFESSIONNEL", LEFT, PAGE_HEIGHT - 34, 7.5, "bold", "0.30 0.38 0.48"));
  page.commands.push(textCommand(kind, PAGE_WIDTH - RIGHT - Math.min(180, kind.length * 6.5), PAGE_HEIGHT - 34, 7.5, "bold", "0.30 0.38 0.48"));
  page.commands.push("0.78 0.82 0.86 RG 50 759 m 545 759 l S");
  if (isDraft(snapshot)) {
    page.commands.push(
      "q 0.88 0.88 0.88 rg BT /F2 46 Tf 0.94 0.34 -0.34 0.94 145 380 Tm <42524f55494c4c4f4e> Tj ET Q",
    );
  }
  // Repeat a compact title on subsequent pages so an archived page remains
  // identifiable when printed or separated from the rest of the document.
  if (title) {
    page.commands.push(textCommand(title, LEFT, PAGE_HEIGHT - 60, 8, "regular", "0.38 0.38 0.38"));
  }
}

function makePdf(pages: Page[]): Buffer {
  const objects: string[] = [];
  const pageObjectNumbers = pages.map((_page, index) => 6 + index * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  pages.forEach((page, index) => {
    const stream = page.commands.join("\n");
    const contentObject = 5 + index * 2;
    const pageObject = 6 + index * 2;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    if (pageObject !== pageObjectNumbers[index]) {
      throw new Error("PDF page object numbering invariant failed.");
    }
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1")];
  const offsets: number[] = [0];
  let offset = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = offset;
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "ascii");
    chunks.push(chunk);
    offset += chunk.length;
  });
  const xrefOffset = offset;
  const xref: string[] = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
  ];
  chunks.push(Buffer.from(`${xref.join("\n")}\n`, "ascii"));
  return Buffer.concat(chunks);
}

/**
 * Generate a complete PDF from one immutable document snapshot.
 *
 * The flow renderer deliberately has no line or page limit.  Long contract
 * text and the API's maximum of 100 line items are therefore carried through
 * to as many A4 pages as required.
 */
export function generateDocumentPdf(snapshot: Record<string, any>): Buffer {
  const lines = snapshotLines(snapshot);
  const pages: Page[] = [];
  let page: Page = { commands: [], y: BODY_TOP };
  drawPageHeader(page, snapshot);
  pages.push(page);

  const addPage = (): Page => {
    page = { commands: [], y: BODY_TOP };
    drawPageHeader(page, snapshot);
    pages.push(page);
    return page;
  };

  for (const line of lines) {
    const size = line.size ?? 9.5;
    const leading = line.leading ?? 13;
    const gapBefore = line.gapBefore ?? 0;
    const required = (line.value ? leading : Math.max(6, leading)) + gapBefore;
    if (page.y - required < BODY_BOTTOM) {
      addPage();
    }
    page.y -= gapBefore;
    if (line.value) {
      const maxCharacters = line.maxCharacters ?? (size >= 11 ? 85 : 102);
      for (const wrappedLine of wrapText(line.value, maxCharacters)) {
        if (page.y - leading < BODY_BOTTOM) addPage();
        page.commands.push(
          textCommand(
            wrappedLine,
            LEFT,
            page.y,
            size,
            line.font ?? "regular",
            line.color ?? "0.10 0.12 0.15",
          ),
        );
        page.y -= leading;
      }
    } else {
      page.y -= Math.max(6, leading);
    }
  }

  pages.forEach((currentPage, index) => finishPage(currentPage, snapshot, index + 1, pages.length));
  return makePdf(pages);
}