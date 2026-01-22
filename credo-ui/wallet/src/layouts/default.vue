<template>
  <div class="min-h-full">
    <ClientOnly>
      <div v-if="$pwa?.needRefresh" class="pwa-toast" role="alert">
        <div class="message">
          New content available, click on reload button to update.
        </div>
        <button @click="$pwa.updateServiceWorker()">Reload</button>
      </div>
      <div
        v-if="
          $pwa?.showInstallPrompt && !$pwa?.offlineReady && !$pwa?.needRefresh
        "
        class="pwa-toast"
        role="alert"
      >
        <div class="message">
          <span> Install PWA </span>
        </div>
        <button @click="$pwa.install()">Install</button>
        <button @click="$pwa.cancelInstall()">Cancel</button>
      </div>
    </ClientOnly>

    <TransitionRoot :show="sidebarOpen" as="template">
      <Dialog
        as="div"
        class="relative z-40 lg:hidden"
        @close="sidebarOpen = false"
      >
        <TransitionChild
          as="template"
          enter="transition-opacity ease-linear duration-300"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="transition-opacity ease-linear duration-300"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div class="fixed inset-0 bg-[#0F3F5E]/60 backdrop-blur-sm" />
        </TransitionChild>

        <div class="fixed inset-0 z-40 flex">
          <TransitionChild
            as="template"
            enter="transition ease-in-out duration-300 transform"
            enter-from="-translate-x-full"
            enter-to="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leave-from="translate-x-0"
            leave-to="-translate-x-full"
          >
            <DialogPanel
              class="relative flex w-full max-w-xs flex-1 flex-col pb-4 pt-5 border-r border-white/20 shadow-2xl"
              style="background: linear-gradient(160deg, rgba(33,136,202,0.92), rgba(15,63,94,0.92)); backdrop-filter: blur(16px) saturate(180%);"
            >
              <TransitionChild
                as="template"
                enter="ease-in-out duration-300"
                enter-from="opacity-0"
                enter-to="opacity-100"
                leave="ease-in-out duration-300"
                leave-from="opacity-100"
                leave-to="opacity-0"
              >
                <div class="absolute right-0 top-0 -mr-12 pt-2">
                  <button
                    class="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                    type="button"
                    @click="sidebarOpen = false"
                  >
                    <span class="sr-only">Close sidebar</span>
                    <XMarkIcon aria-hidden="true" class="h-6 w-6 text-white" />
                  </button>
                </div>
              </TransitionChild>
              <div class="flex flex-shrink-0 items-center px-4">
                <img :src="inWalletLogoImage" alt="" class="h-24 w-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]" />
              </div>

              <nav
                aria-label="Sidebar"
                class="mt-5 h-full flex-shrink-0 divide-y divide-white/10 overflow-y-auto"
              >
                <div class="space-y-1 px-2">
                  <div v-for="navItem in navigation">
                    <NuxtLink
                      v-for="item in navItem.items"
                      :key="item.name"
                      :to="item.href"
                      class="text-[#EAF4FB] hover:bg-white/10 group flex items-center rounded-xl px-3 py-2 text-base font-medium transition-all duration-200 hover:translate-x-0.5"
                    >
                      <component
                        :is="item.icon"
                        aria-hidden="true"
                        class="mr-4 h-6 w-6 flex-shrink-0 text-[#D0E6F3]"
                      />
                      {{ item.name }}
                    </NuxtLink>
                  </div>
                </div>
                <div class="mt-6 pt-6">
                  <div class="space-y-1 px-2">
                    <NuxtLink
                      v-for="item in secondaryNavigation"
                      :key="item.name"
                      :to="item.href"
                      class="group flex items-center rounded-xl px-3 py-2 text-base font-medium text-[#EAF4FB] hover:bg-white/10 transition-all duration-200"
                    >
                      <component
                        :is="item.icon"
                        aria-hidden="true"
                        class="mr-4 h-6 w-6 text-[#D0E6F3]"
                      />
                      {{ item.name }}
                    </NuxtLink>
                  </div>
                  <div
                    class="absolute left-0 right-0 flex flex-col items-center justify-center bottom-3"
                  >
                    <NuxtLink
                      :to="demoWalletUrl"
                      class="text-white group text-base font-medium"
                    >
                      Switch To Demo Version
                    </NuxtLink>
                    <hr class="w-2/3 border-blue-200" />
                  </div>
                </div>
              </nav>
            </DialogPanel>
          </TransitionChild>
          <div aria-hidden="true" class="w-14 flex-shrink-0">
            <!-- Dummy element to force sidebar to shrink to fit close icon -->
          </div>
        </div>
      </Dialog>
    </TransitionRoot>

    <!-- Static sidebar for desktop -->
    <div class="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <!-- Sidebar component, swap this element with another sidebar if you like -->
      <div
        class="flex flex-grow flex-col overflow-y-auto pb-4 pt-5 border-r border-white/20 shadow-2xl"
        style="background: linear-gradient(160deg, rgba(33,136,202,0.92), rgba(15,63,94,0.92)); backdrop-filter: blur(16px) saturate(180%);"
      >
        <div class="flex flex-shrink-0 items-center px-4">
          <img :src="inWalletLogoImage" alt="" class="h-24 w-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]" />
        </div>
        <nav
          aria-label="Sidebar"
          class="mt-5 flex flex-1 flex-col divide-y divide-white/10 overflow-y-auto"
        >
          <div class="space-y-1 px-2">
            <div v-for="navItem in navigation" class="pb-3">
              <p class="font-semibold text-[#D0E6F3]">{{ navItem.name }}</p>
              <NuxtLink
                v-for="item in navItem.items"
                :key="item.name"
                :to="item.href"
                class="text-[#EAF4FB] hover:bg-white/10 group flex items-center rounded-xl px-3 py-2 text-base font-medium transition-all duration-200 hover:translate-x-0.5"
              >
                <component
                  :is="item.icon"
                  aria-hidden="true"
                  class="mr-4 h-6 w-6 flex-shrink-0 text-[#D0E6F3]"
                />
                {{ item.name }}
              </NuxtLink>
            </div>
          </div>
          <div class="mt-6 pt-6 flex flex-col justify-between h-full">
            <div class="space-y-1 px-2">
              <NuxtLink
                v-for="item in secondaryNavigation"
                :key="item.name"
                :to="item.href"
                class="group flex items-center rounded-xl px-3 py-2 text-base font-medium leading-6 text-[#EAF4FB] hover:bg-white/10 transition-all duration-200"
              >
                <component
                  :is="item.icon"
                  aria-hidden="true"
                  class="mr-4 h-6 w-6 text-[#D0E6F3]"
                />
                {{ item.name }}
              </NuxtLink>
            </div>
            <div class="flex flex-col items-center justify-center">
              <NuxtLink
                :to="demoWalletUrl"
                class="text-white group text-base font-medium"
              >
                Switch To Demo Version</NuxtLink
              >
              <hr class="w-2/3 border-blue-200" />
            </div>
          </div>
        </nav>
      </div>
    </div>

    <div class="flex flex-1 flex-col lg:pl-64">
      <div class="flex h-16 flex-shrink-0 border-b border-white/40 bg-white/70 backdrop-blur-md">
        <button
          class="border-r border-white/30 px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#2188CA] lg:hidden"
          type="button"
          @click="sidebarOpen = true"
        >
          <span class="sr-only">Open sidebar</span>
          <Bars3CenterLeftIcon aria-hidden="true" class="h-6 w-6" />
        </button>
        <!-- Search bar -->
        <div
          class="flex flex-1 justify-between px-4 sm:px-6 lg:mx-auto lg:max-w-6xl lg:px-8"
        >
          <div class="flex flex-1">
            <form action="#" class="flex w-full md:ml-0" method="GET">
              <label class="sr-only" for="search-field">Search</label>
              <div
                class="relative w-full text-gray-400 focus-within:text-gray-600"
              >
                <div
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-y-0 left-0 flex items-center"
                >
                  <MagnifyingGlassIcon aria-hidden="true" class="h-5 w-5" />
                </div>
                <input
                  id="search-field"
                  class="block h-full w-full border-transparent py-2 pl-8 pr-3 text-gray-900 focus:border-transparent focus:outline-none focus:ring-0 sm:text-sm"
                  name="search-field"
                  placeholder="Search for credentials"
                  type="search"
                />
              </div>
            </form>
          </div>
          <div class="ml-4 flex items-center md:ml-6">
            <button
              class="rounded-full bg-white/70 backdrop-blur p-1 text-gray-500 hover:text-[#2188CA] focus:outline-none focus:ring-2 focus:ring-[#2188CA] focus:ring-offset-2 focus:ring-offset-white/60"
              type="button"
              @click="reloadData"
            >
              <span class="sr-only">Refresh</span>
              <ArrowPathIcon
                :class="[refreshing ? 'animate-spin' : '']"
                aria-hidden="true"
                class="h-6 w-6"
              />
            </button>
            <button
              class="rounded-full bg-white/70 backdrop-blur p-1 text-gray-500 hover:text-[#2188CA] focus:outline-none focus:ring-2 focus:ring-[#2188CA] focus:ring-offset-2 focus:ring-offset-white/60"
              type="button"
            >
              <span class="sr-only">View notifications</span>
              <BellIcon aria-hidden="true" class="h-6 w-6" />
            </button>

            <!-- Profile dropdown -->
            <Menu as="div" class="relative ml-3">
              <div>
                <MenuButton
                  class="flex max-w-xs items-center rounded-full bg-white/70 backdrop-blur text-sm focus:outline-none focus:ring-2 focus:ring-[#2188CA] focus:ring-offset-2 focus:ring-offset-white/60 lg:rounded-md lg:p-2 lg:hover:bg-white/80 transition-colors"
                >
                  <img
                    alt=""
                    class="h-8 w-8 rounded-full"
                    src="/credentis-logo.png"
                  />
                  <!-- src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"/> -->
                  <span
                    class="ml-3 hidden text-sm font-medium text-[#0F3F5E] lg:block"
                    >{{ user.friendlyName }}</span
                  >
                  <ChevronDownIcon
                    aria-hidden="true"
                    class="ml-1 hidden h-5 w-5 flex-shrink-0 text-[#6FB4DC] lg:block"
                  />
                </MenuButton>
              </div>
              <transition
                enter-active-class="transition ease-out duration-100"
                enter-from-class="transform opacity-0 scale-95"
                enter-to-class="transform opacity-100 scale-100"
                leave-active-class="transition ease-in duration-75"
                leave-from-class="transform opacity-100 scale-100"
                leave-to-class="transform opacity-0 scale-95"
              >
                <MenuItems
                  class="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-xl bg-white/80 backdrop-blur-md py-1 shadow-lg ring-1 ring-white/40 focus:outline-none"
                >
                  <MenuItem v-slot="{ active }">
                    <NuxtLink
                      :class="[
                        active ? 'bg-[#D0E6F3]/60' : '',
                        'block px-4 py-2 text-sm text-[#0F3F5E]',
                      ]"
                      to="/profile"
                      >Your Profile
                    </NuxtLink>
                  </MenuItem>
                  <MenuItem v-slot="{ active }">
                    <NuxtLink
                      :class="[
                        active ? 'bg-[#D0E6F3]/60' : '',
                        'block px-4 py-2 text-sm text-[#0F3F5E]',
                      ]"
                      to="/settings"
                      >Settings
                    </NuxtLink>
                  </MenuItem>
                  <MenuItem v-slot="{ active }">
                    <button
                      :class="[
                        active ? 'bg-[#D0E6F3]/60' : '',
                        'block px-4 py-2 text-sm text-[#0F3F5E]',
                      ]"
                      class="w-full text-left"
                      @click="logout"
                    >
                      Logout
                    </button>
                  </MenuItem>
                </MenuItems>
              </transition>
            </Menu>
          </div>
        </div>
      </div>

      <main class="flex-1 pb-8">
        <NuxtErrorBoundary @error="logError">
          <slot />

          <template #error="{ error }">
            <CenterMain>
              <p>An error occured: {{ error }}</p>
              <pre v-if="error.value?.response?._data">{{
                error.value?.response?._data
              }}</pre>
              <WaltButton @click="goBack">Back</WaltButton>
            </CenterMain>
          </template>
        </NuxtErrorBoundary>
      </main>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {ref, computed} from "vue";
