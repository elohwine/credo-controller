/**
 * Zoho Books client owned by Credentis. The neighbouring fiscalisation app has the same
 * shape; this copy is the one this platform calls. The two apps do not call each other.
 */
import { money } from "./money";

/** A Zoho Books organisation the connected account can see. */
export type ZohoOrganisation = { id: string; name: string };

export const ZOHO_SCOPES = [
  "ZohoBooks.invoices.READ",
  "ZohoBooks.invoices.UPDATE",
  "ZohoBooks.creditnotes.READ",
  "ZohoBooks.settings.READ",
  "ZohoBooks.contacts.READ",
  "ZohoBooks.customerpayments.READ",
].join(",");

const HS_FIELDS = new Set(["hs_code", "cf_hs_code", "hsn_or_sac", "hs_code_zimra"]);

export class ZohoError extends Error {}

export type TaxMapping = { taxID: number; taxPercent?: string | null; taxCode?: string; taxName?: string };
export type ZohoMappings = {
  taxes: Record<string, TaxMapping>;
  items: Record<string, string>;
  payments: Record<string, string>;
};

export type NeutralDocument = {
  source: "zoho_invoice" | "zoho_creditnote";
  sourceId: string;
  invoiceNo: string;
  receiptType: "FiscalInvoice" | "CreditNote";
  currency: string;
  taxInclusive: boolean;
  lines: {
    name: string;
    quantity: string;
    price: string;
    total: string;
    taxID: number;
    taxPercent?: string;
    taxCode?: string;
    hsCode?: string;
    sourceItemId: string;
  }[];
  payments: { moneyTypeCode: string; amount: string }[];
  buyer: { buyerRegisterName: string; buyerTIN: string } | null;
  customerName?: string;
  /** Present when the Zoho invoice or its contact includes a phone. Used only to address a wallet card. */
  customerPhone?: string;
  zohoDate?: string;
  zohoStatus: string;
  notes?: string;
  referenceSourceId?: string;
  /** Zoho Books branch/location, used to route the document to that branch's fiscal device. */
  zohoBranchId?: string;
  zohoBranchName?: string;
};

type ZohoRecord = Record<string, unknown>;

export function authorizeUrl(accountsUrl: string, clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: clientId,
    state,
    response_type: "code",
    redirect_uri: redirectUri,
    access_type: "offline",
    prompt: "consent",
  });
  return `${accountsUrl.replace(/\/$/, "")}/oauth/v2/auth?${query}`;
}

