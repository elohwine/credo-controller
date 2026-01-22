<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #D0E6F3 0%, #88C4E3 100%);">
    <div
      class="sm:hidden absolute top-3 left-3 cursor-pointer bg-white/80 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-[#0F3F5E] text-xs font-bold shadow-md hover:bg-white transition-all"
      @click="navigateTo({ path: `/wallet/${walletId}` })"
    >
      X
    </div>
    <div
      class="flex flex-col justify-center items-center sm:justify-start h-[100vh]"
    >
      <div v-if="isMobileView" class="w-full flex flex-col items-center">
        <QrCodeScanner v-if="qrCodeDisplay" @request="startRequest" />
        <ManualRequestEntry v-else @request="startRequest" />
        <toggle
          class="mt-10"
          @update:option1-selected="qrCodeDisplay = $event"
          :options="['QR Code', 'Manual']"
        />
      </div>
      <div v-else class="w-2/3 lg:w-1/3 p-6 rounded-2xl border border-white/30 shadow-2xl" style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(20px) saturate(180%);">
        <h1 class="text-2xl font-bold text-[#0F3F5E]">Present/Receive Credential</h1>
        <p class="text-sm text-[#627D98] mb-4">Paste offer URL or scan code.</p>
        <toggle
          class="mb-3"
          @update:option1-selected="qrCodeDisplay = $event"
          :option1-selected="false"
          :options="['Scan Code', 'Offer URL']"
        />
        <QrCodeScanner v-if="qrCodeDisplay" @request="startRequest" />
        <ManualRequestEntry v-else @request="startRequest" />
      </div>
    </div>
  </div>
</template>

<script setup>
import ManualRequestEntry from "~/components/scan/ManualRequestEntry.vue";
import {encodeRequest, fixRequest, getSiopRequestType, SiopRequestType} from "@credentis-web-wallet/composables/siop-requests.ts";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import QrCodeScanner from "~/components/scan/QrCodeScanner.vue";
import toggle from "@credentis-web-wallet/components/toggle.vue";

const isMobileView = ref(window.innerWidth < 650);

const route = useRoute();
const walletId = route.params.wallet;
const currentWallet = useCurrentWallet();

const qrCodeDisplay = ref(false);

async function startRequest(request) {
  console.log("Start request:", request);
  request = fixRequest(request);
  const type = getSiopRequestType(request);

  const encoded = encodeRequest(request);
  console.log("Using encoded request:", encoded);

  if (type === SiopRequestType.ISSUANCE) {
    await redirectByOfferType(request, encoded); //navigateTo({ path: `/wallet/${currentWallet.value}/exchange/issuance`, query: { request: encoded } });
  } else if (type === SiopRequestType.PRESENTATION) {
    await navigateTo({
      path: `/wallet/${currentWallet.value}/exchange/presentation`,
      query: { request: encoded },
    });
  } else {
    console.error("Unknown SIOP request type");
    await navigateTo({
      path: `/wallet/${currentWallet.value}/exchange/error`,
      query: { message: btoa("Unknown request type") },
    });
  }
}

function redirectByOfferType(offerUrl, encoded) {
  // Robust deeplink detection: support multiple openid-vc forms and include a detail view flag
  try {
    const normalized = String(offerUrl).trim();
    const isOpenIdVc = /openid[-:]?vc/i.test(normalized) || normalized.includes('openid') && normalized.includes('credential');
    if (isOpenIdVc) {
      return navigateTo({
        path: `/wallet/${currentWallet.value}/exchange/entra/issuance`,
        query: { request: encoded, view: 'detail' },
      });
    }
  } catch (e) {
    console.warn('redirectByOfferType detection failed', e);
  }
  // Default issuance flow (show list)
  return navigateTo({
    path: `/wallet/${currentWallet.value}/exchange/issuance`,
    query: { request: encoded },
  });
}

definePageMeta({
  layout: window.innerWidth > 650 ? "desktop-without-sidebar" : false,
});
</script>
<style scoped></style>