import {Dialog, DialogPanel, Menu, MenuButton, MenuItem, MenuItems, TransitionChild, TransitionRoot} from "@headlessui/vue";
import {
    ArrowPathIcon,
    ArrowDownOnSquareStackIcon,
    Bars3CenterLeftIcon,
    BellIcon,
    ClipboardDocumentListIcon,
    CogIcon,
    FingerPrintIcon,
    GlobeAltIcon,
    HomeIcon,
    KeyIcon,
    ListBulletIcon,
    QrCodeIcon,
    QuestionMarkCircleIcon,
    ShieldCheckIcon,
    ShoppingCartIcon,
    XMarkIcon
} from "@heroicons/vue/24/outline";
import {ChevronDownIcon, MagnifyingGlassIcon} from "@heroicons/vue/20/solid";
import {useUserStore} from "@credentis-web-wallet/stores/user.ts";
import {storeToRefs} from "pinia";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import {useTenant} from "@credentis-web-wallet/composables/tenants.ts";
import {logout} from "~/composables/authentication";
import WaltButton from "@credentis-web-wallet/components/buttons/WaltButton.vue";

const runtimeConfig = useRuntimeConfig();
const demoWalletUrl = runtimeConfig.public.demoWalletUrl as string;

const tenant = await useTenant().value;
const name = tenant?.name;
const logoImg = tenant?.logoImage;
const inWalletLogoImage = tenant?.inWalletLogoImage;