export async function exchangeCode(accountsUrl: string, clientId: string, clientSecret: string, redirectUri: string, code: string) {
  return form(`${accountsUrl.replace(/\/$/, "")}/oauth/v2/token`, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
}

export async function refreshAccessToken(accountsUrl: string, clientId: string, clientSecret: string, refreshToken: string) {
  return form(`${accountsUrl.replace(/\/$/, "")}/oauth/v2/token`, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

export async function getInvoice(apiDomain: string, accessToken: string, organizationId: string, invoiceId: string) {
  return getDocument(apiDomain, accessToken, organizationId, "invoice", invoiceId);
}

export async function getCreditNote(apiDomain: string, accessToken: string, organizationId: string, creditnoteId: string) {
  return getDocument(apiDomain, accessToken, organizationId, "creditnote", creditnoteId);
}

async function getDocument(apiDomain: string, accessToken: string, organizationId: string, kind: "invoice" | "creditnote", id: string) {
  if (!id.trim()) throw new ZohoError(`Choose a Zoho ${kind === "invoice" ? "invoice" : "credit note"}`);
  const payload = await getJson(
    `${apiDomain.replace(/\/$/, "")}/books/v3/${kind}s/${encodeURIComponent(id)}?organization_id=${encodeURIComponent(organizationId)}`,
    accessToken,
  );
  const document = payload[kind];
  if (!document || typeof document !== "object" || Array.isArray(document) ||
      typeof (document as ZohoRecord)[`${kind}_id`] !== "string" ||
      (document as ZohoRecord)[`${kind}_id`] !== id) {
    throw new ZohoError(`Zoho did not return the requested ${kind === "invoice" ? "invoice" : "credit note"}`);
  }
  return document as ZohoRecord;
}

export async function listIssuedInvoices(apiDomain: string, accessToken: string, organizationId: string) {
  return listIssuedDocuments(apiDomain, accessToken, organizationId, "invoice");
}

export async function listIssuedCreditNotes(apiDomain: string, accessToken: string, organizationId: string) {
  return listIssuedDocuments(apiDomain, accessToken, organizationId, "creditnote");
}

async function listIssuedDocuments(apiDomain: string, accessToken: string, organizationId: string, kind: "invoice" | "creditnote") {
  const documents: ZohoRecord[] = [];
  for (let page = 1; ; page++) {
    const payload = await getJson(
      `${apiDomain.replace(/\/$/, "")}/books/v3/${kind}s?organization_id=${encodeURIComponent(organizationId)}&filter_by=Status.All&sort_column=date&sort_order=D&per_page=50&page=${page}`,
      accessToken,
    );
    const list = payload[`${kind}s`];
    if (!Array.isArray(list)) throw new ZohoError(`Zoho did not return ${kind === "invoice" ? "an invoice" : "a credit note"} list`);
    for (const value of list) {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          typeof value[`${kind}_id`] !== "string" || !value[`${kind}_id`].trim() ||
          typeof value.status !== "string" || !value.status.trim()) {
        throw new ZohoError("Zoho returned an invalid document in its list");
      }
      const status = value.status.toLowerCase();
      if (!["draft", "void"].includes(status)) documents.push(value);
    }
    const context = payload.page_context as ZohoRecord | undefined;
    if (context?.has_more_page !== true) return documents;
    if (!list.length) throw new ZohoError("Zoho reported another page but returned an empty document list");
  }
}

export async function listOrganizations(apiDomain: string, accessToken: string) {
  const payload = await getJson(`${apiDomain.replace(/\/$/, "")}/books/v3/organizations`, accessToken);
  if (!Array.isArray(payload.organizations)) throw new ZohoError("Zoho did not return an organisation list");
  return payload.organizations.map((value: unknown): ZohoOrganisation => {
    if (!value || typeof value !== "object" || !("organization_id" in value) ||
        typeof value.organization_id !== "string" || !value.organization_id.trim()) {
      throw new ZohoError("Zoho returned an organisation without a valid ID");
    }
    const id = value.organization_id.trim();
    const name = "name" in value && typeof value.name === "string" ? value.name.trim() : "";
    return { id, name: name || id };
  });
}

/** Zoho Books renamed branches to locations; older organisations still answer on /branches. */
export async function listBranches(apiDomain: string, accessToken: string, organizationId: string) {
  const base = `${apiDomain.replace(/\/$/, "")}/books/v3`;
  for (const kind of ["locations", "branches"] as const) {
    let payload: ZohoRecord;
    try {
      payload = await getJson(`${base}/${kind}?organization_id=${encodeURIComponent(organizationId)}`, accessToken);
    } catch {
      continue;
    }
    const list = payload[kind];
    if (!Array.isArray(list)) continue;
    return list.flatMap((value: ZohoRecord) => {
      const id = value.location_id ?? value.branch_id;
      if (id === undefined || id === null || !String(id).trim()) return [];
      return [{ id: String(id).trim(), name: String(value.location_name ?? value.branch_name ?? id) }];
    });
  }
  return [];
}

export function mapZohoDocument(source: ZohoRecord, isVatPayer: boolean, mappings: ZohoMappings): NeutralDocument {
  const credit = "creditnote_id" in source || "creditnote_number" in source;
  const status = String(source.status ?? "").toLowerCase();
  if (status === "draft" || status === "void") throw new ZohoError(`Zoho document status '${status}' is not fiscalised`);
  const number = String((credit ? source.creditnote_number : source.invoice_number) ?? "");
  const sourceId = String((credit ? source.creditnote_id : source.invoice_id) ?? "");
  if (!number || !sourceId) throw new ZohoError("Zoho document is missing its id or number");

  const sign = credit ? -1 : 1;
  const rawLines = (source.line_items as ZohoRecord[] | undefined) ?? [];
  if (!rawLines.length) throw new ZohoError("Zoho document has no line items");
  const lines = rawLines.map((line) => mapLine(line, isVatPayer, mappings, sign));
  const currency = String(source.currency_code ?? "USD").toUpperCase();
  const total = money(Number(source.total ?? 0) * sign);
  const balanceSource = source.balance === undefined || source.balance === null ? source.total ?? 0 : source.balance;
  const balance = money(Number(balanceSource) * sign);
  const paid = money(total.minus(balance));

  const document: NeutralDocument = {
    source: credit ? "zoho_creditnote" : "zoho_invoice",
    sourceId,
    invoiceNo: number,
    receiptType: credit ? "CreditNote" : "FiscalInvoice",
    currency,
    taxInclusive: Boolean(source.is_inclusive_tax),
    lines,
    payments: payments(source, mappings, total, paid, balance),
    buyer: buyer(source),
    customerName: source.customer_name ? String(source.customer_name) : undefined,
    zohoDate: source.date ? String(source.date) : undefined,
    zohoStatus: status,
  };
  const phone = phoneFromZoho(source);
  if (phone) document.customerPhone = phone;
  const branchId = source.location_id ?? source.branch_id;
  if (branchId !== undefined && branchId !== null && String(branchId).trim()) {
    document.zohoBranchId = String(branchId).trim();
    const branchName = source.location_name ?? source.branch_name;
    if (branchName) document.zohoBranchName = String(branchName);
  }
  if (credit) {
    document.notes = String(source.notes || source.reason || "Credit note");
    const invoices = source.invoices_credited as ZohoRecord[] | undefined;
    if (invoices && invoices.length > 1) throw new ZohoError("A fiscal credit note must reference one original invoice; split this Zoho credit note before importing");
    const credited = invoices?.[0]?.invoice_id;
    const reference = source.invoice_id ?? credited;
    if (reference) document.referenceSourceId = String(reference);
  }
  return document;
}

function mapLine(raw: ZohoRecord, isVatPayer: boolean, mappings: ZohoMappings, sign: number): NeutralDocument["lines"][number] {
  const tax = resolveTax(raw, mappings);
  const quantity = money(typeof raw.quantity === "number" || typeof raw.quantity === "string" ? raw.quantity : 0);
  const rate = money(Number(raw.rate ?? 0) * sign);
  const total = raw.item_total === undefined || raw.item_total === null ? money(rate.times(quantity)) : money(Number(raw.item_total) * sign);
  const line: NeutralDocument["lines"][number] = {
    name: String(raw.name || raw.description || "Item"),
    quantity: String(raw.quantity ?? 0),
    price: rate.toFixed(2),
    total: total.toFixed(2),
    taxID: tax.taxID,
    sourceItemId: String(raw.item_id ?? ""),
  };
  if (tax.taxPercent) line.taxPercent = tax.taxPercent;
  if (tax.taxCode) line.taxCode = tax.taxCode;
  const hs = hsCode(raw, mappings);
  if (hs) line.hsCode = hs;
  else if (isVatPayer) throw new ZohoError(`Item '${line.name}' needs an HS code before it can be fiscalised`);
  return line;
}

function resolveTax(raw: ZohoRecord, mappings: ZohoMappings): TaxMapping {
  const zohoTaxId = String(raw.tax_id ?? "");
  const percent = raw.tax_percentage;
  const percentKey = raw.tax_exemption_id || ((percent === null || percent === undefined || percent === "") && !zohoTaxId)
    ? "exempt"
    : money(percent as string | number).toFixed(2);
  const found = (zohoTaxId && mappings.taxes[zohoTaxId]) || mappings.taxes[percentKey];
  if (!found) throw new ZohoError(`No FDMS tax mapping for Zoho tax '${zohoTaxId || percentKey}'`);
  return found;
}

function hsCode(raw: ZohoRecord, mappings: ZohoMappings): string {
  const fields = [...((raw.item_custom_fields as ZohoRecord[]) ?? []), ...((raw.custom_fields as ZohoRecord[]) ?? [])];
  for (const field of fields) {
    const name = String(field.api_name || field.label || "").toLowerCase().replace(/ /g, "_");
    if (HS_FIELDS.has(name) && field.value) return String(field.value);
  }
  if (raw.hsn_or_sac) return String(raw.hsn_or_sac);
  return mappings.items[String(raw.item_id ?? "")] ?? "";
}

/** A phone long enough to address a wallet, from the document or its contact persons. */
export function phoneFromZoho(source: ZohoRecord): string | undefined {
  const candidates: unknown[] = [source.phone, source.mobile, source.customer_phone];
  const persons = source.contact_persons;
  if (Array.isArray(persons)) {
    for (const person of persons) {
      if (!person || typeof person !== "object") continue;
      const row = person as ZohoRecord;
      candidates.push(row.phone, row.mobile);
    }
  }
  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text.replace(/\D/g, "").length >= 9) return text;
  }
  return undefined;
}

