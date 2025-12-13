import { navigateTo, useFetch, useRoute, useState, useCookie } from "nuxt/app";
// @ts-expect-error - Nuxt auto-imports useAuth from @sidebase/nuxt-auth
import { useAuth } from "#imports";

export type WalletListing = {
    id: string,
    name: string
    createdOn: string
    addedOn: string
    permission: string
}

export type WalletListings = {
    account: string,
    wallets: WalletListing[]
}

export async function listWallets() {
    // Read the auth token from the cookie set by @sidebase/nuxt-auth
    // The cookie name is 'auth.token' as configured in nuxt.config.ts
    const tokenCookie = useCookie('auth.token')

    const { data, refresh } = useFetch<WalletListings>("/wallet-api/accounts/wallets", {
        headers: {
            // Include the Bearer token from the cookie
            Authorization: tokenCookie.value ? `Bearer ${tokenCookie.value}` : ''
        }
    });
    await refresh()
    return data;
}

export function setWallet(
    newWallet: string | null,
    redirectUri: ((walletId: string) => string) | undefined = (walletId) => `/wallet/${walletId}`
) {
    useCurrentWallet().value = newWallet;

    if (newWallet != null && redirectUri != undefined)
        navigateTo(redirectUri(newWallet));
}

export function useCurrentWallet() {
    return useState<string | null>("wallet", () => {
        const currentRoute = useRoute();
        const currentWalletId = currentRoute.params["wallet"] as string ?? null;

        if (currentWalletId == null && currentRoute.name != "/") {
            console.log("Error for currentWallet at: ", currentRoute);
            return null
        } else {
            console.log("Returning: " + currentWalletId + ", at: " + currentRoute.fullPath);
            return currentWalletId;
        }
    });
}
