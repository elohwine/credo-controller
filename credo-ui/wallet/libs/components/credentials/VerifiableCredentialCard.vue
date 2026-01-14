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

        <!-- Template-driven Preview Section -->
        <div v-if="templateFields.length > 0" class="mb-4 space-y-1">
            <div v-for="row in templateFields" :key="row.label" class="flex justify-between text-sm">
                <span class="opacity-75">{{ row.label }}:</span>
                <span class="font-medium truncate ml-2 max-w-[180px]">{{ formatValue(row.value) }}</span>
            </div>
        </div>

        <!-- Optional line items table (detail view only) -->
        <div v-if="isDetailView && templateTable" class="mb-4 mt-2">
            <div class="text-xs opacity-75 mb-2">Line items</div>
            <div class="bg-white/10 rounded-xl p-3">
                <div class="grid grid-cols-2 text-xs font-bold opacity-80 mb-2">
                    <div>{{ templateTable.headers[0] }}</div>
                    <div class="text-right">{{ templateTable.headers[1] }}</div>
                </div>
                <div v-for="(r, idx) in templateTable.rows" :key="idx" class="grid grid-cols-2 text-sm py-1">
                    <div class="truncate pr-2">{{ formatValue(r.description) }}</div>
                    <div class="text-right">{{ formatValue(r.amount) }}</div>
                </div>
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
import {getCredentialTemplate} from "../../credentials/templates";
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

const template = computed(() => {
    if (!credential.value) return null;
    return getCredentialTemplate(credential.value);
});

const templateFields = computed(() => {
    const fields = template.value?.fields ?? [];
    if (!isDetailView.value) return fields.slice(0, 5);
    return fields;
});

const templateTable = computed(() => {
    return template.value?.table ?? null;
});

const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
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

