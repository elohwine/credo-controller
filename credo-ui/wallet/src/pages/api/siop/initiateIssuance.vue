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

const queryRequest = new URL("http://example.invalid" + useRoute().fullPath)
  .search; // new URL(window.location.href).search
console.log("queryRequest: ", queryRequest);

// Check if query params contain credential_offer_uri
const searchParams = new URLSearchParams(queryRequest);
const hasOfferUri = searchParams.has('credential_offer_uri') || searchParams.has('?credential_offer_uri');

// Use openid-credential-offer:// scheme if it's a credential offer, otherwise default to initiate-issuance
const scheme = hasOfferUri ? "openid-credential-offer://" : "openid-initiate-issuance://";
// If the queryRequest starts with ?, strip it to avoid double ? if needed, or just append
const walletRequestUrl = scheme + (queryRequest.startsWith('?') ? queryRequest : '?' + queryRequest);
console.log("walletRequestUrl: ", walletRequestUrl);
const encodedWalletRequestUrl = btoa(walletRequestUrl);
console.log("encodedWalletRequestUrl: ", encodedWalletRequestUrl);

const wallets = (await listWallets())?.value?.wallets;

const walletUrlFunction = (wallet: WalletListingType) =>
  `/wallet/${wallet.id}/exchange/issuance?request=${encodedWalletRequestUrl}`;

if (wallets && wallets.length == 1) {
  const wallet = wallets[0];
  setWallet(wallet.id, undefined);
  navigateTo(walletUrlFunction(wallets[0]));
}

definePageMeta({
  layout: "minimal",
});
</script>
