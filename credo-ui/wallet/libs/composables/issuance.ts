import { createError, navigateTo, useLazyAsyncData } from "nuxt/app";
import { useCurrentWallet } from "./accountWallet.ts";
import { decodeRequest } from "./siop-requests.ts";
import { type Ref, ref, watch, nextTick } from "vue";
import { groupBy } from "./groupings.ts";

export async function useIssuance(query: any) {
    const failed = ref(false);
    const failMessage = ref("Unknown error occurred.");
    const currentWallet = useCurrentWallet()
    const { data: dids, pending: pendingDids } = await useLazyAsyncData<Array<{ did: string; default: boolean; }>>(() => $fetch(`/wallet-api/wallet/${currentWallet.value}/dids`));
    const selectedDid: Ref<{ did: string; default: boolean; } | null> = ref(null);

    watch(dids, async (newDids) => {
        await nextTick();
        // newDids may be null; use optional chaining when accessing index 0
        selectedDid.value = newDids?.find((item) => { return item.default == true; }) ?? newDids?.[0] ?? null;
    });



    async function resolveCredentialOffer(request: string) {
        try {
            const response: {
                credential_issuer: string;
                credential_configuration_ids: string[];
                credentials: string[];
            } = await $fetch(`/wallet-api/wallet/${currentWallet.value}/exchange/resolveCredentialOffer`, {
                method: "POST",
                body: { credential_offer_uri: request }
            });
            return response;
        } catch (e: any) {
            failed.value = true;

            // Extract error message from response
            let errorMessage = 'Failed to resolve credential offer';
            const rawData = e.data || e.response?._data;

            if (typeof rawData === 'string') {
                try {
                    const parsed = JSON.parse(rawData);
                    errorMessage = parsed.message || parsed.error || rawData;
                } catch {
                    errorMessage = rawData;
                }
            } else if (typeof rawData === 'object' && rawData !== null) {
                errorMessage = rawData.message || rawData.error || JSON.stringify(rawData);
            } else if (e.message) {
                errorMessage = e.message;
            }

            failMessage.value = errorMessage;
            console.error('[Issuance] Resolve offer failed:', errorMessage);
            throw e;
        }
    }

    let request: string
    try {
        if (!query || !query.request) {
            throw new Error('No request provided')
        }
        request = decodeRequest(query.request as string)
    } catch (err: any) {
        throw createError({ statusCode: 400, statusMessage: `Invalid issuance request: ${err?.message || err}` })
    }
    const credentialOffer = await resolveCredentialOffer(request);
    if (credentialOffer == null) {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid issuance request: No credential_offer",
        });
    }

    const issuer = credentialOffer["credential_issuer"];
    let issuerHost: String;
    try {
        issuerHost = new URL(issuer).host;
    } catch {
        issuerHost = issuer;
    }

    const credential_issuer: {
        credential_configurations_supported: Array<{ types: Array<String>; }>; // Draft13
        credentials_supported?: Array<{ id: string; types: Array<String> }>; // Draft11
    } = await $fetch(`/wallet-api/wallet/${currentWallet.value}/exchange/resolveIssuerOpenIDMetadata?issuer=${issuer}`)


    const credentialList = credentialOffer.credential_configuration_ids
        // Draft13
        ? credentialOffer.credential_configuration_ids.map((id) => credential_issuer.credential_configurations_supported[id])

        // Draft11
        : credentialOffer.credentials.map((id) => {
            return credential_issuer.credentials_supported?.find(
                (credential_supported) => credential_supported.id === id
            );
        }).filter(Boolean);


    let credentialTypes: String[] = [];
    for (let credentialListElement of credentialList) {

        if (typeof credentialListElement["types"] !== 'undefined') {
            const typeList = credentialListElement["types"] as Array<String>;
            const lastType = typeList[typeList.length - 1] as String;
            credentialTypes.push(lastType);
        }

        if (typeof credentialListElement["credential_definition"] !== 'undefined') {
            const typeList = credentialListElement["credential_definition"]["type"] as Array<String>;
            const lastType = typeList[typeList.length - 1] as String;
            credentialTypes.push(lastType);
        }

        if (typeof credentialListElement["vct"] !== 'undefined') {

            const response = await fetch(`/wallet-api/wallet/${currentWallet.value}/exchange/resolveVctUrl?vct=${credentialListElement["vct"]}`);

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`VCT URL returns error: ${response.status}`);
            }

            // Some VCT endpoints (or our proxy) may return plain text (a URL or name) instead of JSON.
            // Try to parse JSON first, otherwise fall back to text and wrap into an object.
            let data: any
            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
                data = await response.json()
            } else {
                const txt = await response.text()
                try {
                    data = JSON.parse(txt)
                } catch {
                    data = { name: txt }
                }
            }

            const nameOrDescription = data.name ?? data.description ?? data.vct ?? null
            credentialTypes.push(nameOrDescription);
        }
    }
    const credentialCount = credentialTypes.length;

    let i = 0;
    const groupedCredentialTypes = groupBy(
        credentialTypes.map((item) => {
            return { id: ++i, name: item };
        }),
        (c: { name: string }) => c.name,
    );


    async function acceptCredential() {
        const did: string | null = selectedDid.value?.did ?? dids.value[0]?.did ?? null;
        if (did === null) { return; }

        try {
            await $fetch(`/wallet-api/wallet/${currentWallet.value}/exchange/useOfferRequest?did=${did}`, {
                method: "POST",
                body: { request: request },
            });
            navigateTo(`/wallet/${currentWallet.value}`);
        } catch (e: any) {
            failed.value = true;

            // Normalize various error shapes: e.data may be a string, an object, or undefined.
            const raw = e?.data ?? e
            let errorMessage: any = raw

            if (typeof raw === 'string') {
                // try to parse JSON if it's a JSON string
                if (raw.trim().startsWith('{')) {
                    try {
                        errorMessage = JSON.parse(raw)
                    } catch (parseErr) {
                        errorMessage = raw
                    }
                } else {
                    errorMessage = raw
                }
            } else if (typeof raw === 'object' && raw !== null) {
                errorMessage = raw
            } else {
                errorMessage = String(raw)
            }

            // Prefer a message property if present
            const finalMessage = (errorMessage && (errorMessage.message || errorMessage.error || errorMessage))

            failMessage.value = typeof finalMessage === 'string' ? finalMessage : JSON.stringify(finalMessage)

            console.error('Error while accepting credential:', e)
            alert('Error occurred while trying to receive credential: ' + failMessage.value)

            throw e;
        }
    }

    return {
        currentWallet,
        dids,
        selectedDid,
        pendingDids,
        acceptCredential,
        failed,
        failMessage,
        credentialTypes,
        credentialCount,
        groupedCredentialTypes,
        issuerHost
    }
}
