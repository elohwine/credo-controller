import { createHash } from "node:crypto";

/** Section 11. qrUrl / deviceID(10) / ddMMyyyy / receiptGlobalNo(10) / first 16 MD5 hex chars of the device signature. */
export function receiptQrCode(
  qrUrl: string,
  deviceId: number,
  receiptDate: string,
  receiptGlobalNo: number,
  signatureBase64: string,
): string {
  const [date] = receiptDate.split("T");
  const [year, month, day] = date.split("-");
  const signature = Buffer.from(signatureBase64, "base64");
  const qrData = createHash("md5").update(signature).digest("hex").toUpperCase().slice(0, 16);
  return `${qrUrl.replace(/\/$/, "")}/${String(deviceId).padStart(10, "0")}${day}${month}${year}${String(receiptGlobalNo).padStart(10, "0")}${qrData}`;
}
