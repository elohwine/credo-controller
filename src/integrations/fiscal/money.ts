import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Amount = Decimal;

export function D(value: Decimal.Value | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value);
}

export function money(value: Decimal.Value | null | undefined): Decimal {
  return D(value).toDecimalPlaces(2);
}

export function qty(value: Decimal.Value | null | undefined): Decimal {
  return D(value).toDecimalPlaces(6);
}

export function toCents(value: Decimal.Value): number {
  return money(value).times(100).toDecimalPlaces(0).toNumber();
}

/** FDMS signature form. Omitted percent (exempt) is empty. 15 -> 15.00, 14.5 -> 14.50. */
export function formatTaxPercent(percent: Decimal.Value | null | undefined): string {
  if (percent === null || percent === undefined || percent === "") return "";
  return D(percent).toDecimalPlaces(2).toFixed(2);
}

export function amountText(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2);
}
