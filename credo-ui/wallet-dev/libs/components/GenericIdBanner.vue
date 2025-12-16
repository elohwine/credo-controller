<template>
  <div
    v-if="show"
    class="relative rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-lg p-6 mb-6"
  >
    <!-- Close button -->
    <button
      @click="dismiss"
      class="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
      aria-label="Dismiss"
    >
      <svg
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>

    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div
        class="flex-shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-[#0573F0] to-[#03449E] flex items-center justify-center shadow-md"
      >
        <svg
          class="h-7 w-7 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <!-- Content -->
      <div class="flex-1 pt-1">
        <h3 class="text-lg font-bold text-gray-900 mb-2">
          🎉 Welcome! Your GenericID Credential is Ready
        </h3>
        <p class="text-sm text-gray-700 mb-4">
          We've issued you a GenericID credential during registration. This
          credential contains your verified identity information and can be used
          to prove your identity across the platform.
        </p>

        <div class="flex flex-col sm:flex-row gap-3">
          <NuxtLink :to="`/wallet/${walletId}/credentials`">
            <button
              class="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#0573F0] to-[#03449E] rounded-xl shadow-md hover:shadow-lg hover:scale-105 transform transition-all duration-200"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View Your Credential
            </button>
          </NuxtLink>

          <button
            @click="dismiss"
            class="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl shadow-sm hover:bg-gray-50 hover:shadow-md transform transition-all duration-200"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const props = defineProps({
  walletId: {
    type: String,
    required: true,
  },
  credentialId: {
    type: String,
    default: null,
  },
});

const show = ref(false);
const DISMISS_KEY = "genericid-banner-dismissed";

onMounted(() => {
  // Check if user has dismissed the banner before
  const dismissed = localStorage.getItem(`${DISMISS_KEY}-${props.walletId}`);
  
  // Show banner if not dismissed and credential exists
  if (!dismissed && props.credentialId) {
    show.value = true;
  }
});

function dismiss() {
  show.value = false;
  // Remember that user dismissed this
  localStorage.setItem(`${DISMISS_KEY}-${props.walletId}`, "true");
}
</script>

<style scoped>
/* Subtle animation on mount */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

div[v-if] {
  animation: slideIn 0.3s ease-out;
}
</style>
