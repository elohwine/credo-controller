<template>
  <div class="min-h-screen bg-gray-50/50">
    <CenterMain>
      <div v-if="pending" class="flex justify-center items-center h-screen">
        <LoadingIndicator>Loading credential...</LoadingIndicator>
      </div>
      <div v-else class="w-full max-w-4xl mx-auto py-8 px-4">
        
        <!-- Navigation Header (Mobile only) -->
        <div class="flex justify-between items-center sm:hidden mb-6">
          <button @click="goBack" class="p-2 bg-white rounded-full shadow-sm text-[#0F3F5E]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <span class="font-bold text-[#0F3F5E]">Credential Details</span>
          <div class="w-10"></div>
        </div>

        <!-- Integrated Premium VC Card (Matches Mock Style) -->
        <div v-if="credential" class="bg-white rounded-[32px] shadow-2xl overflow-hidden mb-8 border border-gray-100 flex flex-col">
            <!-- Header Section (Inside Card) -->
            <div class="bg-gradient-to-br from-[#0F3F5E] to-[#2188CA] p-8 sm:p-10 text-white relative">
                 <div class="flex items-start justify-between">
                     <div class="flex-1">
                         <div class="mb-4 w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-lg">
                            <img v-if="issuerLogo" :src="issuerLogo" class="w-9 h-9 object-contain" />
                            <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.499 5.24 50.552 50.552 0 01-17.16 2.334z" />
                            </svg>
                         </div>
                         <h1 class="text-xl font-black tracking-widest uppercase mb-1">{{ credentialTitle }}</h1>
                         <p class="text-blue-100 text-sm opacity-80 font-medium">{{ issuerName || 'Credentis Verified Issuer' }}</p>
                     </div>
                     <!-- Verified Badge -->
                     <div class="flex flex-col items-end gap-2">
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-white/20 border border-white/40 uppercase tracking-tighter">
                            <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
                            Verified
                        </span>
                     </div>
                 </div>
            </div>

            <!-- Body Section (Inside Card) -->
            <div class="p-8 sm:p-10 bg-white">
                <div class="space-y-6">
                    <div v-for="(field, index) in displayFields" :key="index">
                        <div class="flex flex-col sm:flex-row sm:justify-between items-start gap-1">
                            <p class="text-xs font-bold text-[#627D98] uppercase tracking-widest">{{ field.label }}</p>
                            <p class="text-[17px] font-bold text-[#0F3F5E] break-words">{{ field.value }}</p>
                        </div>
                        <hr v-if="index < displayFields.length - 1" class="border-gray-50 mt-4" />
                    </div>
                </div>

                <div class="mt-12 pt-6 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-300 font-mono">
                    <span>ID: {{ credentialId }}</span>
                    <button @click="showRaw = !showRaw" class="text-blue-400 hover:underline">RAW DATA</button>
                </div>

                <div v-if="showRaw" class="mt-4 p-4 bg-gray-50 rounded-xl overflow-auto text-[10px] border border-gray-100 max-h-40">
                    <pre>{{ jwtJson }}</pre>
                </div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-3 px-2">
            <button
              @click="goToScan"
              class="w-full py-5 text-white font-black rounded-2xl shadow-xl hover:shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg uppercase tracking-wider"
              style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
            >
              Present Credential
            </button>
            
            <div class="grid grid-cols-2 gap-3">
                <button
                  @click="exportPdf"
                  class="py-4 bg-white border border-gray-100 text-[#0F3F5E] font-bold rounded-2xl shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-[#2188CA]">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                  Export PDF
                </button>
                <button
                  @click="deleteCredential"
                  class="py-4 bg-white text-red-500 font-bold rounded-2xl border border-red-50 hover:bg-red-50 transition-all text-sm uppercase tracking-widest"
                >
                  Remove
                </button>
            </div>
        </div>
      </div>
    </CenterMain>
  </div>
</template>

<script lang="ts" setup>
import { useCredential, type WalletCredential } from "../../../../../libs/composables/credential.ts";
import LoadingIndicator from "../../../../../libs/components/loading/LoadingIndicator.vue";
import { useCurrentWallet } from "../../../../../libs/composables/accountWallet.ts";
import CenterMain from "../../../../../libs/components/CenterMain.vue";
import { ref, computed } from "vue";
import { getCredentialTemplate } from "../../../../../libs/credentials/templates.ts";

const route = useRoute();
const walletId = route.params.wallet as string;
const credentialId = route.params.credentialId as string;
const currentWallet = useCurrentWallet();

const showRaw = ref(false);

const {
  data: credential,
  pending,
  error,
} = await useFetch<WalletCredential>(
  `/wallet-api/wallet/${currentWallet.value}/credentials/${encodeURIComponent(credentialId)}`,
);

const {
  jwtJson,
  issuerName,
  issuerLogo,
  titleTitelized,
} = useCredential(credential);

const template = computed(() => {
    if (!jwtJson.value) return null;
    return getCredentialTemplate(jwtJson.value);
});

const credentialTitle = computed(() => {
    const kind = template.value?.kind || 'generic';
    if (kind === 'generic') return titleTitelized.value || 'Credential';
    return `${kind} Credential`;
});

const displayFields = computed(() => {
    const vc = jwtJson.value;
    if (!vc) return [];

    // 1. Prefer template fields if available
    if (template.value?.fields && template.value.fields.length > 0) {
        return template.value.fields;
    }

    // 2. Multi-path subject extraction (matching VerifiableCredentialCard logic)
    let subject =
        vc?.credentialSubject ??
        vc?._credential?.credentialSubject ??
        vc?.credential?.credentialSubject ??
        vc?.vc?.credentialSubject ??
        vc?.payload?.additionalClaims?.vc?.credentialSubject ??
        vc?.additionalClaims?.vc?.credentialSubject ??
        vc?.claims ??
        {};

    // Merge nested claims if present
    if (subject?.claims && typeof subject.claims === 'object') {
        subject = { ...subject, ...subject.claims };
    }

    // If still empty, check for claim-like properties directly on vc (excluding metadata)
    const subjectKeys = Object.keys(subject).filter((k) => k !== 'id' && k !== 'claims' && !k.startsWith('@'));
    if (subjectKeys.length === 0) {
        const potentialClaims: Record<string, any> = {};
        const skipKeys = [
            '@context', 'type', 'id', 'issuer', 'issuanceDate', 'expirationDate',
            'credentialSubject', 'proof', 'issuerId', 'credentialSubjectIds',
            '_credential', 'credential', 'vc', 'jwt', 'payload'
        ];
        for (const [key, value] of Object.entries(vc)) {
            if (!skipKeys.includes(key) && value != null && typeof value !== 'object') {
                potentialClaims[key] = value;
            }
        }
        if (Object.keys(potentialClaims).length > 0) subject = potentialClaims;
    }
                    
     const excludeKeys = ['id', 'claims', 'type', '@context', 'proof', 'photo', 'image', 'credentialSubject'];
     const fields = [];
     
     for (const [key, value] of Object.entries(subject)) {
        if (excludeKeys.includes(key) || key.startsWith('@')) continue;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue; 
        
        const label = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .trim()
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
            
        fields.push({
            label: label,
            value: Array.isArray(value) ? value.join(', ') : String(value)
        });
     }
     
     return fields;
});

async function deleteCredential() {
  if(!confirm('Are you sure you want to delete this credential?')) return;
  await $fetch(
    `/wallet-api/wallet/${currentWallet.value}/credentials/${encodeURIComponent(credentialId)}?permanent=true`,
    { method: "DELETE" },
  );
  await navigateTo({ path: `/wallet/${currentWallet.value}` });
}

function exportPdf() {
  window.print();
}

function goBack() {
  navigateTo({ path: `/wallet/${walletId}` });
}

function goToScan() {
  navigateTo({ path: `/wallet/${walletId}/scan` });
}

useHead({ title: `${credentialTitle.value} - Credentis` });
definePageMeta({ layout: "default" });
</script>
