<template>
  <CenterMain class="sm:mt-6 lg:ml-3">
    <h1
      class="text-lg font-semibold text-center sm:text-left sm:font-bold sm:text-3xl text-[#0F3F5E]"
    >
      Issuers
    </h1>
    <p class="text-center sm:text-left text-[#627D98]">
      Select Issuer to request credentials from.
    </p>
    <ol class="mt-8" role="list">
      <li
        v-for="issuer in issuers"
        :key="issuer"
        class="flex items-center justify-between py-4 rounded-2xl border border-white/30 shadow-lg mt-4 hover:shadow-xl transition-all duration-200"
        style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(12px) saturate(180%);"
      >
        <NuxtLink
          :to="`/wallet/${currentWallet}/settings/issuers/${issuer.did}`"
          class="w-[100%]"
        >
          <div class="flex items-start gap-x-3">
            <p class="mx-4 font-bold leading-6 text-[#0F3F5E]">
              {{ issuer.did }}
            </p>
          </div>
          <div class="flex items-start gap-x-3">
            <p class="mx-4 overflow-x-auto leading-6 text-sm text-[#627D98]">
              {{
                issuer.description ||
                "Digital identity & wallet infrastructure provider."
              }}
            </p>
          </div>
          <div class="flex items-center gap-x-2 mt-2 mx-4">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/80 border border-[#D0E6F3] text-[#2188CA]">
              Credentis Verified Issuer
            </span>
          </div>
        </NuxtLink>
      </li>
    </ol>
    <p
      v-if="issuers && issuers.length == 0"
      class="text-lg font-semibold text-center text-[#627D98]"
    >
      No Issuers
    </p>
  </CenterMain>
</template>

<script lang="ts" setup>
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";

const currentWallet = useCurrentWallet();
const issuers = await useLazyFetch(
  `/wallet-api/wallet/${currentWallet.value}/issuers`,
).data;
refreshNuxtData();

definePageMeta({
  layout: window.innerWidth > 650 ? "desktop" : "mobile",
});
useHead({
  title: "Issuers - Credentis",
});
</script>
