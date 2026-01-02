<template>
    <div ref="vcCardDiv"
        :class="{ 'p-6 rounded-2xl shadow-2xl sm:shadow-lg h-full text-white': true, 'lg:w-[400px]': isDetailView, 'bg-gradient-to-br from-[#0573F0] to-[#03449E] border-t-white border-t-[0.5px]': isNotExpired, 'bg-[#7B8794]': !isNotExpired }">
        <div class="flex justify-end" v-if="!isNotExpired">
            <div class="text-black bg-[#CBD2D9] px-2 py-1 rounded-full text-xs">Expired</div>
        </div>

        <div class="mb-4">
            <div class="text-2xl font-bold bold">
                {{ !isDetailView ? titleTitelized?.length > 20 ? titleTitelized?.slice(0, 20) + "..." :
                    titleTitelized : titleTitelized }}
            </div>
        </div>

        <!-- Claims Preview Section -->
        <div v-if="displayClaims && Object.keys(displayClaims).length > 0" class="mb-4 space-y-1">
            <div v-for="(value, key) in displayClaims" :key="key" class="flex justify-between text-sm">
                <span class="opacity-75 capitalize">{{ formatClaimKey(key) }}:</span>
                <span class="font-medium truncate ml-2 max-w-[150px]">{{ formatClaimValue(value) }}</span>
            </div>
        </div>

        <div :class="{ 'sm:mt-4': isNotExpired, 'sm:mt-2': !isNotExpired }">
            <div class="flex justify-between items-end gap-2">
                <div>
                    <div :class="{ 'text-[#0573f000]': !issuerName }" class="text-xs opacity-75">Issuer</div>
                    <div :class="{ 'text-[#0573f000]': !issuerName }" class="font-bold text-sm">
                        {{ issuerName ?? 'Unknown' }}
                    </div>
                </div>
                <img v-if="issuerLogo" :src="issuerLogo" alt="Issuer Logo" class="h-6 rounded-full" />
            </div>
        </div>

        <div v-if="showId" class="font-mono mt-3 text-xs opacity-75">ID: {{ credential?.id }}</div>
    </div>
</template>

<script lang="ts" setup>
import {useCredential} from "../../composables/credential.ts";
import {computed, defineProps, ref, watchEffect} from "vue";

const props = defineProps({
    credential: {
        type: Object,
        required: true,
    },
    showId: {
        type: Boolean,
        required: false,
        default: false,
    },
    isDetailView: {
        type: Boolean,
        required: false,
        default: false,
    },
});

const { jwtJson: credential, manifest, titleTitelized, isNotExpired, issuerName, issuerLogo } = useCredential(ref(props.credential as any));
const manifestCard = computed(() => manifest.value?.display?.card ?? manifest.value);
const isDetailView = ref(props.isDetailView ?? false);
const vcCardDiv: any = ref(null);

// Extract claims from credentialSubject for display
const displayClaims = computed(() => {
    if (!credential.value) return {};
    
    const subject = credential.value.credentialSubject || credential.value;
    if (!subject || typeof subject !== 'object') return {};
    
    // Filter out internal/meta fields, show only user-relevant claims
    const skipFields = ['id', 'type', '@context', 'issuer', 'issuanceDate', 'expirationDate', 'proof', 'credentialSubjectIds', 'issuerId'];
    const claims: Record<string, any> = {};
    
    const extractClaims = (obj: any) => {
        for (const [key, value] of Object.entries(obj)) {
            if (skipFields.includes(key) || key.startsWith('@')) continue;
            if (value === null || value === undefined || value === '') continue;
            
            // If we find a nested object, check if it's 'claims' or just recurse to find flat values
            if (typeof value === 'object' && !Array.isArray(value)) {
                extractClaims(value);
                continue;
            }
            
            claims[key] = value;
        }
    };
    
    extractClaims(subject);
    
    // Sort keys and limit to top 5 if in list view
    if (!isDetailView.value) {
        const limitedClaims: Record<string, any> = {};
        Object.keys(claims).slice(0, 5).forEach(k => limitedClaims[k] = claims[k]);
        return limitedClaims;
    }
    
    return claims;
});

// Format claim keys for display (camelCase -> Title Case)
const formatClaimKey = (key: string): string => {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
};

// Format claim values for display
const formatClaimValue = (value: any): string => {
    if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

watchEffect(async () => {
    try {
        if (vcCardDiv.value) {
            if (manifestCard.value) {
                if (manifest.value.backgroundImage) {
                    vcCardDiv.value.style.backgroundImage = `url(${manifest.value.backgroundImage.url})`;
                    vcCardDiv.value.style.backgroundSize = 'cover';
                    vcCardDiv.value.style.backgroundPosition = 'center';
                }
                else if (manifestCard.value.backgroundColor) {
                    vcCardDiv.value.style.background = manifestCard.value.backgroundColor;
                }

                if (manifestCard.value.textColor) {
                    vcCardDiv.value.style.color = manifestCard.value.textColor;
                }
            }
        }
    } catch (_) { }
});
</script>

