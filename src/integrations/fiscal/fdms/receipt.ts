import Decimal from "decimal.js";
import { D, formatTaxPercent, money, qty, type Amount } from "../money";
import type { FiscalCounter } from "./canonical";

export class ReceiptError extends Error {}

export type SaleLine = {
  name: string;
  quantity: Decimal.Value;
  price?: Decimal.Value | null;
  total?: Decimal.Value | null;
  taxID: number;
  taxPercent?: Decimal.Value | null;
  taxCode?: string;
  hsCode?: string;
  lineType?: "Sale" | "Discount";
};

export type SaleDocument = {
  invoiceNo: string;
  receiptType: "FiscalInvoice" | "CreditNote" | "DebitNote";
  currency: string;
  taxInclusive: boolean;
  lines: SaleLine[];
  payments: { moneyTypeCode: string; amount: Decimal.Value }[];
  buyer?: { buyerRegisterName: string; buyerTIN: string } | null;
  notes?: string;
  creditDebitNote?: { receiptID: number };
  printForm?: "InvoiceA4" | "Receipt48";
};

const SALE_COUNTER: Record<SaleDocument["receiptType"], [string, string]> = {
  FiscalInvoice: ["SaleByTax", "SaleTaxByTax"],
  CreditNote: ["CreditNoteByTax", "CreditNoteTaxByTax"],
  DebitNote: ["DebitNoteByTax", "DebitNoteTaxByTax"],
};

type BuiltLine = {
  receiptLineType: "Sale" | "Discount";
  receiptLineNo: number;
  receiptLineHSCode?: string;
  receiptLineName: string;
  receiptLinePrice?: Amount;
  receiptLineQuantity: Amount;
  receiptLineTotal: Amount;
  taxCode?: string;
  taxPercent?: Amount;
  taxID: number;
};

export type BuiltReceipt = {
  receiptType: SaleDocument["receiptType"];
  receiptCurrency: string;
  receiptCounter: number;
  receiptGlobalNo: number;
  invoiceNo: string;
  receiptNotes?: string;
  receiptDate: string;
  creditDebitNote?: { receiptID: number };
  receiptLinesTaxInclusive: boolean;
  receiptLines: BuiltLine[];
  receiptTaxes: {
    taxCode?: string;
    taxPercent?: Amount;
    taxID: number;
    taxAmount: Amount;
    salesAmountWithTax: Amount;
  }[];
  receiptPayments: { moneyTypeCode: string; paymentAmount: Amount }[];
  receiptTotal: Amount;
  receiptPrintForm: "InvoiceA4" | "Receipt48";
  buyerData?: { buyerRegisterName: string; buyerTIN: string };
  receiptDeviceSignature?: { hash: string; signature: string };
};

export function buildReceipt(
  document: SaleDocument,
  receiptCounter: number,
  receiptGlobalNo: number,
  receiptDate: string,
): BuiltReceipt {
  if (!document.lines.length) throw new ReceiptError("At least one receipt line is required");
  const lines = document.lines.map((line, index) => buildLine(index + 1, line, document.receiptType));
  const taxes = taxSummary(lines, document.taxInclusive);
  const total = receiptTotal(lines, taxes, document.taxInclusive);
  const payments = paymentRows(document.payments, total);
  checkSigns(document.receiptType, lines, total);
  if ((document.receiptType === "CreditNote" || document.receiptType === "DebitNote") && !document.notes) {
    throw new ReceiptError("Credit and debit notes require receipt notes");
  }
  if ((document.receiptType === "CreditNote" || document.receiptType === "DebitNote") && !document.creditDebitNote) {
    throw new ReceiptError("Credit and debit notes must reference the original fiscal receipt");
  }

  const receipt: BuiltReceipt = {
    receiptType: document.receiptType,
    receiptCurrency: document.currency.toUpperCase(),
    receiptCounter,
    receiptGlobalNo,
    invoiceNo: document.invoiceNo.slice(0, 50),
    receiptDate,
    receiptLinesTaxInclusive: document.taxInclusive,
    receiptLines: lines,
    receiptTaxes: taxes,
    receiptPayments: payments,
    receiptTotal: total,
    receiptPrintForm: document.printForm ?? "InvoiceA4",
  };
  if (document.notes) receipt.receiptNotes = document.notes;
  if (document.creditDebitNote) receipt.creditDebitNote = document.creditDebitNote;
  if (document.buyer) {
    if (!document.buyer.buyerRegisterName || !document.buyer.buyerTIN) {
      throw new ReceiptError("Buyer name and TIN are both required when buyer data is sent");
    }
    receipt.buyerData = document.buyer;
  }
  return receipt;
}

