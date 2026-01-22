<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #D0E6F3 0%, #88C4E3 100%);">
    <CenterMain>
      <div v-if="pending" class="flex justify-center items-center h-screen">
        <LoadingIndicator>Loading credential...</LoadingIndicator>
      </div>
      <div v-else class="w-full max-w-3xl mx-auto py-8 px-4">
        <div class="flex justify-between items-center sm:hidden mb-4">
          <div
            class="cursor-pointer bg-white/80 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-[#0F3F5E] text-xs font-bold shadow-md hover:bg-white transition-all"
            @click="goBack">
            X
          </div>
          <div
            class="cursor-pointer bg-white/80 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-[#0F3F5E] text-xs font-bold shadow-md hover:bg-white transition-all"
            @click="deleteCredential">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash"
              viewBox="0 0 16 16">
              <path
                d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
              <path
                d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
            </svg>
          </div>
        </div>
        <div v-if="credential" class="mb-6">
          <div ref="credentialCardRef">
            <VerifiableCredentialCard :credential="credential" :isDetailView="true" />
          </div>
        </div>

        <div
          v-if="credential"
          class="flex flex-col gap-3 sm:gap-4 w-full mb-10"
        >
        <button
          @click="goToScan"
          class="w-full py-3 text-white rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all"
          style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
        >
          Present credential
        </button>
        <button
          @click="exportPdf"
          class="w-full py-3 bg-white border border-[#E4E7EB] text-[#0F3F5E] rounded-xl shadow-sm hover:bg-[#F8F9FB]"
        >
          Export PDF
        </button>
        <button
          @click="exportImage"
          class="w-full py-3 bg-white border border-[#E4E7EB] text-[#0F3F5E] rounded-xl shadow-sm hover:bg-[#F8F9FB]"
        >
          Export Image
        </button>
        <button
          @click="deleteCredential"
          class="w-full py-3 text-red-600 rounded-xl border border-[#F8D7DA] bg-[#FFF5F5] hover:bg-[#FDECEC]"
        >
          Remove credential
        </button>
        </div>
      </div>

      <!-- Desktop view -->
      <div class="hidden sm:block px-6 py-8 rounded-2xl bg-white border border-[#E4E7EB] shadow-lg">
        <hr v-if="credentialManifest" class="w-full border-[#E4E7EB] my-2" />
        <div v-if="credentialManifest" class="text-[#627D98] font-semibold mt-4 mb-2">
          Subject Info
        </div>
        <img v-if="credentialManifest?.image" :src="credentialManifest?.image" alt="User Avatar"
          class="h-28 mb-4 rounded-md" />
        <div v-for="(value, key, index) in credentialManifest?.claims" :key="key">
          <div class="flex mt-3">
            <div class="text-[#627D98] w-sm">{{ key }}</div>
            <div class="text-[#0F3F5E] font-semibold w-2xl">{{ value }}</div>
          </div>
        </div>

        <div v-if="credential?.format === 'mso_mdoc'">
          <hr class="w-full border-[#E4E7EB] my-2" />
          <div class="text-[#627D98] font-semibold mt-4 mb-8">Subject Info</div>
          <div v-for="elem in jwtJson?.issuerSigned?.nameSpaces[
            Object.keys(jwtJson?.issuerSigned?.nameSpaces)[0]
          ]">
            <div class="flex mt-3">
              <div class="text-[#627D98] w-sm">{{ elem.elementIdentifier }}</div>
              <div class="text-[#0F3F5E] font-semibold w-2xl">
                {{ elem.elementValue }}
              </div>
            </div>
          </div>
        </div>

        <hr class="w-full border-[#E4E7EB] mb-2 mt-8" v-if="issuerName || issuerDid" />
        <div class="text-[#627D98] font-semibold mt-4 mb-8" v-if="issuerName || issuerDid">
          Issuer
        </div>
        <div class="flex mt-2" v-if="issuerName">
          <div class="text-[#627D98] w-sm">Name</div>
          <div class="text-[#0F3F5E] font-semibold w-2xl">{{ issuerName }}</div>
        </div>
        <div class="flex mt-2 mb-8" v-if="issuerDid">
          <div class="text-[#627D98] w-sm">DID</div>
          <div class="text-[#0F3F5E] font-semibold w-2xl overflow-scroll">
            {{ issuerDid }}
          </div>
        </div>
        <hr v-if="disclosures" class="w-full border-[#E4E7EB] mb-2 mt-8" />
        <div v-if="disclosures" class="text-[#627D98] font-semibold mt-4 mb-8">
          Selectively disclosable attributes
        </div>
        <div v-if="disclosures">
          <div v-for="disclosure in disclosures">
            <div class="flex mt-2">
              <div class="text-[#627D98] w-sm">{{ disclosure[1] }}</div>
              <div class="text-[#0F3F5E] font-semibold overflow-scroll w-2xl">
                {{ disclosure[2] }}
              </div>
            </div>
          </div>
        </div>
        <hr class="w-full border-[#E4E7EB] my-2" />
        <div class="flex justify-between my-6">
          <div v-if="expirationDate" class="text-[#627D98]">
            Valid through {{ issuanceDate?.replace(/-/g, ".") }} -
            {{ expirationDate.replace(/-/g, ".") }}
          </div>
          <div v-else class="text-[#627D98]">No expiration date</div>
          <div class="text-[#627D98]" v-if="issuanceDate">
            Issued {{ issuanceDate?.replace(/-/g, ".") }}
          </div>
          <div class="text-[#627D98]" v-else>No issuance date</div>
        </div>
        <div class="flex justify-between my-16">
          <div class="text-[#2188CA] cursor-pointer underline" @click="showCredentialJson = !showCredentialJson">
            {{ showCredentialJson ? "Hide" : "Show" }} Credential JSON
          </div>
          <div class="text-red-500 cursor-pointer underline" @click="deleteCredential">
            Delete Credential
          </div>
        </div>
        <div v-if="showCredentialJson" class="bg-[#F8F9FB] border border-[#E4E7EB] p-4 rounded-xl overflow-auto">
          <pre class="text-xs">{{ jwtJson }}</pre>
        </div>
      </div>

      <!-- Mobile view -->
      <div class="px-4 py-6 rounded-2xl sm:hidden bg-white border border-[#E4E7EB] shadow-lg"
        v-if="credentialManifest || credential?.format === 'mso_mdoc'">
        <div v-if="credentialManifest">
          <img v-if="credentialManifest?.image" :src="credentialManifest?.image" alt="User Avatar"
            class="h-28 mb-4 rounded-md" />
          <div class="text-[#627D98] font-semibold mb-4">Credential Details</div>
          <div v-for="(value, key, index) in credentialManifest?.claims" :key="key">
            <div class="text-[#627D98]">{{ key }}</div>
            <div class="text-[#0F3F5E] font-semibold">{{ value }}</div>
            <hr v-if="index !== Object.keys(credentialManifest?.claims || {}).length - 1"
              class="w-full border-[#E4E7EB] my-2" />
          </div>
        </div>

        <div v-if="credential?.format === 'mso_mdoc'">
          <div class="text-[#627D98] font-semibold mb-4">Credential Details</div>
          <div v-for="(elem, index) in jwtJson?.issuerSigned?.nameSpaces[
            Object.keys(jwtJson?.issuerSigned?.nameSpaces)[0]
          ]">
            <div class="text-[#627D98]">{{ elem.elementIdentifier }}</div>
            <div class="text-[#0F3F5E] font-semibold">{{ elem.elementValue }}</div>
            <hr v-if="
              index !==
              jwtJson?.issuerSigned?.nameSpaces[
                Object.keys(jwtJson?.issuerSigned?.nameSpaces)[0]
              ].length -
              1
            " class="w-full border-[#E4E7EB] my-2" />
          </div>
        </div>
      </div>
    </CenterMain>
  </div>
</template>

<script lang="ts" setup>
import VerifiableCredentialCard from "@credentis-web-wallet/components/credentials/VerifiableCredentialCard.vue";
import {useCredential, type WalletCredential} from "@credentis-web-wallet/composables/credential.ts";
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";
import {JSONPath} from "jsonpath-plus";
import {ref} from "vue";
import html2canvas from "html2canvas";

const route = useRoute();
const runtimeConfig = useRuntimeConfig();

const walletId = route.params.wallet as string;
const credentialId = route.params.credentialId as string;
const currentWallet = useCurrentWallet();

const showCredentialJson = ref(false);
const credentialCardRef = ref<HTMLElement | null>(null);

const {
  data: credential,
  pending,
  refresh,
  error,
} = await useFetch<WalletCredential>(
  `/wallet-api/wallet/${currentWallet.value}/credentials/${encodeURIComponent(credentialId)}`,
);
const {
  jwtJson,
  disclosures,
  issuerName,
  issuerDid,
  issuanceDate,
  expirationDate,
} = useCredential(credential);

const credentialManifest = computedAsync(async () => {
  if (jwtJson.value) {
    const typeArr = Array.isArray(jwtJson.value?.type) ? jwtJson.value?.type : [];
    const typeName = typeArr.length ? typeArr[typeArr.length - 1] : undefined;
    if (!typeName) return null;
    const { data } = await useFetch(
      `${runtimeConfig.public.credentialsRepositoryUrl}/api/manifest/${typeName}`,
      {
        transform: (data: { image?: string; claims: { [key: string]: string } }) => {
          let transformedManifest = JSON.parse(JSON.stringify(data));
          if (data.image) {
            transformedManifest = {
              ...transformedManifest,
              image: JSONPath({ path: data.image, json: jwtJson.value })[0] ??
                disclosures.value?.find(
                  (disclosure) => disclosure[1] === data.image.split(".").pop(),
                )?.[2],
            };
          }
          if (data.claims) {
            transformedManifest = {
              ...transformedManifest,
              claims: Object.fromEntries(
                Object.entries(data?.claims).map(([key, value]) => {
                  return [
                    key,
                    JSONPath({ path: value, json: jwtJson.value })[0] ??
                    disclosures.value?.find(
                      (disclosure) => disclosure[1] === value.split(".").pop(),
                    )?.[2],
                  ];
                }),
              ),
            };
          }
          return transformedManifest;
        },
      },
    );
    return data.value;
  }
  return null;
});

async function deleteCredential() {
  await $fetch(
    `/wallet-api/wallet/${currentWallet.value}/credentials/${encodeURIComponent(credentialId)}?permanent=true`,
    {
      method: "DELETE",
    },
  );
  await navigateTo({ path: `/wallet/${currentWallet.value}` });
}

function exportPdf() {
  window.print();
}

async function exportImage() {
  if (!credentialCardRef.value) return;
  const canvas = await html2canvas(credentialCardRef.value, {
    backgroundColor: null,
    scale: 2,
  });
  const link = document.createElement("a");
  link.download = `credential-${credentialId}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

useHead({ title: "View credential - Credentis" });
definePageMeta({
  layout: false,
});

function goBack() {
  navigateTo({ path: `/wallet/${walletId}` });
}

function goToScan() {
  navigateTo({ path: `/wallet/${walletId}/scan` });
}
</script>
