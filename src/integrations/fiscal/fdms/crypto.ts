import { createHash, createSign, createVerify, generateKeyPairSync } from "node:crypto";

export function sha256Base64(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

/** ECDSA P-256 over SHA-256, ASN.1 DER. FDMS rejects raw IEEE P1363 signatures. */
export function signCanonical(privateKeyPem: string, canonical: string): { hash: string; signature: string } {
  const signer = createSign("SHA256");
  signer.update(canonical, "utf8");
  signer.end();
  return {
    hash: sha256Base64(canonical),
    signature: signer.sign(privateKeyPem).toString("base64"),
  };
}

export function deviceCommonName(serialNo: string, deviceId: number): string {
  return `ZIMRA-${serialNo}-${String(deviceId).padStart(10, "0")}`;
}

/**
 * CSR subject CN required by registerDevice.
 * Example from the spec: serial SN0001 and device 42 -> ZIMRA-SN0001-0000000042.
 * node-forge cannot build an ECDSA CSR, so this is a PKCS#10 request signed by Node.
 */
export function generateDeviceIdentity(serialNo: string, deviceId: number): { privateKeyPem: string; csrPem: string } {
  const commonName = deviceCommonName(serialNo, deviceId);
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const info = sequence(
    integer(0),
    sequence(set(sequence(oid("2.5.4.3"), utf8(commonName)))),
    Buffer.isBuffer(spki) ? spki : Buffer.from(spki),
    Buffer.from([0xa0, 0x00]),
  );
  const signature = createSign("SHA256").update(info).end().sign(privateKey);
  if (!createVerify("SHA256").update(info).end().verify(publicKey, signature)) {
    throw new Error("Device CSR signature did not verify");
  }
  const csr = sequence(info, sequence(oid("1.2.840.10045.4.3.2")), bitString(signature));
  const exported = privateKey.export({ type: "pkcs8", format: "pem" });
  return {
    privateKeyPem: typeof exported === "string" ? exported : exported.toString("utf8"),
    csrPem: pem("CERTIFICATE REQUEST", csr),
  };
}

function sequence(...parts: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(parts));
}

function set(value: Buffer): Buffer {
  return tlv(0x31, value);
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function integer(value: number): Buffer {
  if (value === 0) return tlv(0x02, Buffer.from([0]));
  const bytes: number[] = [];
  let current = value;
  while (current > 0) {
    bytes.unshift(current & 0xff);
    current >>= 8;
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, Buffer.from(bytes));
}

function utf8(value: string): Buffer {
  return tlv(0x0c, Buffer.from(value, "utf8"));
}

function bitString(value: Buffer): Buffer {
  return tlv(0x03, Buffer.concat([Buffer.from([0x00]), value]));
}

function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number);
  const body = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const encoded = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    body.push(...encoded);
  }
  return tlv(0x06, Buffer.from(body));
}

function pem(label: string, der: Buffer): string {
  const body = der.toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}
