<template>
  <div class="min-h-screen bg-gray-50">
    <CenterMain>
      <div class="w-full max-w-5xl mx-auto py-8 px-4">
        
        <!-- Desktop Layout: Uses PresentCredentialHero with slot -->
        <div class="hidden sm:block">
            <PresentCredentialHero>
                <template #action-area>
                    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
                        <toggle
                          class="mb-6"
                          @update:option1-selected="qrCodeDisplay = $event"
                          :option1-selected="true"
                          :options="['Scan Code', 'Offer URL']"
                        />
                        <QrCodeScanner v-if="qrCodeDisplay" @request="startRequest" />
                        <ManualRequestEntry v-else @request="startRequest" />
                    </div>
                </template>
            </PresentCredentialHero>
        </div>

        <!-- Mobile Layout -->
        <div class="sm:hidden flex flex-col min-h-[80vh]">
             <div class="flex items-center justify-between mb-6">
                <button @click="navigateTo({ path: `/wallet/${walletId}` })" class="p-2 bg-white rounded-full shadow-sm text-[#0F3F5E]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                </button>
                <h1 class="text-xl font-bold text-[#0F3F5E]">Scan QR Code</h1>
                <div class="w-10"></div>
             </div>

             <PresentCredentialHero class="mb-6 rounded-2xl shadow-sm" style="padding: 20px;" />

             <div class="flex-1 flex flex-col items-center justify-center bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <toggle
                  class="mb-6 w-full"
                  @update:option1-selected="qrCodeDisplay = $event"
                  :option1-selected="true"
                  :options="['QR Code', 'Manual']"
                />
                <QrCodeScanner v-if="qrCodeDisplay" @request="startRequest" />
                <ManualRequestEntry v-else @request="startRequest" />
             </div>
        </div>

      </div>
    </CenterMain>
  </div>
</template>

<script setup>
import ManualRequestEntry from "~/components/scan/ManualRequestEntry.vue";
import {encodeRequest, fixRequest, getSiopRequestType, SiopRequestType} from "@credentis-web-wallet/composables/siop-requests.ts";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import QrCodeScanner from "~/components/scan/QrCodeScanner.vue";
import toggle from "@credentis-web-wallet/components/toggle.vue";
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";
import PresentCredentialHero from "~/components/PresentCredentialHero.vue"; // Import Hero Component

const route = useRoute();
const walletId = route.params.wallet;
const currentWallet = useCurrentWallet();

const qrCodeDisplay = ref(true);

async function startRequest(request) {
  console.log("Start request:", request);
  request = fixRequest(request);
  const type = getSiopRequestType(request);

  const encoded = encodeRequest(request);
  console.log("Using encoded request:", encoded);

  if (type === SiopRequestType.ISSUANCE) {
    await redirectByOfferType(request, encoded);
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
  return navigateTo({
    path: `/wallet/${currentWallet.value}/exchange/issuance`,
    query: { request: encoded },
  });
}

definePageMeta({
  layout: "default",
});
</script>
