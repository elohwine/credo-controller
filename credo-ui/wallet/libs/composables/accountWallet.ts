import { navigateTo, useRoute, useState, useRequestHeaders } from "#imports";
import { useLocalStorage } from "@vueuse/core";
import { watchEffect } from "vue";

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
    try {
        // Use $fetch for synchronous programmatic calls to avoid useFetch/refresh race
        const data = await $fetch<WalletListings>("/wallet-api/accounts/wallets", {
            headers: useRequestHeaders(['cookie']) as any
        });
        return { value: data }; // Return Ref-like object for compatibility with awaited calls
    } catch (error: any) {
        console.error('Failed to list wallets:', error)
        throw error
    }
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
    const storedWallet = useLocalStorage<string | null>("credentis.currentWallet", null);
    const state = useState<string | null>("wallet", () => {
        const currentRoute = useRoute();
        const currentWalletId = (currentRoute.params["wallet"] as string) ?? null;

        if (currentWalletId) {
            storedWallet.value = currentWalletId;
            return currentWalletId;
        }

        if (storedWallet.value) {
            return storedWallet.value;
        }

        if (currentRoute.name != "/") {
            console.log("Error for currentWallet at: ", currentRoute);
        }

        return null;
    });

    const route = useRoute();
    watchEffect(() => {
        const routeWallet = (route.params["wallet"] as string) ?? null;
        if (routeWallet && state.value !== routeWallet) {
            state.value = routeWallet;
            storedWallet.value = routeWallet;
        }
    });

    return state;
}