export function applyToCounters(counters: FiscalCounter[], receipt: BuiltReceipt): FiscalCounter[] {
  const found = new Map<string, FiscalCounter>();
  for (const row of counters) found.set(counterKey(row), { ...row });
  const [saleType, taxType] = SALE_COUNTER[receipt.receiptType];
  for (const tax of receipt.receiptTaxes) {
    addTaxCounter(found, saleType, receipt.receiptCurrency, tax, tax.salesAmountWithTax);
    addTaxCounter(found, taxType, receipt.receiptCurrency, tax, tax.taxAmount);
  }
  for (const payment of receipt.receiptPayments) {
    const row: FiscalCounter = {
      fiscalCounterType: "BalanceByMoneyType",
      fiscalCounterCurrency: receipt.receiptCurrency,
      fiscalCounterMoneyType: payment.moneyTypeCode,
      fiscalCounterValue: "0.00",
    };
    const key = counterKey(row);
    const existing = found.get(key) ?? row;
    existing.fiscalCounterValue = money(D(existing.fiscalCounterValue).plus(payment.paymentAmount)).toFixed(2);
    found.set(key, existing);
  }
  return [...found.values()];
}

function addTaxCounter(
  found: Map<string, FiscalCounter>,
  counterType: string,
  currency: string,
  tax: BuiltReceipt["receiptTaxes"][number],
  amount: Amount,
) {
  const row: FiscalCounter = {
    fiscalCounterType: counterType,
    fiscalCounterCurrency: currency,
    fiscalCounterTaxID: tax.taxID,
    fiscalCounterTaxPercent:
      hasPercent(tax.taxPercent) ? formatTaxPercent(tax.taxPercent!) : null,
    fiscalCounterValue: "0.00",
  };
  const key = counterKey(row);
  const existing = found.get(key) ?? row;
  existing.fiscalCounterValue = money(D(existing.fiscalCounterValue).plus(amount)).toFixed(2);
  found.set(key, existing);
}

/** Receipts reloaded from JSON carry tax percents as strings, possibly empty. */
function hasPercent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function counterKey(row: FiscalCounter): string {
  return [
    row.fiscalCounterType,
    row.fiscalCounterCurrency,
    row.fiscalCounterTaxID ?? "",
    row.fiscalCounterMoneyType ?? "",
    row.fiscalCounterTaxPercent ?? "",
  ].join("|");
}

function buildLine(index: number, line: SaleLine, receiptType: SaleDocument["receiptType"]): BuiltLine {
  const quantity = qty(line.quantity);
  if (quantity.lte(0)) throw new ReceiptError(`Line ${index} quantity must be greater than 0`);
  const price = line.price === null || line.price === undefined || line.price === "" ? null : money(line.price);
  const total = line.total === null || line.total === undefined || line.total === "" ? money(price!.times(quantity)) : money(line.total);
  if (price && !total.eq(money(price.times(quantity)))) {
    throw new ReceiptError(`Line ${index} total must equal price times quantity`);
  }
  const built: BuiltLine = {
    receiptLineType: line.lineType ?? "Sale",
    receiptLineNo: index,
    receiptLineName: line.name.slice(0, 200),
    receiptLineQuantity: quantity,
    receiptLineTotal: total,
    taxID: line.taxID,
  };
  if (price) built.receiptLinePrice = price;
  if (line.hsCode) built.receiptLineHSCode = line.hsCode;
  if (line.taxCode) built.taxCode = line.taxCode.slice(0, 3);
  if (line.taxPercent !== null && line.taxPercent !== undefined && line.taxPercent !== "") {
    built.taxPercent = money(line.taxPercent);
  }
  if (receiptType === "CreditNote" && built.receiptLineType === "Sale" && total.gte(0)) {
    throw new ReceiptError("Credit note sale lines must be negative");
  }
  return built;
}

