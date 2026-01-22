<template>
  <!-- Desktop view -->
  <div class="hidden sm:block p-8">
    <h1 class="text-2xl font-semibold text-left text-[#0F3F5E]">{{ issuer }}</h1>
    <p class="text-left text-sm text-[#627D98]">Select credential to request.</p>
    <ul
      class="relative grid grid-cols-1 gap-y-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 sm:gap-x-4 sm:gap-y-6 mt-8"
    >
      <li
        v-for="credential in issuerCredentials?.credentials.filter(
          (c) => c.format == credentialType,
        )"
        :key="credential.id"
        class="col-span-1 divide-y divide-gray-200 rounded-2xl shadow-lg transform hover:scale-105 hover:shadow-2xl cursor-pointer duration-200"
      >
        <NuxtLink
          :to="
            issuerCredentials?.issuer.uiEndpoint +
            credential.id.split('_')[0] +
            '&callback=' +
            config.public.issuerCallbackUrl
          "
          class="w-full"
        >
          <div
            ref="vcCardDiv"
            class="p-6 rounded-2xl shadow-2xl sm:shadow-lg h-full text-gray-900 border border-white/30"
            style="background: linear-gradient(135deg, #2188CA 0%, #0F3F5E 100%);"
          >
            <div class="mb-8">
              <div class="text-2xl font-bold bold text-white">
                {{
                  credential.id.split("_")[0].length > 20
                    ? credential.id.split("_")[0].substring(0, 20) + "..."
                    : credential.id.split("_")[0]
                }}
              </div>
            </div>

            <div class="sm:mt-18">
              <div
                :class="{ 'text-white/80': issuer, 'text-transparent': !issuer }"
              >
                Issuer
              </div>
              <div
                :class="{ 'text-white': issuer, 'text-transparent': !issuer }"
                class="font-bold"
              >
                {{ issuer ?? "Unknown" }}
              </div>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>

  <!-- Mobile view -->
  <CenterMain class="sm:hidden">
    <h1 class="text-lg font-semibold text-center text-[#0F3F5E]">{{ issuer }}</h1>
    <p class="text-center text-[#627D98]">Select credential to request from issuer.</p>
    <div class="mt-8">
      <ol>
        <li
          v-for="credential in issuerCredentials?.credentials.filter(
            (c) => c.format == credentialType,
          )"
          :key="credential.id"
          class="flex items-center justify-between py-5 rounded-2xl border border-white/30 shadow-lg mt-4 mb-10"
          style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(12px) saturate(180%);"
        >
          <NuxtLink
            :to="
              issuerCredentials?.issuer.uiEndpoint +
              credential.id.split('_')[0] +
              '&callback=' +
              config.public.issuerCallbackUrl
            "
            class="w-full"
          >
            <div class="flex items-start gap-x-3">
              <p class="mx-4 text-base font-semibold leading-6 text-[#0F3F5E]">
                {{ credential.id.split("_")[0] }}
              </p>
            </div>
          </NuxtLink>
        </li>
      </ol>
      <p
        v-if="
          issuerCredentials?.credentials.filter(
            (c) => c.format == credentialType,
          ).length == 0
        "
        class="text-lg font-semibold text-center text-[#627D98]"
      >
        No credentials
      </p>
      <p v-if="error" class="text-[#627D98]">
        Error while trying to use issuer <code class="text-[#0F3F5E]">{{ issuer }}</code
        >:
        <span v-if="error.data" class="text-[#627D98]">{{
          error.data.startsWith("{")
            ? JSON.parse(error.data)?.message
            : error.data
        }}</span>
        <span v-else>{{ error }}</span>
      </p>

      <div v-if="pending" class="flex justify-center">
        <LoadingIndicator>Loading issuer configuration...</LoadingIndicator>
      </div>
    </div>
  </CenterMain>
</template>

<script lang="ts" setup>
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";

interface Credential {
  id: string;
  format: string;
}

interface IssuerCredentials {
  credentials: Credential[];
  issuer: {
    uiEndpoint: string;
  };
}

const config = useRuntimeConfig();
const route = useRoute();

const issuer = route.params.issuer;

const currentWallet = useCurrentWallet();

const {
  pending,
  data: issuerCredentials,
  error,
  refresh,
} = useLazyFetch<IssuerCredentials>(
  `/wallet-api/wallet/${currentWallet.value}/issuers/${issuer}/credentials`,
);
const credentialType = ref<string>("jwt_vc");

definePageMeta({
  layout: window.innerWidth > 1024 ? "desktop" : "mobile",
});
useHead({
  title: `${issuer} - supported credentials`,
});
</script>

<style scoped></style>
