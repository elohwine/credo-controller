import https from "node:https";
import { receiptSigningString } from "./canonical";
import { sha256Base64 } from "./crypto";
import { dumps } from "./serialize";
import type { BuiltReceipt } from "./receipt";

export const TEST_URL = "https://fdmsapitest.zimra.co.zw";
export const PRODUCTION_URL = "https://fdmsapi.zimra.co.zw";

export class FdmsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }

  get temporary(): boolean {
    return this.status === undefined || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export type DeviceContext = {
  deviceId: number;
  modelName: string;
  modelVersion: string;
  environment: "simulator" | "test" | "production";
  certificatePem?: string | null;
  privateKeyPem?: string | null;
  qrUrl?: string | null;
  taxpayerName?: string;
  taxpayerTin?: string;
};

export class FdmsClient {
  constructor(private readonly device: DeviceContext) {}

  verifyTaxpayer(activationKey: string, serialNo: string) {
    return this.call("POST", `/Public/v1/${this.device.deviceId}/VerifyTaxpayerInformation`, {
      deviceID: this.device.deviceId,
      activationKey,
      deviceSerialNo: serialNo,
    }, false);
  }

  registerDevice(activationKey: string, certificateRequest: string) {
    return this.call("POST", `/Public/v1/${this.device.deviceId}/RegisterDevice`, {
      deviceID: this.device.deviceId,
      activationKey,
      certificateRequest,
    }, false);
  }

  getConfig() {
    return this.call("GET", `/Device/v1/${this.device.deviceId}/GetConfig`, null, true);
  }

  getStatus() {
    return this.call("GET", `/Device/v1/${this.device.deviceId}/GetStatus`, null, true);
  }

  ping() {
    return this.call("POST", `/Device/v1/${this.device.deviceId}/Ping`, null, true);
  }

  issueCertificate(certificateRequest: string) {
    return this.call("POST", `/Device/v1/${this.device.deviceId}/IssueCertificate`, { certificateRequest }, true);
  }

  getServerCertificate() {
    return this.call("GET", "/Public/v1/GetServerCertificate", null, false);
  }

  openDay(fiscalDayOpened: string, fiscalDayNo: number) {
    return this.call("POST", `/Device/v1/${this.device.deviceId}/OpenDay`, {
      deviceID: this.device.deviceId,
      fiscalDayOpened,
      fiscalDayNo,
    }, true);
  }

  submitReceipt(receipt: BuiltReceipt) {
    return this.call("POST", `/Device/v1/${this.device.deviceId}/SubmitReceipt`, {
      deviceID: this.device.deviceId,
      receipt,
    }, true);
  }

  closeDay(payload: Record<string, unknown>) {
    return this.call("POST", `/Device/v1/${this.device.deviceId}/CloseDay`, {
      deviceID: this.device.deviceId,
      ...payload,
    }, true);
  }

  private get baseUrl(): string {
    if (this.device.environment === "test") return TEST_URL;
    if (this.device.environment === "production") return PRODUCTION_URL;
    throw new FdmsError("Simulator devices do not call FDMS");
  }

  private call(method: "GET" | "POST", path: string, body: unknown, authenticated: boolean): Promise<Record<string, unknown>> {
    const payload = body === null ? undefined : dumps(body);
    const headers: Record<string, string> = {
      DeviceModelName: this.device.modelName,
      DeviceModelVersion: this.device.modelVersion,
      Accept: "application/json",
    };
    if (payload) headers["Content-Type"] = "application/json";
    const agent = authenticated
      ? new https.Agent({
          cert: required(this.device.certificatePem, "Device certificate"),
          key: required(this.device.privateKeyPem, "Device private key"),
          rejectUnauthorized: true,
        })
      : undefined;

    return new Promise((resolve, reject) => {
      const request = https.request(
        this.baseUrl + path,
        { method, headers, agent, timeout: 30_000 },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("error", (error) => reject(new FdmsError(`FDMS response interrupted: ${error.message}`)));
          response.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            const status = response.statusCode ?? 0;
            let parsed: Record<string, unknown>;
            try {
              parsed = parseBody(raw);
            } catch (error) {
              reject(new FdmsError(error instanceof Error ? error.message : "Invalid FDMS response", status >= 400 ? status : undefined));
              return;
            }
            if (status >= 200 && status < 300) {
              if (typeof parsed.operationID !== "string" || !parsed.operationID) {
                reject(new FdmsError("FDMS returned a success response without an operation ID"));
                return;
              }
              resolve(parsed);
            } else reject(new FdmsError(problemMessage(parsed, status), status, parsed));
          });
        },
      );
      request.on("timeout", () => {
        request.destroy();
        reject(new FdmsError("FDMS timed out after 30 seconds"));
      });
      request.on("error", (error) => reject(new FdmsError(`FDMS unreachable: ${error.message}`)));
      if (payload) request.write(payload);
      request.end();
    });
  }
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new FdmsError(`${label} is missing. Register the device with FDMS first.`);
  return value;
}