function taxSummary(lines: BuiltLine[], inclusive: boolean): BuiltReceipt["receiptTaxes"] {
  const groups = new Map<string, { taxID: number; taxCode: string; taxPercent?: Amount; base: Amount }>();
  for (const line of lines) {
    const key = `${line.taxID}|${hasPercent(line.taxPercent) ? formatTaxPercent(line.taxPercent!) : ""}|${line.taxCode ?? ""}`;
    const group = groups.get(key) ?? {
      taxID: line.taxID,
      taxCode: line.taxCode ?? "",
      taxPercent: line.taxPercent,
      base: new Decimal(0),
    };
    group.base = money(group.base.plus(line.receiptLineTotal));
    groups.set(key, group);
  }
  const taxes: BuiltReceipt["receiptTaxes"] = [];
  for (const group of groups.values()) {
    const rate = group.taxPercent ? group.taxPercent.div(100) : new Decimal(0);
    let taxAmount = new Decimal(0);
    let salesAmountWithTax = group.base;
    if (rate.gt(0) && inclusive) taxAmount = money(group.base.times(rate).div(rate.plus(1)));
    if (rate.gt(0) && !inclusive) {
      taxAmount = money(group.base.times(rate));
      salesAmountWithTax = money(group.base.plus(taxAmount));
    }
    const row: BuiltReceipt["receiptTaxes"][number] = {
      taxID: group.taxID,
      taxAmount,
      salesAmountWithTax,
    };
    if (group.taxCode) row.taxCode = group.taxCode;
    if (group.taxPercent) row.taxPercent = group.taxPercent;
    taxes.push(row);
  }
  if (!taxes.length) throw new ReceiptError("At least one tax group is required");
  return taxes;
}

function receiptTotal(lines: BuiltLine[], taxes: BuiltReceipt["receiptTaxes"], inclusive: boolean): Amount {
  const lineSum = money(lines.reduce((sum, line) => sum.plus(line.receiptLineTotal), new Decimal(0)));
  const taxSum = money(taxes.reduce((sum, tax) => sum.plus(tax.taxAmount), new Decimal(0)));
  const salesSum = money(taxes.reduce((sum, tax) => sum.plus(tax.salesAmountWithTax), new Decimal(0)));
  const total = inclusive ? lineSum : money(lineSum.plus(taxSum));
  if (!total.eq(salesSum)) throw new ReceiptError("Receipt total does not match the tax summary");
  return total;
}

function paymentRows(payments: SaleDocument["payments"], total: Amount): BuiltReceipt["receiptPayments"] {
  if (!payments.length) throw new ReceiptError("At least one payment is required");
  const built = payments.map((payment) => ({
    moneyTypeCode: payment.moneyTypeCode,
    paymentAmount: money(payment.amount),
  }));
  const paid = money(built.reduce((sum, row) => sum.plus(row.paymentAmount), new Decimal(0)));
  if (!paid.eq(total)) throw new ReceiptError(`Payments ${paid.toFixed(2)} must equal receipt total ${total.toFixed(2)}`);
  return built;
}

function checkSigns(receiptType: SaleDocument["receiptType"], lines: BuiltLine[], total: Amount) {
  if (receiptType === "CreditNote") {
    if (total.gt(0)) throw new ReceiptError("Credit note total must be less than or equal to 0");
    return;
  }
  if (total.lt(0)) throw new ReceiptError("Invoice and debit note totals must be greater than or equal to 0");
  for (const line of lines) {
    if (line.receiptLineType === "Discount" && line.receiptLineTotal.gt(0)) {
      throw new ReceiptError("Discount lines must be negative on an invoice");
    }
  }
}
