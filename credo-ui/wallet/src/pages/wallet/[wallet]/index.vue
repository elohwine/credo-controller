<template>
  <div class="flex flex-col min-h-screen bg-gray-50/50">
    <!-- Welcome Header -->
    <WalletPageHeader />

    <div class="px-4 pb-20 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
      
      <!-- Pending Offers (if any) -->
      <div v-if="pendingOffers && pendingOffers.length > 0" class="mb-8">
        <h2 class="text-sm font-semibold text-[#627D98] uppercase tracking-wider mb-4 ml-1">Available Credentials</h2>
        <div class="grid grid-cols-1 gap-4">
          <div
            v-for="offer in pendingOffers"
            :key="offer.id"
            class="rounded-xl p-4 shadow-md bg-white border border-blue-100"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-md font-bold text-[#0F3F5E]">{{ offer.credentialType }}</h3>
                <p class="text-sm text-[#627D98]">{{ offer.issuerName }}</p>
              </div>
              <button
                @click="acceptOffer(offer)"
                :disabled="acceptingOfferId === offer.id"
                class="px-4 py-2 text-sm text-white font-medium rounded-lg shadow-sm hover:shadow transition-all"
                style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
              >
                {{ acceptingOfferId === offer.id ? '...' : 'Accept' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Credentials List -->
      <div v-if="credentials && credentials.length > 0">
        <div class="flex items-center justify-between mb-4 ml-1">
            <h2 class="text-sm font-semibold text-[#627D98] uppercase tracking-wider">Credentials</h2>
        </div>
        
        <ul role="list" class="space-y-4">

        <li
          v-for="(credential, index) in credentials"
          :key="credential.id"
          class="transform hover:scale-[1.01] cursor-pointer duration-200"
        >
          <NuxtLink
            :to="
              `/wallet/${walletId}/credentials/` +
              encodeURIComponent(credential.id)
            "
          >
            <VerifiableCredentialCard :credential="credential" :isDetailView="false" />
          </NuxtLink>
        </li>
      </ul>
    </div>

      <LoadingIndicator v-else-if="pending"
        >Loading credentials...</LoadingIndicator
      >

      <div v-else class="h-full flex flex-col items-center justify-center">
        <!-- <h3 class="text-2xl font-bold text-[#01337D]">Wallet is Inactive</h3> -->
        <p class="mt-2 text-md text-[#627D98]">
          You don't have any credentials yet!
        </p>
        <NuxtLink :to="`/wallet/${walletId}/scan`">
          <button
            class="mt-8 px-5 py-2.5 text-white rounded-xl shadow-lg hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2188CA] transition-all"
            style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
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
import WalletPageHeader from "@credentis-web-wallet/components/WalletPageHeader.vue";
import VerifiableCredentialCard from "@credentis-web-wallet/components/credentials/VerifiableCredentialCard.vue";
import GenericIdBanner from "@credentis-web-wallet/components/GenericIdBanner.vue";
import scannerSVG from "~/public/svg/scanner.svg";
import { 
  QrCodeIcon, 
  ArrowDownOnSquareStackIcon, 
  ShoppingCartIcon 
} from "@heroicons/vue/24/outline";
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
  {
    // Prevent duplicate requests when navigating - use 'defer' to wait for pending request
    dedupe: 'defer'
  }
);

const viewMode = ref<'list' | 'grid'>('list');

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
  title: "Wallet dashboard - Credentis",
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
