<template>
  <div>
    <PageHeader>
      <template v-slot:title>
        <div class="ml-3">
          <h1
            class="text-2xl font-bold leading-7 text-[#0F3F5E] sm:truncate sm:leading-9"
          >
            Receive entra credentials
          </h1>
          <p class="text-sm text-[#627D98]">
            issued by <span class="underline text-[#0F3F5E]">{{ issuerHost }}</span>
          </p>
        </div>
      </template>

      <template v-if="!immediateAccept" v-slot:menu>
        <ActionButton
          class="inline-flex items-center rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:scale-105 hover:bg-red-700 focus:outline focus:outline-offset-2 focus:outline-red-700"
          display-text="Reject"
          icon="heroicons:x-mark"
          type="button"
          @click="navigateTo(`/wallet/${currentWallet}`)"
        />

        <div class="group flex">
          <ActionButton
            :class="[
              failed
                ? 'animate-pulse bg-red-600 hover:scale-105 hover:bg-red-700 focus:outline focus:outline-offset-2 focus:outline-red-700'
                : 'hover:scale-105 focus:outline focus:outline-offset-2 focus:outline-[#2188CA]',
            ]"
            :disabled="
              (selectedDid === null || selectedDid === undefined) &&
              !(dids && dids?.length === 1)
            "
            :failed="failed"
            class="inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm focus:outline focus:outline-offset-2 disabled:bg-gray-200 disabled:cursor-not-allowed"
            display-text="Accept"
            icon="heroicons:check"
            type="button"
            @click="acceptCredential"
            style="background: linear-gradient(135deg, #2188CA, #0F3F5E);"
          />
          <span
            v-if="failed"
            class="group-hover:opacity-100 transition-opacity bg-gray-800 px-1 text-sm text-gray-100 rounded-md absolute -translate-x-1/2 opacity-0 m-4 mx-auto"
          >
            {{ failMessage }}
          </span>
        </div>
      </template>
    </PageHeader>

    <CenterMain>
      <h1 class="mb-2 text-2xl font-semibold text-[#0F3F5E]">Issuance</h1>

      <LoadingIndicator v-if="immediateAccept" class="my-6 mb-12 w-full">
        Receiving {{ credentialCount }}
        credential(s)...
      </LoadingIndicator>

      <div class="flex col-2">
        <div v-if="!pendingDids" class="relative w-full">
          <Listbox v-if="dids?.length !== 1" v-model="selectedDid" as="div">
            <ListboxLabel
              class="block text-sm font-medium leading-6 text-[#0F3F5E]"
              >Select DID:
            </ListboxLabel>

            <div class="relative mt-2">
              <ListboxButton
                v-if="selectedDid !== null"
                class="relative w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-[#0F3F5E] shadow-sm ring-1 ring-inset ring-[#D0E6F3] focus:outline-none focus:ring-2 focus:ring-[#2188CA] sm:text-sm sm:leading-6 h-9"
              >
                <span class="flex items-center">
                  <p class="truncate font-bold">{{ selectedDid?.alias }}</p>
                  <span class="ml-3 block truncate">{{
                    selectedDid?.did
                  }}</span>
                </span>
                <span
                  class="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2"
                >
                  <ChevronUpDownIcon
                    aria-hidden="true"
                    class="h-5 w-5 text-[#9FB3C8]"
                  />
                </span>
              </ListboxButton>

              <transition
                leave-active-class="transition ease-in duration-100"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
              >
                <ListboxOptions
                  class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                >
                  <ListboxOption
                    v-for="did in dids"
                    :key="did?.did"
                    v-slot="{ active, selectedDid }"
                    :value="did"
                    as="template"
                  >
                    <li
                      :class="[
                        active ? 'bg-[#2188CA] text-white' : 'text-[#0F3F5E]',
                        'relative cursor-default select-none py-2 pl-3 pr-9',
                      ]"
                    >
                      <div class="flex items-center">
                        <p class="italic">{{ did.alias }}</p>
                        <span
                          :class="[
                            selectedDid ? 'font-semibold' : 'font-normal',
                            'ml-3 block truncate',
                          ]"
                          >{{ did.did }}</span
                        >
                      </div>
                      <span
                        v-if="selectedDid"
                        :class="[
                          active ? 'text-white' : 'text-[#2188CA]',
                          'absolute inset-y-0 right-0 flex items-center pr-4',
                        ]"
                      >
                        <CheckIcon aria-hidden="true" class="h-5 w-5" />
                      </span>
                    </li>
                  </ListboxOption>
                </ListboxOptions>
              </transition>
            </div>
          </Listbox>

          <div class="rounded-md bg-[#F0F4F8] border border-[#D0E6F3] p-2 mt-2">
            <div class="flex">
              <div class="flex-1">
                <span
                  v-if="selectedDid != null"
                  class="text-sm text-[#627D98]"
                >
                  Will issue to DID: {{ selectedDid.alias }} ({{ selectedDid.did }})
                </span>
              </div>
              <button class="text-sm md:ml-6">
                <NuxtLink
                  :to="`/wallet/${currentWallet}/settings/dids`"
                  class="whitespace-nowrap font-medium text-[#2188CA] hover:text-[#0F3F5E]"
                >
                  DID management
                  <span aria-hidden="true"> &rarr;</span>
                </NuxtLink>
              </button>
            </div>
          </div>

          <p class="mt-10 mb-1 text-[#627D98]">The following credentials will be issued:</p>
          <div
            aria-label="Credential list"
            class="h-full overflow-y-auto shadow-xl"
          >
            <div
              v-for="group in groupedCredentialTypes.keys()"
              :key="group.id"
              class="relative"
            >
              <div
                class="top-0 z-10 border-y border-b-[#E4E7EB] border-t-[#F0F4F8] bg-[#F8F9FB] px-3 py-1.5 text-sm font-semibold leading-6 text-[#0F3F5E]"
              >
                <!--<h3>{{ JSON.stringify(group).slice(1, -1) }}s:</h3>-->
                <h3>{{ group.value }}s:</h3>
              </div>
              <ul class="divide-y divide-[#E4E7EB]" role="list">
                <li
                  v-for="credential in groupedCredentialTypes.get(group)"
                  :key="credential"
                  class="flex gap-x-4 px-3 py-5"
                >
                  <CredentialIcon
                    :credentialType="credential.name.value"
                    class="h-6 w-6 flex-none rounded-full bg-[#F0F4F8]"
                  ></CredentialIcon>

                  <div class="flex min-w-0 flex-row items-center">
                    <span class="text-lg font-semibold leading-6 text-[#0F3F5E]"
                      >{{ credential.id }}.</span
                    >
                    <span
                      class="ml-1 truncate text-sm leading-5 text-[#4A6580]"
                      >{{ credential.name.value }}</span
                    >
                  </div>
                </li>
              </ul>
            </div>
          </div>
          <br />
        </div>
      </div>
    </CenterMain>
  </div>