const userStore = useUserStore();
const { user } = storeToRefs(userStore);

const refreshing = ref(false);

function logError(error: Error) {
  console.error(error);
}

function goBack() {
  useRouter().back();
  window.location.reload();
}

async function reloadData() {
  refreshing.value = true;
  console.log("Refreshing data");
  refreshNuxtData().then(() => {
    refreshing.value = false;
    console.log("Refreshed data");
  });
}

const currentWallet = useCurrentWallet();
const walletBase = computed(() => currentWallet.value ? `/wallet/${currentWallet.value}` : '/');

const navigation = computed(() => [
  {
    name: "",
    items: [
      {
        name: "Credentials",
        href: walletBase.value,
        icon: HomeIcon,
      },
      {
        name: "Tokens",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/settings/tokens` : '/',
        icon: GlobeAltIcon,
      },
      {
        name: "DIDs",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/settings/dids` : '/',
        icon: FingerPrintIcon,
      },
      {
        name: "Keys",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/settings/keys` : '/',
        icon: KeyIcon,
      },
      {
        name: "Event log",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/eventlog` : '/',
        icon: ClipboardDocumentListIcon,
      },
    ],
  },
  {
    name: "Workflows",
    items: [
      {
        name: "Scan QR",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/scan` : '/',
        icon: QrCodeIcon,
      },
      {
        name: "Request Credentials",
        href: currentWallet.value ? `/wallet/${currentWallet.value}/settings/issuers` : '/',
        icon: ArrowDownOnSquareStackIcon,
      },
      {
        name: "Finance Portal (Demo)",
        href: "/demo/finance-portal",
        icon: ShoppingCartIcon,
      },
    ],
  },
]);
const secondaryNavigation = [
  { name: "Select wallet", href: "/", icon: ListBulletIcon },
  { name: "Settings", href: "/settings", icon: CogIcon },
  { name: "Help", href: "/help", icon: QuestionMarkCircleIcon },
  { name: "Privacy", href: "/help/privacy", icon: ShieldCheckIcon },
];
const statusStyles = {
  success: "bg-green-100 text-green-800",
  processing: "bg-yellow-100 text-yellow-800",
  failed: "bg-gray-100 text-gray-800",
};

const sidebarOpen = ref(false);
</script>

<style>
.router-link-exact-active {
  color: #0F3F5E;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0.75rem;
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