export async function getContact(apiDomain: string, accessToken: string, organizationId: string, contactId: string) {
  if (!contactId.trim()) throw new ZohoError("Choose a Zoho contact");
  const payload = await getJson(
    `${apiDomain.replace(/\/$/, "")}/books/v3/contacts/${encodeURIComponent(contactId)}?organization_id=${encodeURIComponent(organizationId)}`,
    accessToken,
  );
  const contact = payload.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) throw new ZohoError("Zoho did not return the contact");
  return contact as ZohoRecord;
}

function buyer(source: ZohoRecord): NeutralDocument["buyer"] {
  const tin = source.tax_reg_no || source.gst_no || source.buyer_tin;
  if (!tin) return null;
  return {
    buyerRegisterName: String(source.company_name || source.customer_name || ""),
    buyerTIN: String(tin).slice(0, 10),
  };
}

function payments(source: ZohoRecord, mappings: ZohoMappings, total: ReturnType<typeof money>, paid: ReturnType<typeof money>, balance: ReturnType<typeof money>) {
  const rows: NeutralDocument["payments"] = [];
  if (!paid.isZero()) {
    const mode = String(source.payment_mode || "cash");
    rows.push({ moneyTypeCode: mappings.payments[mode.toLowerCase()] || mappings.payments[mode] || "Cash", amount: paid.toFixed(2) });
  }
  if (!balance.isZero() || rows.length === 0) {
    rows.push({ moneyTypeCode: "Credit", amount: (balance.isZero() ? total : balance).toFixed(2) });
  }
  return rows;
}

async function form(url: string, fields: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json()) as ZohoRecord;
  if (!response.ok || payload.error) throw new ZohoError(String(payload.error || `Zoho HTTP ${response.status}`));
  return payload;
}

async function getJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, signal: AbortSignal.timeout(30_000) });
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ZohoError("Zoho returned an invalid response");
  const payload = raw as ZohoRecord;
  if (!response.ok) throw new ZohoError(String(payload.message || `Zoho HTTP ${response.status}`));
  if (payload.code !== undefined && Number(payload.code) !== 0) {
    throw new ZohoError(String(payload.message || `Zoho API error ${payload.code}`));
  }
  return payload;
}
