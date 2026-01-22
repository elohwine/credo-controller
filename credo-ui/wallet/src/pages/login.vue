<template>
  <div
    class="min-h-full sm:bg-[url('/images/background.png')] bg-cover bg-center bg-no-repeat"
  >
    <!-- Mobile View -->
    <div class="flex flex-col sm:hidden">
      <div class="w-full">
        <img
          :src="logoImage"
          alt="Credentis logo"
          class="h-8 w-auto mx-auto mt-5"
        />
      </div>
      <div
        class="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 lg:bg-white lg:bg-opacity-50 h-full"
      >
        <div
          class="mx-auto w-full max-w-sm lg:w-96 p-3 lg:backdrop-blur-md lg:rounded-3xl lg:bg-opacity-40"
        >
          <div>
            <h2
              class="mt-4 text-3xl font-bold tracking-tight text-black text-center"
            >
              Sign In
            </h2>
            <p class="mt-2 text-sm text-black text-center">
              No Account yet? {{ " " }}
              <NuxtLink
                class="font-medium text-blue-600 hover:text-blue-500"
                to="/signup"
                >Sign up here
              </NuxtLink>
            </p>
          </div>
          <div class="mt-5">
            <div class="mt-6">
              <form class="space-y-6" @submit.prevent="login">
                <div>
                  <label
                    class="block text-sm font-medium leading-6 text-[#52606D]"
                    for="username"
                  >
                    <span class="flex flex-row items-center">
                      Username
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="username-mobile"
                      v-model="usernameInput"
                      autocomplete="username"
                      autofocus
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="username"
                      :required="true"
                      type="text"
                    />
                  </div>
                </div>

                <div class="space-y-1">
                  <div>
                    <div class="flex justify-between items-center">
                      <label
                        class="block text-sm font-medium leading-6 text-[#3E4C59]"
                        for="password"
                      >
                        <span class="flex flex-row items-center">Password</span>
                      </label>
                      <!-- <NuxtLink class="text-sm font-medium text-[#7B8794] hover:text-blue-500"
                                            to="/forgot-password">
                                            Forgot password
                                        </NuxtLink> -->
                    </div>
                    <div class="mt-1">
                      <input
                        id="password"
                        v-model="passwordInput"
                        autocomplete="current-password"
                        class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                        name="password"
                        :required="true"
                        type="password"
                      />
                    </div>
                  </div>
                </div>
                <div class="flex flex-col gap-1.5">
                  <button
                    :class="[
                      success
                        ? 'bg-green-500 hover:bg-green-600 animate-bounce'
                        : 'bg-gradient-to-br from-[#2188CA] to-[#0F3F5E] hover:from-[#6FB4DC] hover:to-[#2188CA]',
                    ]"
                    class="flex w-full justify-center rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    type="submit"
                  >
                    Sign in
                    <svg
                      v-if="isLoggingIn"
                      class="animate-spin ml-1.5 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop View -->
    <div class="hidden sm:flex h-full">
      <div class="flex-1 flex flex-col justify-center items-center">
        <div class="flex items-center mb-8 gap-3 justify-center">
          <img src="/credentis-logo.png" alt="Credentis" class="h-12 w-12" />
          <div class="flex flex-col">
            <h1
              class="bg-gradient-to-r from-[#2188CA] to-[#0F3F5E] inline-block text-transparent bg-clip-text text-xl font-bold"
            >
              CREDENTIS WALLET
            </h1>
            <h1
              class="bg-gradient-to-r from-[#2188CA] to-[#6FB4DC] inline-block text-transparent bg-clip-text text-sm"
            >
              Verifiable Commerce
            </h1>
          </div>
        </div>
        <div class="rounded-3xl p-8 w-96 border border-white/30 shadow-2xl" style="background: linear-gradient(145deg, rgba(255,255,255,0.92), rgba(208,230,243,0.85)); backdrop-filter: blur(20px) saturate(180%);">
          <div class="flex flex-col items-center">
            <h2 class="mt-4 text-2xl font-bold tracking-tight text-[#0F3F5E]">
              Sign in
            </h2>
            <p class="mt-2 text-sm text-[#627D98]">
              No Account yet? {{ " " }}
              <NuxtLink
                class="font-medium text-[#2188CA] hover:text-[#0F3F5E]"
                to="/signup"
                >Sign up here
              </NuxtLink>
            </p>
          </div>
          <!-- <button
                        class="mt-5 flex w-full justify-center rounded-xl px-3 py-2 text-sm font-semibold text-gray-400 bg-white border border-gray-300">
                        Connect Wallet </button> -->
          <!-- <div class="flex items-center mt-5">
                        <div class="flex-1 border-t border-gray-300"></div>
                        <div class="mx-3 text-gray-400">or</div>
                        <div class="flex-1 border-t border-gray-300"></div>
                    </div> -->
          <div class="mt-5">
            <div class="mt-6">
              <form class="space-y-6" @submit.prevent="login">
                <div>
                  <label
                    class="block text-sm font-medium leading-6 text-[#52606D]"
                    for="username"
                  >
                    <span class="flex flex-row items-center">
                      Username
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="username-desktop"
                      v-model="usernameInput"
                      autocomplete="username"
                      autofocus
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="username"
                      :required="true"
                      type="text"
                    />
                  </div>
                </div>

                <div class="space-y-1">
                  <div>
                    <div class="flex justify-between items-center">
                      <label
                        class="block text-sm font-medium leading-6 text-[#3E4C59]"
                        for="password"
                      >
                        <span class="flex flex-row items-center">Password</span>
                      </label>
                      <!-- <NuxtLink class="text-sm font-medium text-[#7B8794] hover:text-blue-500"
                                                to="/forgot-password">
                                                Forgot password
                                            </NuxtLink> -->
                    </div>
                    <div class="mt-1">
                      <input
                        id="password"
                        v-model="passwordInput"
                        autocomplete="current-password"
                        class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                        name="password"
                        :required="true"
                        type="password"
                      />
                    </div>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <button
                    :class="[
                      success
                        ? 'bg-green-500 hover:bg-green-600 animate-bounce'
                        : 'bg-gradient-to-br from-[#2188CA] to-[#0F3F5E] hover:from-[#6FB4DC] hover:to-[#2188CA]',
                    ]"
                    class="flex w-full justify-center rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    type="submit"
                  >
                    Sign In
                    <svg
                      v-if="isLoggingIn"
                      class="animate-spin ml-1.5 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  </button>
                </div>
              </form>

              <div class="flex justify-center items-center mt-5 gap-2">
                <h1 class="text-center text-sm text-gray-400">
                  Powered by Credentis
                </h1>
                <img src="/credentis-logo.png" alt="Credentis" class="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-1 hidden lg:flex flex-col justify-center items-center">
        <svg
          width="103"
          height="103"
          viewBox="0 0 103 103"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="51.5" cy="51.5" r="51.5" fill="#7CC4FA" />
          <circle
            cx="51.5"
            cy="51.5"
            r="37.5"
            fill="url(#paint0_linear_1648_5682)"
          />
          <rect
            x="34.7695"
            y="38.2307"
            width="16.1538"
            height="4.61538"
            fill="#E6F6FF"
          />
          <path
            d="M74.0003 53.8076L69.9618 53.2307C67.0772 68.8076 50.3465 68.8076 50.3465 68.8076L49.7695 73.423C67.308 73.8846 73.2311 60.5384 74.0003 53.8076Z"
            fill="#E6F6FF"
          />
          <defs>
            <linearGradient
              id="paint0_linear_1648_5682"
              x1="14"
              y1="15.2136"
              x2="93.5375"
              y2="20.4808"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0.00970874" stop-color="#2188CA" />
              <stop offset="1" stop-color="#0F3F5E" />
            </linearGradient>
          </defs>
        </svg>
        <h1
          class="bg-gradient-to-r from-[#2188CA] to-[#0F3F5E] inline-block text-transparent bg-clip-text mt-5 text-5xl"
        >
          Powerful identity and
        </h1>
        <h1
          class="bg-gradient-to-r from-[#2188CA] to-[#0F3F5E] inline-block text-transparent bg-clip-text mt-3 text-5xl"
        >
          wallet infrastructure.
        </h1>
        <h1
          class="bg-gradient-to-r from-[#2188CA] to-[#0F3F5E] inline-block text-transparent bg-clip-text mt-5 text-2xl"
        >
          Trusted by +20.000 dev & organizations
        </h1>
      </div>
    </div>

    <TransitionRoot :show="error.isError === true" as="template">
      <Dialog as="div" class="relative z-[1000]" @close="closeModal">
        <TransitionChild
          as="template"
          enter="ease-out duration-300"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="ease-in duration-200"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div
            class="fixed inset-0 transition-opacity"
            style="background: rgba(15, 63, 94, 0.4); backdrop-filter: blur(8px);"
          />
        </TransitionChild>

        <div class="fixed inset-0 z-[1001] overflow-y-auto">
          <div
            class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
          >
            <TransitionChild
              as="template"
              enter="ease-out duration-300"
              enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enter-to="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leave-from="opacity-100 translate-y-0 sm:scale-100"
              leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel
                class="relative transform overflow-hidden rounded-2xl border border-white/30 px-4 pb-4 pt-5 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6"
                style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(20px) saturate(180%);"
              >
                <div class="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    class="rounded-md bg-white/80 text-[#627D98] hover:text-[#0F3F5E] focus:outline-none focus:ring-2 focus:ring-[#2188CA] focus:ring-offset-2"
                    type="button"
                    @click="closeModal"
                  >
                    <span class="sr-only">Close</span>
                    <XMarkIcon aria-hidden="true" class="h-6 w-6" />
                  </button>
                </div>
                <div class="sm:flex sm:items-start">
                  <div
                    class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"
                  >
                    <ExclamationCircleIcon
                      aria-hidden="true"
                      class="h-6 w-6 text-red-600"
                    />
                  </div>
                  <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <DialogTitle
                      as="h3"
                      class="text-base font-semibold leading-6 text-[#0F3F5E]"
                    >
                      Invalid login
                    </DialogTitle>
                    <div class="mt-2">
                      <p class="text-sm text-[#627D98]">
                        {{ error.message }}
                      </p>
                    </div>
                  </div>
                </div>
                <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                      class="mt-3 inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-[#D0E6F3] sm:mt-0 sm:w-auto"
                      style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
                    type="button"
                    @click="closeModal"
                  >
                    Okay
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </TransitionRoot>
  </div>
</template>

<script lang="ts" setup>
import {Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot} from "@headlessui/vue";
import {ExclamationCircleIcon, XMarkIcon} from "@heroicons/vue/24/outline";
import {usePageLeave, useParallax} from "@vueuse/core";
import {useTenant} from "@credentis-web-wallet/composables/tenants.ts";
import {listWallets, setWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import {useUserStore} from "@credentis-web-wallet/stores/user.ts";
import {useNotifications} from "@credentis-web-wallet/composables/notifications.ts";
import {storeToRefs} from "pinia";

const signInRedirectUrl = ref("/");
const route = useRoute();

if (route.redirectedFrom != undefined) {
  console.log(`Redirected from: ${JSON.stringify(route.redirectedFrom)}`);
  signInRedirectUrl.value = route.redirectedFrom.fullPath;
}

const tenant = (await useTenant().value) as any;
const { logoImage } = tenant;

const userStore = useUserStore();
const { user } = storeToRefs(userStore);

let usernameInput = "";
let passwordInput = "";

const isLoggingIn = ref(false);
const error = ref({ isError: false, message: "" });
const success = ref(false);

const { status, data, signIn } = useAuth();

async function login() {
  isLoggingIn.value = true;

  const { success: showSuccess, error: showError } = useNotifications();
  
  const userData = {
    username: usernameInput,
    password: passwordInput,
  };
  await signIn(
    { username: usernameInput, password: passwordInput },
    { redirect: false },
  )
    .then(async (data: any) => {
      const wallets = (await listWallets())?.value?.wallets;

      user.value = {
        id: "",
        email: undefined,
      };
      success.value = true;
      isLoggingIn.value = false;
      
      showSuccess('Login successful! Welcome back.');

      if (wallets) {
        setWallet(wallets[0].id);
        
        // Check if there is a pending credential offer (GenericID not yet accepted)
        if (data?.credentialOfferUri) {
            console.log("Redirecting to issuance with offer:", data.credentialOfferUri);
            navigateTo(`/wallet/${wallets[0].id}/exchange/issuance?request=${encodeURIComponent(data.credentialOfferUri)}`);
        } else {
            navigateTo(`/wallet/${wallets[0].id}`);
        }
      }
    })
    .catch((err) => {
      console.log("Could not sign in", err);
      const errorMsg = "Please check that you have entered your correct username and password!";
      error.value = {
        isError: true,
        message: errorMsg,
      };
      showError(errorMsg);
      isLoggingIn.value = false;
    });
}

function closeModal() {
  error.value = {
    isError: false,
    message: "",
  };
}

definePageMeta({
  title: "Login to your wallet - Credentis",
  layout: "minimal",
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: "/",
  },
});
const container = ref(null);
const parallax = reactive(useParallax(container));
const isLeft = reactive(usePageLeave());
const cardStyle = computed(() => ({
  overflow: "hidden",
  transition: ".5s ease-out all",
  transform: `rotateX(${parallax.source == "mouse" && (isLeft.value || parallax.roll == 0.5) ? 0 : parallax.roll * 60}deg) rotateY(
    ${parallax.source == "mouse" && (isLeft.value || parallax.tilt == -0.5) ? 0 : parallax.tilt * 60}deg)`,
}));
useHead({
  title: "Login to your wallet - Credentis",
});
</script>

<style scoped>
@keyframes zoom-in {
  25%,
  100% {
    transform: scale(2);
    filter: blur(1rem);
  }
}

@keyframes zoom-out {
  0% {
    transform: scale(2);
  }

  100% {
    transform: scale(1);
  }
}

.zoom-in {
  animation: zoom-in 0.4s normal forwards;
}

.zoom-out {
  animation: zoom-out 0.5s normal forwards;
  /* animation: none; */
}
</style>
