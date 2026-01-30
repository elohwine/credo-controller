<template>
  <div class="min-h-full">
    <div class="flex flex-1 flex-col min-h-screen">
      <div class="w-full">
        <img
          :src="logoImage"
          alt="Credentis logo"
          class="h-8 w-auto mx-auto mt-5"
        />
      </div>
      <main class="flex-1 pb-8">
        <slot />
      </main>

      <div class="fixed bottom-0 inset-x-0">
        <hr class="border-t border-white/40" aria-hidden="true" />
        <nav
          class="flex justify-between bg-white/70 backdrop-blur-md px-4 py-2"
          aria-label="Bottom navigation"
        >
          <NuxtLink
            v-for="item in navigation"
            :key="item.name"
            :to="item.href"
            class="flex flex-col items-center text-sm text-[#6B7C8F] hover:text-[#2188CA] transition-colors"
          >
            <span v-html="item.icon" class="mt-1"></span>
            <span class="mt-1">{{ item.name }}</span>
          </NuxtLink>
        </nav>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import {useTenant} from "@credentis-web-wallet/composables/tenants.ts";

const tenant = (await useTenant().value) as any;

const logoImage = tenant?.logoImage;
const inWalletLogoImage = tenant?.inWalletLogoImage;

const currentWallet = useCurrentWallet();
const walletBase = computed(() => currentWallet.value ? `/wallet/${currentWallet.value}` : '/');

const homeSVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="w-6 h-6" viewBox="0 0 16 16"><path d="M8.707 1.5a1 1 0 0 0-1.414 0L.646 8.146a.5.5 0 0 0 .708.708L2 8.207V13.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V8.207l.646.647a.5.5 0 0 0 .708-.708L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM13 7.207V13.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V7.207l5-5z"/></svg>';
const buildingLibrarySVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" /></svg>';
const informationCircleSVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" /></svg>';
const cog6ToothSVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>';


const navigation = computed(() => [
  {
    name: "Wallet",
    href: walletBase.value,
    icon: homeSVG,
  },
  {
    name: "Issuers",
    href: currentWallet.value ? `/wallet/${currentWallet.value}/settings/issuers` : '/',
    icon: buildingLibrarySVG,
  },
  {
    name: "Info",
    href: "/help",
    icon: informationCircleSVG,
  },
  {
    name: "Settings",
    href: currentWallet.value ? `/wallet/${currentWallet.value}/settings` : '/settings',
    icon: cog6ToothSVG,
  },
]);
</script>

<style>
.router-link-exact-active {
  color: #2188CA;
}

.pwa-toast {
  position: fixed;
  right: 0;
  bottom: 0;
  margin: 16px;
  padding: 12px;
  border: 1px solid #8885;
  border-radius: 4px;
  z-index: 1;
  text-align: left;
  box-shadow: 3px 4px 5px 0 #8885;
}

.pwa-toast .message {
  margin-bottom: 8px;
}

.pwa-toast button {
  border: 1px solid #8885;
  outline: none;
  margin-right: 5px;
  border-radius: 2px;
  padding: 3px 10px;
}
</style>