/** FDMS errors are RFC 7807 problem details with an errorCode such as DEV01. */
function problemMessage(problem: Record<string, unknown>, status: number): string {
  const text = String(problem.detail || problem.title || problem.error || `FDMS HTTP ${status}`);
  const code = problem.errorCode ? ` (${problem.errorCode})` : "";
  const operation = problem.operationID ? `. Operation ID ${problem.operationID}` : "";
  return `ZIMRA: ${text}${code}${operation}`;
}

function parseBody(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FdmsError("FDMS returned an invalid JSON response");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new FdmsError("FDMS returned an invalid response object");
  return parsed as Record<string, unknown>;
}

/** Checks the device signature hash against the v7.2 canonical string, then accepts the receipt. */
export function simulateSubmit(deviceId: number, receipt: BuiltReceipt, previousHash: string | null): Record<string, unknown> {
  const canonical = receiptSigningString(deviceId, receipt, previousHash);
  const expected = sha256Base64(canonical);
  if (receipt.receiptDeviceSignature?.hash !== expected) {
    throw new FdmsError("Receipt device signature hash does not match", 422, { errorCode: "RCPT020" });
  }
  const receiptId = deviceId * 1_000_000 + receipt.receiptGlobalNo;
  return {
    operationID: `sim-${receiptId}`,
    receiptID: receiptId,
    serverDate: receipt.receiptDate,
    receiptServerSignature: { hash: expected, signature: "simulator", certificateThumbprint: "simulator" },
    validationErrors: [],
  };
}

export function simulateOpenDay(fiscalDayNo: number) {
  return { operationID: `sim-day-${fiscalDayNo}`, fiscalDayNo };
}

export function simulateCloseDay(fiscalDayNo: number) {
  return { operationID: `sim-close-${fiscalDayNo}`, fiscalDayStatus: "FiscalDayClosed", fiscalDayReconciliationMode: "Manual" };
}

export function simulateConfig(device: DeviceContext) {
  const validTill = new Date();
  validTill.setUTCFullYear(validTill.getUTCFullYear() + 1);
  return {
    operationID: "sim-config",
    taxPayerName: device.taxpayerName ?? "",
    taxPayerTIN: device.taxpayerTin ?? "",
    deviceBranchName: device.taxpayerName ?? "",
    deviceOperatingMode: "Online",
    qrUrl: device.qrUrl || "https://fdmstest.zimra.co.zw",
    taxPayerDayMaxHrs: 24,
    taxpayerDayEndNotificationHrs: 2,
    certificateValidTill: validTill.toISOString().slice(0, 10),
    applicableTaxes: [
      { taxID: 1, taxPercent: 15.5, taxName: "Standard rated 15.5%", taxValidFrom: "2024-01-01" },
      { taxID: 3, taxPercent: 0, taxName: "Zero rated", taxValidFrom: "2024-01-01" },
      { taxID: 2, taxName: "Exempt", taxValidFrom: "2024-01-01" },
    ],
  };
}
