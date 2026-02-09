<template>
  <div>
    <CenterMain>
      <h1 class="mb-2 text-2xl text-center font-bold sm:mt-5 text-[#0F3F5E]">
        New {{ credentialCount === 1 ? "Credential" : "Credentials" }}
      </h1>
      <p class="text-center text-sm text-[#627D98] mb-6">
        Review the credential(s) offered before accepting.
      </p>
      <LoadingIndicator v-if="immediateAccept" class="my-6 mb-12 w-full">
        Receiving {{ credentialCount }}
        credential(s)...
      </LoadingIndicator>

      <div v-if="failed">
        <div class="my-6 text-center">
          <h2 class="text-xl font-bold text-[#0F3F5E]">Failed to receive credential</h2>
          <p class="text-red-500">{{ failMessage }}</p>
        </div>
      </div>

      <div>
        <div class="my-10">
          <!-- If arrived via deeplink or view=detail, show the detailed floating card instead of compact list card -->
          <div v-if="query.view === 'detail' || immediateAccept" class="w-full flex justify-center mb-6">
            <div class="w-full max-w-2xl px-4">
              <VerifiableCredentialCard :credential="{
                parsedDocument: {
                  type: [credentialTypes[index]],
                  issuer: { name: issuerHost }
                }
              }" :isDetailView="true" />
            </div>
          </div>
          <div
            v-if="mobileView"
            v-for="(group, index) in groupedCredentialTypes.keys()"
            :key="group.id"
          >
            <div
              v-for="credential in groupedCredentialTypes.get(group)"
              :key="credential"
              :class="{ 'mt-[-85px]': index !== 0 }"
              class="col-span-1 divide-y divide-gray-200 rounded-2xl shadow transform hover:scale-105 cursor-pointer duration-200 w-full sm:w-[400px]"
            >
              <VerifiableCredentialCard
                :credential="{
                  parsedDocument: {
                    type: [credential.name],
                    issuer: {
                      name: issuerHost,
                    },
                  },
                }"
              />
            </div>
          </div>
          <div class="w-full flex justify-center gap-5" v-else>
            <button
              v-if="credentialCount > 1"
              @click="index--"
              class="mt-4 text-[#0F3F5E] font-bold bg-white"
              :disabled="index === 0"
              :class="{ 'cursor-not-allowed opacity-50': index === 0 }"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <VerifiableCredentialCard
              :key="index"
              :credential="{
                parsedDocument: {
                  type: [credentialTypes[index]],
                  issuer: {
                    name: issuerHost,
                  },
                },
              }"
              class="sm:w-[400px]"
            />
            <button
              v-if="credentialCount > 1"
              @click="index++"
              class="mt-4 text-[#0F3F5E] font-bold bg-white"
              :disabled="index === credentialCount - 1"
              :class="{
                'cursor-not-allowed opacity-50': index === credentialCount - 1,
              }"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
          <div v-if="!mobileView" class="text-center text-[#627D98] mt-2">
            {{ index + 1 }} of {{ credentialCount }}
          </div>
        </div>
        <div class="sm:w-[80%] md:w-[60%] mx-auto">
          <div class="text-sm font-semibold text-[#0F3F5E]">Credential Offered</div>
          <hr class="my-2 border-[#D0E6F3]" />
          <div
            v-for="(group, index) in groupedCredentialTypes.keys()"
            :key="group.id"
          >
            <div
              v-for="credential in groupedCredentialTypes.get(group)"
              :key="credential"
            >
              <div class="text-[#0F3F5E] font-medium">{{ credential.name }}</div>
              <div v-if="issuerHost" class="text-sm text-[#627D98]">
                from {{ issuerHost }}
              </div>
              <hr class="my-2 border-[#E4E7EB]" />
            </div>
          </div>
        </div>
      </div>
    </CenterMain>
    <div v-if="!failed" class="w-full sm:max-w-2xl sm:mx-auto">
      <div
        class="fixed sm:relative bottom-0 w-full p-4 bg-white/95 border-t border-[#E4E7EB] shadow-md sm:shadow-none sm:flex sm:justify-end sm:gap-4"
      >
        <button
          @click="acceptCredential"
          class="w-full sm:w-44 py-3 mt-4 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
          style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
        >
          {{ saveButtonText }}
        </button>
        <button
          @click="navigateTo(`/wallet/${walletId}`)"
          class="w-full sm:w-44 py-3 mt-4 bg-white sm:border sm:border-[#CBD2D9] sm:rounded-xl text-[#0F3F5E] hover:bg-[#F0F4F8]"
        >
          Not Now
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {ref, computed} from "vue";
import {useTitle} from "@vueuse/core";
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue";
import VerifiableCredentialCard from "@credentis-web-wallet/components/credentials/VerifiableCredentialCard.vue";
import {useIssuance} from "@credentis-web-wallet/composables/issuance.ts";

const query = useRoute().query;
const immediateAccept = ref(false);

const index = ref(0);
const route = useRoute();
const walletId = route.params.wallet;
const mobileView = ref(window.innerWidth < 650);

const {
  acceptCredential,
  failed,
  failMessage,
  credentialTypes,
  issuerHost,
  credentialCount,
  groupedCredentialTypes,
} = await useIssuance(query);

// Fastlane UX: Dynamic save button based on credential type
const saveButtonText = computed(() => {
  if (!credentialTypes.value || credentialTypes.value.length === 0) return 'Save';
  const type = credentialTypes.value[0]?.toLowerCase() || '';
  if (type.includes('receipt')) return 'Save Receipt';
  if (type.includes('invoice')) return 'Save Invoice';
  if (type.includes('quote')) return 'Save Quote';
  return 'Save';
});

if (query.accept) {
  immediateAccept.value = true;
  acceptCredential();
}

useTitle(`Save to Wallet - Credentis`);
definePageMeta({
  layout: window.innerWidth > 650 ? "desktop-without-sidebar" : false,
});
</script>
