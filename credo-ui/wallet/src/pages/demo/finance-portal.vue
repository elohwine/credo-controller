<template>
  <CenterMain>
    <div class="py-10">
      <h1 class="text-3xl font-bold text-center text-[#002159] mb-8">Finance Demo Portal</h1>
      <p class="text-center text-gray-600 mb-12">Select a credential to issue and scan the QR code or copy the URL.</p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <button 
          v-for="type in credentialTypes" 
          :key="type.id"
          @click="issueCredential(type)"
          :disabled="loading"
          class="flex flex-col items-center p-6 bg-white rounded-2xl shadow-lg border-2 border-transparent hover:border-[#0573F0] transition-all duration-300"
          :class="{ 'opacity-50 cursor-not-allowed': loading, 'border-[#0573F0] bg-blue-50': activeType === type.id }"
        >
          <div class="w-12 h-12 mb-4 rounded-full bg-blue-100 flex items-center justify-center text-[#0573F0]">
            <component :is="type.icon" class="w-6 h-6" />
          </div>
          <span class="font-bold text-gray-800">{{ type.name }}</span>
        </button>
      </div>

      <div v-if="offerUri" class="bg-white rounded-3xl shadow-xl p-8 max-w-md mx-auto text-center border border-gray-100">
        <h3 class="text-xl font-bold mb-4 text-gray-900">Scan to Claim</h3>
        
        <div class="flex justify-center mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <qrcode-vue
            :value="offerUri"
            :size="220"
            level="H"
            render-as="svg"
          />
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2 p-3 bg-gray-100 rounded-xl overflow-hidden">
            <input 
              readOnly 
              :value="offerUri" 
              class="bg-transparent text-xs text-gray-500 truncate flex-1 outline-none"
            />
            <button 
              @click="copyToClipboard"
              class="p-2 text-[#0573F0] hover:bg-blue-100 rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              <template v-if="copied">
                <CheckIcon class="w-5 h-5" />
              </template>
              <template v-else>
                <ClipboardDocumentIcon class="w-5 h-5" />
              </template>
            </button>
          </div>

          <button 
            @click="openInWallet"
            class="w-full py-3 bg-[#002159] text-white rounded-xl font-bold hover:bg-blue-800 transition-colors shadow-lg"
          >
            Open in Web Wallet
          </button>
        </div>
      </div>

      <div v-if="error" class="mt-8 p-4 bg-red-50 text-red-600 rounded-xl text-center border border-red-100">
        {{ error }}
      </div>
      
      <div v-if="loading" class="mt-8 flex justify-center">
        <LoadingIndicator>Generating Offer...</LoadingIndicator>
      </div>
    </div>
  </CenterMain>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import QrcodeVue from 'qrcode.vue'
import { useClipboard } from '@vueuse/core'
import { 
  ShoppingCartIcon, 
  DocumentTextIcon, 
  ReceiptPercentIcon,
  ClipboardDocumentIcon,
  CheckIcon
} from '@heroicons/vue/24/outline'
import CenterMain from "@credentis-web-wallet/components/CenterMain.vue"
import LoadingIndicator from "@credentis-web-wallet/components/loading/LoadingIndicator.vue"
import { useCurrentWallet } from "@credentis-web-wallet/composables/accountWallet.ts"
import { encodeRequest } from "@credentis-web-wallet/composables/siop-requests.ts"

const offerUri = ref('')
const loading = ref(false)
const error = ref('')
const activeType = ref('')
const currentWalletId = useCurrentWallet()

const { copy, copied } = useClipboard()

const credentialTypes = [
  { id: 'cart', name: 'Cart Snapshot', endpoint: 'cart/demo-cart-123/issue-snapshot', icon: ShoppingCartIcon },
  { id: 'invoice', name: 'Invoice VC', endpoint: 'invoices/issue', icon: DocumentTextIcon },
  { id: 'receipt', name: 'Receipt VC', endpoint: 'receipts/issue', icon: ReceiptPercentIcon }
]

async function issueCredential(type: any) {
  loading.value = true
  error.value = ''
  offerUri.value = ''
  activeType.value = type.id

  // Mock data for demo
  const body: any = {}
  if (type.id === 'cart') {
    body.cartId = 'demo-cart-123'
    body.items = [{ id: 'item-1', name: 'Demo Product', price: 100, quantity: 1 }]
    body.totalAmount = 100
    body.currency = 'USD'
  } else if (type.id === 'invoice') {
    body.cartRef = 'demo-cart-123'
    body.amount = 100
    body.currency = 'USD'
  } else if (type.id === 'receipt') {
    body.invoiceRef = 'INV-demo-123'
    body.amount = 100
    body.currency = 'USD'
    body.transactionId = 'TXN-demo-123'
  }

  try {
    const response = await fetch(`/api/finance/${type.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In this demo, we assume the user is logged in and the browser sends the session cookie
        // The backend FinanceController expects a JWT in Authorization header.
        // For simplicity in this demo portal, we'll try to get it from the browser or use a test key
        'Authorization': 'Bearer ' + (document.cookie.split('; ').find(row => row.startsWith('auth.token='))?.split('=')[1] || '')
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Failed to generate offer: ${errText}`)
    }

    const data = await response.json()
    if (data.credential_offer_uri) {
      offerUri.value = data.credential_offer_uri
    } else {
      throw new Error('No offer URI returned from issuer')
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function copyToClipboard() {
  copy(offerUri.value)
}

function openInWallet() {
  if (!offerUri.value) return
  if (!currentWalletId.value) {
      error.value = "No wallet selected. Please select a wallet first."
      return
  }
  
  const encodedRequest = encodeRequest(offerUri.value)
  navigateTo(`/wallet/${currentWalletId.value}/exchange/issuance?request=${encodedRequest}`)
}

definePageMeta({
  layout: 'default',
  auth: false // Allow access to this demo portal
})

useHead({
  title: 'Finance Demo Portal - IdenEx'
})
</script>
