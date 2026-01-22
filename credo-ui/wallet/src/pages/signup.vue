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
        class="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 lg:bg-white lg:bg-opacity-50"
      >
        <div
          class="mx-auto w-full max-w-sm lg:w-96 p-3 lg:backdrop-blur-md lg:rounded-3xl lg:bg-opacity-40"
        >
          <h2
            class="mt-4 text-3xl font-bold tracking-tight text-black text-center"
          >
            Sign Up
          </h2>
          <p class="mt-2 text-sm text-black text-center">
            Already have an Account? {{ " " }}
            <NuxtLink
              class="font-medium text-[#2188CA] hover:text-[#0F3F5E]"
              to="/login"
              >Sign in here
            </NuxtLink>
          </p>

          <div class="mt-8">
            <div class="mt-6">
              <form class="space-y-6" @submit.prevent="register">
                <!-- name -->
                <div>
                  <label
                    class="block text-sm font-medium leading-6 text-gray-600"
                    for="username"
                  >
                    <span class="flex flex-row items-center">
                      Username
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="username"
                      v-model="usernameInput"
                      autocomplete="username"
                      autofocus
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="username"
                      required
                      type="text"
                    />
                  </div>
                </div>

                <!-- email -->
                <div>
                  <label
                    class="block text-sm font-medium leading-6 text-gray-700"
                    for="email"
                  >
                    <span class="flex flex-row items-center">
                      Email address
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="email"
                      v-model="emailInput"
                      autocomplete="email"
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="email"
                      required
                      type="email"
                    />
                  </div>
                </div>
                <!-- password -->
                <div class="space-y-1">
                  <label
                    class="block text-sm font-medium leading-6 text-gray-600"
                    for="password"
                  >
                    <span class="flex flex-row items-center">
                      Password
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="password"
                      v-model="passwordInput"
                      autocomplete="current-password"
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="password"
                      required
                      type="password"
                    />
                  </div>
                </div>

                <div>
                  <button
                    :class="[
                      success
                        ? 'bg-green-500 hover:bg-green-600 animate-bounce'
                        : 'bg-gradient-to-br from-[#2188CA] to-[#0F3F5E] hover:from-[#6FB4DC] hover:to-[#2188CA]',
                    ]"
                    class="flex w-full justify-center rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    type="submit"
                  >
                    Sign Up
                    <svg
                      v-if="isProgress"
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
        <div
          class="rounded-3xl p-8 w-96 border border-white/30 shadow-2xl"
          style="background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(208,230,243,0.90)); backdrop-filter: blur(20px) saturate(180%);"
        >
          <div class="flex flex-col items-center">
            <h2 class="mt-4 text-2xl font-bold tracking-tight text-[#0F3F5E]">
              Sign Up
            </h2>
            <p class="mt-2 text-sm text-[#627D98]">
              Already have an Account? {{ " " }}
              <NuxtLink
                class="font-medium text-[#2188CA] hover:text-[#0F3F5E]"
                to="/login"
                >Sign in here
              </NuxtLink>
            </p>
          </div>
          <div class="mt-5">
            <div class="mt-6">
              <form class="space-y-6" @submit.prevent="register">
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
                      id="username"
                      v-model="usernameInput"
                      autocomplete="username"
                      autofocus
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="username"
                      required
                      type="text"
                    />
                  </div>
                </div>

                <div>
                  <label
                    class="block text-sm font-medium leading-6 text-[#52606D]"
                    for="email"
                  >
                    <span class="flex flex-row items-center">
                      E-Mail
                    </span></label
                  >
                  <div class="mt-1">
                    <input
                      id="email"
                      v-model="emailInput"
                      autocomplete="email"
                      autofocus
                      class="block w-full rounded-md border-0 py-1.5 shadow-sm ring-1 ring-inset ring-[#D0E6F3] placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[#2188CA] sm:text-sm sm:leading-6 px-2 text-gray-600"
                      name="email"
                      :required="true"
                      type="email"
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
                    Sign Up
                    <svg
                      v-if="isProgress"
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
                      Error
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
                      class="mt-3 inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-gray-300 sm:mt-0 sm:w-auto"
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
import {useTenant} from "@credentis-web-wallet/composables/tenants.ts";
import {useNotifications} from "@credentis-web-wallet/composables/notifications.ts";

const tenant = (await useTenant().value) as any;
const { logoImage } = tenant;

const isProgress = ref(false);
const success = ref(false);
const error = ref({ isError: false, message: "" });

let usernameInput = "";
let emailInput = "";
let passwordInput = "";

async function register() {
  isProgress.value = true;

  const user = {
    username: usernameInput,
    email: emailInput,
    password: passwordInput,
  };
  
  const { success: showSuccess, error: showError } = useNotifications();
  
  await $fetch("/wallet-api/auth/register", {
    method: "POST",
    body: user,
  })
    .then((response) => {
      success.value = true;
      isProgress.value = false;
      showSuccess('Registration successful! Welcome to Credentis');
      navigateTo("/");
    })
    .catch((err) => {
      isProgress.value = false;
      const errorMsg = err.data?.cause ?? err.data?.message ?? "Registration failed";
      error.value = {
        isError: true,
        message: errorMsg,
      };
      showError(errorMsg);
    });
}

function closeModal() {
  error.value = {
    isError: false,
    message: "",
  };
}

definePageMeta({
  title: "Register for your wallet - Credentis",
  layout: "minimal",
  auth: {
    unauthenticatedOnly: true,
    navigateAuthenticatedTo: "/",
  },
});

useHead({
  title: "Register for your wallet - Credentis",
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
