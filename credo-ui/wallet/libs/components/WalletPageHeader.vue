<template>
    <div class="text-center py-10 px-4">
        <div class="flex justify-center mb-6">
            <div class="relative p-2 rounded-full border-[1px] border-[#2188CA]/30">
                 <img alt="Credentis Logo" class="h-24 w-24 object-contain" src="/credentis-logo.png"/>
                 <!-- Orbit rings decoration -->
                 <div class="absolute inset-0 rounded-full border border-[#2188CA]/10 -m-1"></div>
                 <div class="absolute inset-0 rounded-full border border-[#2188CA]/5 -m-2"></div>
            </div>
        </div>
        
        <h1 class="text-3xl font-bold text-[#0F3F5E] mb-2">
            Welcome to the<br/>Credentis Wallet
        </h1>
        
        <p class="text-[#627D98] text-sm font-medium">
            Your trusted credentials
        </p>
    </div>
</template>

<script setup>
import {useNow} from "@vueuse/core";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import {ArrowDownOnSquareStackIcon, QrCodeIcon} from "@heroicons/vue/24/outline";
import PageHeader from "./PageHeader.vue";
import {useUserStore} from "../stores/user.ts";
import {storeToRefs} from "pinia";

const config = useRuntimeConfig();
const userStore = useUserStore();
const {user} = storeToRefs(userStore);

const currentWallet = useCurrentWallet()

const now = useNow();
</script>
