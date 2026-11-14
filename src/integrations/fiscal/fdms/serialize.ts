import Decimal from "decimal.js";

/**
 * Emit Decimal values as JSON numbers.
 * Decimal.toJSON runs before a JSON.stringify replacer, so the tree is converted first.
 */
export function dumps(value: unknown): string {
  return JSON.stringify(plain(value));
}

function plain(value: unknown): unknown {
  if (value instanceof Decimal) return Number(value.toFixed());
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}