</template>

<script lang="ts" setup>
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue";
import PageHeader from "@credentis-web-wallet/components/PageHeader.vue";
import CredentialIcon from "@credentis-web-wallet/components/CredentialIcon.vue";
import ActionButton from "@credentis-web-wallet/components/buttons/ActionButton.vue";
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue";
import {Listbox, ListboxButton, ListboxLabel, ListboxOption, ListboxOptions} from "@headlessui/vue";
import {useCurrentWallet} from "@credentis-web-wallet/composables/accountWallet.ts";
import {decodeRequest} from "@credentis-web-wallet/composables/siop-requests.ts";
import {groupBy} from "@credentis-web-wallet/composables/groupings.ts";
import {CheckIcon, ChevronUpDownIcon} from "@heroicons/vue/20/solid";
import {useTitle} from "@vueuse/core";
import {ref} from "vue";

const currentWallet = useCurrentWallet();
const { data: dids, pending: pendingDids } = await useLazyAsyncData(() =>
  $fetch(`/wallet-api/wallet/${currentWallet.value}/dids`),
);

const selectedDid: Ref<Object | null> = ref(null);

//TODO: fix this hack for did-dropdown default selection
watch(dids, async (newDids) => {
  await nextTick();

  const newDid: string | null =
    newDids?.find((item) => {
      return item.default == true;
    }) ??
    newDids[0] ??
    null;

  console.log("Setting new DID: " + newDid);

  selectedDid.value = newDid;
});

const query = useRoute().query;
const request = decodeRequest(query.request);
console.log("Issuance -> Using request: ", request);

const immediateAccept = ref(false);
console.log("Making issuanceUrl...");
const issuanceUrl = new URL(request);
console.log("issuanceUrl: ", issuanceUrl);

//TODO: entra batch issuing (+mixed batch issuing)
const { data: manifest } = useLazyFetch(
  `/wallet-api/wallet/${currentWallet.value}/manifest/extract?offer=${request}`,
);
// credential display values
const issuerHost = computed(() =>
  manifest.value?.display ? manifest.value.display.card.issuedBy : "n/a",
);
console.log("Issuer host:", issuerHost);
const credentialType = computed(() =>
  manifest.value?.display ? manifest.value.display.card.title : "n/a",
);

let credentialTypes: String[] = [credentialType];
let i = 0;
const groupedCredentialTypes = groupBy(
  credentialTypes.map((item) => {
    return { id: ++i, name: item };
  }),
  (c) => c.name,
);

const failed = ref(false);
const failMessage = ref("Unknown error occurred.");

async function acceptCredential() {
  const did: string | null =
    selectedDid.value?.did ?? dids.value[0]?.did ?? null;

  if (did === null) {
    console.warn("NO DID AT ACCEPTCREDENTIAL");
    console.log("Selected: " + selectedDid.value);
    console.log("DIDs:" + dids.value[0]);
    return;
  }
  console.log("Issue to: " + did);
  try {
    await $fetch(
      `/wallet-api/wallet/${currentWallet.value}/exchange/useOfferRequest?did=${did}`,
      {
        method: "POST",
        body: request,
      },
    );
    navigateTo(`/wallet/${currentWallet.value}`);
  } catch (e) {
    failed.value = true;

    let errorMessage = e?.data.startsWith("{")
      ? JSON.parse(e.data)
      : (e.data ?? e);
    errorMessage = errorMessage?.message ?? errorMessage;

    failMessage.value = errorMessage;

    console.log("Error: ", e?.data);
    alert(
      "Error occurred while trying to receive credential: " + failMessage.value,
    );

    throw e;
  }
}

if (query.accept) {
  // TODO make accept a JWT or something wallet-backend secured
  immediateAccept.value = true;
  acceptCredential();
}

useTitle(`Claim credentials - Credentis`);
</script>

<style scoped></style>
