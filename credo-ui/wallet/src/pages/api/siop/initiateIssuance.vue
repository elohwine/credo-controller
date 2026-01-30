<template>
  <CenterMain>
    <WalletListing
      v-if="wallets && wallets.length > 1"
      :wallets="wallets"
      :use-url="walletUrlFunction"
    />
    <LoadingIndicator v-else>Loading wallets...</LoadingIndicator>
  </CenterMain>
</template>

<script lang="ts" setup>
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";
import WalletListing from "@credentis-web-wallet/components/wallets/WalletListing.vue";
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue";
import {listWallets, setWallet, type WalletListing as WalletListingType} from "@credentis-web-wallet/composables/accountWallet.ts";

const route = useRoute();

// Extract credential_offer_uri from query
const offerUri = route.query.credential_offer_uri as string;

// Use openid-credential-offer:// scheme if it's a credential offer, otherwise default to initiate-issuance
const scheme = offerUri ? "openid-credential-offer://" : "openid-initiate-issuance://";

// Construct the wallet request URL
const walletRequestUrl = offerUri 
  ? `${scheme}?credential_offer_uri=${encodeURIComponent(offerUri)}`
  : `${scheme}?${new URLSearchParams(route.query as any).toString()}`;

console.log("walletRequestUrl: ", walletRequestUrl);
const encodedWalletRequestUrl = btoa(walletRequestUrl);
console.log("encodedWalletRequestUrl: ", encodedWalletRequestUrl);

const walletsData = await listWallets();
const wallets = walletsData?.value?.wallets;

const walletUrlFunction = (wallet: WalletListingType) =>
  `/wallet/${wallet.id}/exchange/issuance?request=${encodedWalletRequestUrl}`;

if (wallets && wallets.length === 1) {
  const wallet = wallets[0];
  setWallet(wallet.id, undefined);
  navigateTo(walletUrlFunction(wallet));
}

definePageMeta({
  layout: "minimal",
});
</script>
