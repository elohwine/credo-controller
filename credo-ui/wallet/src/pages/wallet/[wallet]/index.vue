<template>
  <div
    class="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 lg:bg-white lg:bg-opacity-50 sm:h-full sm:p-6"
  >
    <div class="sm:h-full w-full">
      <!-- Pending Offers Section -->
      <div v-if="pendingOffers && pendingOffers.length > 0" class="mb-8">
        <h2 class="text-2xl font-bold text-black mb-4">Available Credentials</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="offer in pendingOffers"
            :key="offer.id"
            class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 shadow-lg border-2 border-blue-200"
          >
            <div class="flex items-start justify-between mb-4">
              <div>
                <h3 class="text-lg font-semibold text-gray-900">{{ offer.credentialType }}</h3>
                <p class="text-sm text-gray-600 mt-1">{{ offer.issuerName }}</p>
              </div>
              <span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                New
              </span>
            </div>
            <button
              @click="acceptOffer(offer)"
              :disabled="acceptingOfferId === offer.id"
              class="w-full mt-4 px-4 py-2 text-white bg-[#01337D] rounded-lg shadow hover:bg-[#002159] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002159] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ acceptingOfferId === offer.id ? 'Accepting...' : 'Accept Credential' }}
            </button>
          </div>
        </div>
      </div>

      <!-- GenericID Banner (shows only once for new users) -->
      <GenericIdBanner
        :walletId="walletId"
        :credentialId="genericIdCredential?.id"
      />

      <div
        v-if="credentials && credentials.length > 0"
        class="sm:flex items-center gap-4 mb-5 hidden"
      >
        <h1 class="text-3xl font-bold text-black">Credentials</h1>
        <NuxtLink :to="`/wallet/${walletId}/scan`">
          <button
            class="rounded-full px-6 py-1 text-white bg-[#01337D] shadow-lg hover:bg-[#002159] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002159]"
          >
            Present
          </button>
        </NuxtLink>
        <NuxtLink :to="`/wallet/${walletId}/scan`">
          <button
            class="rounded-full px-6 py-1 text-white bg-[#01337D] shadow-lg hover:bg-[#002159] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002159]"
          >
            Receive
          </button>
        </NuxtLink>
      </div>
      <ul
        v-if="credentials && credentials.length > 0"
        class="relative grid grid-cols-1 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-4 sm:gap-y-6"
        role="list"
      >
        <li
          v-for="(credential, index) in credentials"
          :key="credential.id"
          :class="{ 'mt-[-85px] sm:mt-0': index !== 0 }"
          class="col-span-1 divide-y divide-gray-200 rounded-2xl bg-white shadow transform hover:scale-105 cursor-pointer duration-200"
        >
          <NuxtLink
            :to="
              `/wallet/${walletId}/credentials/` +
              encodeURIComponent(credential.id)
            "
          >
            <VerifiableCredentialCard :credential="credential" />
          </NuxtLink>
        </li>
      </ul>

      <LoadingIndicator v-else-if="pending"
        >Loading credentials...</LoadingIndicator
      >

      <div v-else class="h-full flex flex-col items-center justify-center">
        <!-- <h3 class="text-2xl font-bold text-[#01337D]">Wallet is Inactive</h3> -->
        <p class="mt-2 text-md text-black">
          You don't have any credentials yet!
        </p>
        <NuxtLink :to="`/wallet/${walletId}/scan`">
          <button
            class="mt-8 px-4 py-2 text-white bg-[#01337D] rounded-lg shadow-lg hover:bg-[#002159] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002159]"
          >
            Receive Credential
          </button>
        </NuxtLink>
      </div>
    </div>
  </div>

  <div
    v-if="credentials && credentials.length > 0"
    class="fixed bottom-20 right-5 sm:hidden"
  >
    <NuxtLink :to="`/wallet/${walletId}/scan`">
      <button
        class="flex items-center justify-center h-14 w-14 rounded-full bg-black text-white shadow-lg hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <img :src="scannerSVG" alt="Scan QR code" class="h-6 w-6" />
      </button>
    </NuxtLink>
  </div>
</template>

<script setup>
import VerifiableCredentialCard from "@credentis-web-wallet/components/credentials/VerifiableCredentialCard.vue";
import GenericIdBanner from "@credentis-web-wallet/components/GenericIdBanner.vue";
import scannerSVG from "~/public/svg/scanner.svg";
import { computed, ref, onMounted, onUnmounted } from "vue";

const route = useRoute();
const walletId = route.params.wallet;

const {
  data: credentials,
  pending,
  refresh,
  error,
} = await useLazyFetch(
  `/wallet-api/wallet/${walletId}/credentials?showDeleted=false&showPending=false`,
);
refreshNuxtData();

// Find the GenericID credential (issued during registration)
const genericIdCredential = computed(() => {
  if (!credentials.value) return null;
  return credentials.value.find((cred) => {
    // Check if credential has GenericID type
    try {
      const doc = typeof cred.document === 'string' ? JSON.parse(cred.document) : cred.document;
      return doc?.vc?.type?.includes('GenericID') || doc?.type?.includes('GenericID');
    } catch {
      return false;
    }
  });
});

// Pending offers polling
const pendingOffers = ref([]);
const acceptingOfferId = ref(null);
let pollingInterval = null;

const fetchPendingOffers = async () => {
  try {
    const response = await $fetch('/wallet-api/credentials/pending-offers', {
      credentials: 'include'
    });
    pendingOffers.value = response.offers || [];
  } catch (err) {
    console.error('Failed to fetch pending offers:', err);
  }
};

const acceptOffer = async (offer) => {
  try {
    acceptingOfferId.value = offer.id;
    await $fetch('/wallet-api/credentials/accept-offer', {
      method: 'POST',
      credentials: 'include',
      body: { offerUri: offer.offerUri }
    });
    
    // Refresh credentials list
    await refresh();
    
    // Remove accepted offer from pending list
    pendingOffers.value = pendingOffers.value.filter(o => o.id !== offer.id);
  } catch (err) {
    console.error('Failed to accept offer:', err);
    alert('Failed to accept credential: ' + err.message);
  } finally {
    acceptingOfferId.value = null;
  }
};

// Poll for offers every 30 seconds
onMounted(() => {
  fetchPendingOffers();
  pollingInterval = setInterval(fetchPendingOffers, 30000);
});

onUnmounted(() => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
});

definePageMeta({
  title: "Wallet dashboard - IdenEx",
  layout: "default",
});
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
