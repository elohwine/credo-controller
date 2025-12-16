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
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue";
import WalletListing from "@credentis-web-wallet/components/wallets/WalletListing.vue";
import {encodeRequest, fixRequest} from "@credentis-web-wallet/composables/siop-requests.ts";
import {listWallets, setWallet, type WalletListing as WalletListingType} from "@credentis-web-wallet/composables/accountWallet.ts";

const queryRequest = new URL("http://example.invalid" + useRoute().fullPath)
  .search; // new URL(window.location.href).search
console.log("queryRequest: ", queryRequest);

let fixedRequest = encodeURI(
  decodeURI(fixRequest("openid://" + window.location.search)),
);
console.log("Fixed request: ", fixedRequest);

const encodedWalletRequestUrl = encodeRequest(fixedRequest);
console.log("Encoded request: ", encodedWalletRequestUrl);

const wallets = (await listWallets())?.value?.wallets;

const walletUrlFunction = (wallet: WalletListingType) =>
  `/wallet/${wallet.id}/exchange/presentation?request=${encodedWalletRequestUrl}`;

if (wallets && wallets.length == 1) {
  const wallet = wallets[0];
  setWallet(wallet.id, undefined);
  navigateTo(walletUrlFunction(wallets[0]));
}
</script>
