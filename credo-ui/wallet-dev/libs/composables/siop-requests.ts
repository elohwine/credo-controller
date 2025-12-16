export enum SiopRequestType {
    PRESENTATION,
    ISSUANCE,
}

const siopPrefixMapping: Map<string, SiopRequestType> = new Map([
    ["openid://", SiopRequestType.PRESENTATION],
    ["openid4vp://", SiopRequestType.PRESENTATION],
    ["mdoc-openid4vp://", SiopRequestType.PRESENTATION],
    ["haip://", SiopRequestType.PRESENTATION],
    ["openid-initiate-issuance://", SiopRequestType.ISSUANCE],
    ["openid-credential-offer://", SiopRequestType.ISSUANCE],
    //["openid-vc://", SiopRequestType.ISSUANCE]
]);

export function fixRequest(req: string) {
    return req.replaceAll("\n", "").trim();
}

export function encodeRequest(req: string) {
    return btoa(req).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}

export function decodeRequest(encoded: string) {
    if (!encoded || typeof encoded !== 'string') return encoded
    const req = encoded.trim()

    // If it already looks like a full URL / deep-link / JSON, return as-is
    const looksLikeUrl = req.startsWith('http://') || req.startsWith('https://')
    const looksLikeDeepLink = req.startsWith('openid-') || req.startsWith('openid://') || req.startsWith('openid4vp://') || req.startsWith('openid-initiate-issuance://')
    const looksLikeJson = req.startsWith('{') || req.startsWith('[')
    if (looksLikeUrl || looksLikeDeepLink || looksLikeJson || req.includes('credential_offer_uri') || req.includes('issuanceRequests') || req.includes('presentationRequests')) {
        return req
    }

    // Try to decode as base64url. Be forgiving about padding.
    try {
        let s = req.replace(/-/g, '+').replace(/_/g, '/')
        while (s.length % 4 !== 0) s += '='
        return atob(s)
    } catch (e) {
        // If decoding fails, return original string and log warning (caller should handle)
        // eslint-disable-next-line no-console
        console.warn('[siop] decodeRequest: base64 decode failed, returning original string', e, encoded)
        return req
    }
}

export function isSiopRequest(req: string): boolean {
    return getSiopRequestType(fixRequest(req)) != null;
}

export function getSiopRequestType(req: string): SiopRequestType | null {
    req = fixRequest(req);

    // Check for SIOP prefixes first
    for (let [key, value] of siopPrefixMapping) {
        if (req.startsWith(key)) return value;
    }

    // Check for presentation requests
    if (req.includes("presentationRequests")) { // MS Entra!
        return SiopRequestType.PRESENTATION;
    }

    // Check for issuance requests - be more permissive
    if (req.includes("issuanceRequests") ||
        req.includes("credential_offer_uri") ||
        req.includes("credential_offer") ||
        req.includes("credential_issuer") ||  // JSON credential offer
        req.includes('"credentials"') ||      // JSON credential offer array
        req.includes("'credentials'")) {      // JSON credential offer with single quotes
        return SiopRequestType.ISSUANCE;
    }

    // Accept any HTTP(S) URL as potentially valid (backend will validate)
    if (req.startsWith('http://') || req.startsWith('https://')) {
        return SiopRequestType.ISSUANCE; // Assume issuance for HTTP URLs
    }

    // Try to detect JSON credential offers
    if (req.trim().startsWith('{') || req.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(req);
            // Check if it looks like a credential offer
            if (parsed.credential_issuer || parsed.credentials || parsed.grants) {
                return SiopRequestType.ISSUANCE;
            }
        } catch (e) {
            // Not valid JSON, continue
        }
    }

    return null;
}
