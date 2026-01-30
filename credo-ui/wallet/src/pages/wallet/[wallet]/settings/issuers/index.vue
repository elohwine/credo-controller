<template>
  <div class="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-bold text-[#0F3F5E]">
            Credential Issuers
            <span v-if="issuers" class="ml-2 inline-flex items-center justify-center bg-[#2188CA] text-white text-xs font-bold rounded-full h-6 w-6">
                {{ issuers.length }}
            </span>
        </h1>
        <button class="p-2 rounded-lg border border-[#E4E7EB] text-[#2188CA] hover:bg-blue-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        </button>
    </div>

    <!-- Search Bar -->
    <div class="relative mb-6">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-[#9AA5B1]">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
        </div>
        <input
            type="text"
            v-model="searchQuery"
            class="block w-full pl-10 pr-3 py-3 border border-[#E4E7EB] rounded-xl leading-5 bg-white placeholder-[#9AA5B1] focus:outline-none focus:ring-1 focus:ring-[#2188CA] focus:border-[#2188CA] sm:text-sm shadow-sm"
            placeholder="Search Credential Issuers"
        />
    </div>

    <!-- List -->
    <ul role="list" class="space-y-4">
      <li
        v-for="issuer in filteredIssuers"
        :key="issuer.did"
        class="group relative bg-white border border-[#E4E7EB] rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-[#2188CA]/30 transition-all cursor-pointer"
      >
        <NuxtLink
          :to="`/wallet/${currentWallet}/settings/issuers/${issuer.did}`"
          class="flex items-start gap-4"
        >
          <!-- Logo Placeholder -->
          <div class="flex-shrink-0">
               <div class="h-12 w-12 rounded-full border border-gray-100 bg-white flex items-center justify-center p-1">
                   <!-- Logic for logo if available, else generic -->
                   <img v-if="issuer.logo" :src="issuer.logo" class="h-full w-full object-contain rounded-full" />
                   <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 text-[#2188CA]">
                      <path fill-rule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.255ZM9.75 9a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 1 9.75 9Z" clip-rule="evenodd" />
                    </svg>
               </div>
          </div>
          
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-bold text-[#0F3F5E] truncate">
                {{ issuer.name || issuer.did }}
            </h3>
            <span class="inline-flex items-center rounded-md bg-[#F0F4F8] px-2 py-1 text-xs font-medium text-[#627D98] ring-1 ring-inset ring-gray-500/10 mt-1">
                Credentis Verified Issuer
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <p
      v-if="filteredIssuers.length === 0"
      class="text-center text-[#627D98] mt-8"
    >
      No issuers found.
    </p>
  </div>
</template>

<script lang="ts" setup>
import { useCurrentWallet } from "@credentis-web-wallet/composables/accountWallet.ts";
import { ref, computed } from "vue";

const currentWallet = useCurrentWallet();
const { data: issuers } = await useLazyFetch(
  `/wallet-api/wallet/${currentWallet.value}/issuers`,
);

const searchQuery = ref("");

const filteredIssuers = computed(() => {
    if (!issuers.value) return [];
    if (!searchQuery.value) return issuers.value;
    
    const lowerQuery = searchQuery.value.toLowerCase();
    return issuers.value.filter((issuer: any) => 
        (issuer.name && issuer.name.toLowerCase().includes(lowerQuery)) ||
        (issuer.did && issuer.did.toLowerCase().includes(lowerQuery)) ||
        (issuer.description && issuer.description.toLowerCase().includes(lowerQuery))
    );
});

definePageMeta({
  layout: "default", 
});
useHead({
  title: "Issuers - Credentis",
});
</script>
