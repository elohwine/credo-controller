import { formatTaxPercent, toCents, type Amount } from "../money";

export type TaxRow = {
  taxID: number;
  taxCode?: string;
  taxPercent?: Amount | string | number | null;
  taxAmount: Amount | string | number;
  salesAmountWithTax: Amount | string | number;
};

export type ReceiptForSignature = {
  receiptType: string;
  receiptCurrency: string;
  receiptGlobalNo: number;
  receiptDate: string;
  receiptTotal: Amount | string | number;
  receiptTaxes: TaxRow[];
};

const MONEY_TYPE_ORDER: Record<string, number> = {
  Cash: 0,
  Card: 1,
  MobileWallet: 2,
  Coupon: 3,
  Credit: 4,
  BankTransfer: 5,
  Other: 6,
};

const COUNTER_TYPE_ORDER: Record<string, number> = {
  SaleByTax: 0,
  SaleTaxByTax: 1,
  CreditNoteByTax: 2,
  CreditNoteTaxByTax: 3,
  DebitNoteByTax: 4,
  DebitNoteTaxByTax: 5,
  BalanceByMoneyType: 6,
};

export type FiscalCounter = {
  fiscalCounterType: string;
  fiscalCounterCurrency: string;
  fiscalCounterTaxID?: number;
  fiscalCounterTaxPercent?: Amount | string | number | null;
  fiscalCounterMoneyType?: string;
  fiscalCounterValue: Amount | string | number;
};

/**
 * Section 13.2.1. Fields are concatenated with no separator.
 * The first receipt of a fiscal day omits previousReceiptHash.
 */
export function receiptSigningString(deviceId: number, receipt: ReceiptForSignature, previousHash: string | null): string {
  const taxes = [...receipt.receiptTaxes].sort((left, right) => {
    const byId = Number(left.taxID) - Number(right.taxID);
    if (byId !== 0) return byId;
    return (left.taxCode || "").localeCompare(right.taxCode || "");
  });
  const parts = [
    String(deviceId),
    receipt.receiptType.toUpperCase(),
    receipt.receiptCurrency.toUpperCase(),
    String(receipt.receiptGlobalNo),
    receipt.receiptDate,
    String(toCents(receipt.receiptTotal)),
    taxes.map(taxSegment).join(""),
  ];
  if (previousHash) parts.push(previousHash);
  return parts.join("");
}

function taxSegment(tax: TaxRow): string {
  const percent =
    tax.taxPercent === null || tax.taxPercent === undefined || tax.taxPercent === ""
      ? ""
      : formatTaxPercent(tax.taxPercent);
  return `${tax.taxCode || ""}${percent}${toCents(tax.taxAmount)}${toCents(tax.salesAmountWithTax)}`;
}

/** Section 13.3.1. Zero counters are excluded. */
export function fiscalDaySigningString(
  deviceId: number,
  fiscalDayNo: number,
  fiscalDayDate: string,
  counters: FiscalCounter[],
): string {
  const ordered = counters.filter((counter) => toCents(counter.fiscalCounterValue) !== 0).sort(counterSort);
  return `${deviceId}${fiscalDayNo}${fiscalDayDate}${ordered.map(counterSegment).join("")}`;
}

function counterSort(left: FiscalCounter, right: FiscalCounter): number {
  const type = COUNTER_TYPE_ORDER[left.fiscalCounterType] - COUNTER_TYPE_ORDER[right.fiscalCounterType];
  if (type !== 0) return type;
  const currency = left.fiscalCounterCurrency.localeCompare(right.fiscalCounterCurrency);
  if (currency !== 0) return currency;
  const tax = Number(left.fiscalCounterTaxID || 0) - Number(right.fiscalCounterTaxID || 0);
  if (tax !== 0) return tax;
  return (MONEY_TYPE_ORDER[left.fiscalCounterMoneyType || ""] ?? 99) - (MONEY_TYPE_ORDER[right.fiscalCounterMoneyType || ""] ?? 99);
}

function counterSegment(counter: FiscalCounter): string {
  const middle =
    counter.fiscalCounterType === "BalanceByMoneyType"
      ? (counter.fiscalCounterMoneyType || "").toUpperCase()
      : counter.fiscalCounterTaxPercent === null ||
          counter.fiscalCounterTaxPercent === undefined ||
          counter.fiscalCounterTaxPercent === ""
        ? ""
        : formatTaxPercent(counter.fiscalCounterTaxPercent);
  return `${counter.fiscalCounterType.toUpperCase()}${counter.fiscalCounterCurrency.toUpperCase()}${middle}${toCents(counter.fiscalCounterValue)}`;
}
