/** Africa/Harare local timestamps without a timezone suffix, as FDMS requires. */

function parts(date: Date) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => formatted.find((part) => part.type === type)?.value ?? "00";
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

export function harareStamp(date = new Date()): string {
  const value = parts(date);
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`;
}

export function harareDate(date = new Date()): string {
  return harareStamp(date).slice(0, 10);
}

export function receiptStamp(zohoDate: string | undefined, lastReceiptDate: string | null, fiscalDayOpenedAt?: string | null): string {
  const now = harareStamp();
  let candidate = zohoDate ? `${zohoDate}T${now.slice(11)}` : now;
  if (lastReceiptDate && candidate <= lastReceiptDate) candidate = addSeconds(lastReceiptDate, 1);
  if (fiscalDayOpenedAt && candidate <= fiscalDayOpenedAt) candidate = addSeconds(fiscalDayOpenedAt, 1);
  return candidate;
}

export function addSeconds(stamp: string, seconds: number): string {
  const [date, time] = stamp.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second + seconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
}
