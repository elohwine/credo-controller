import { useState, useEffect, useContext } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { EnvContext } from '@/pages/_app'
import nextConfig from '@/next.config'
import Layout from '@/components/Layout'
import { 
  IconCheck, 
  IconX, 
  IconAlertTriangle, 
  IconReceipt, 
  IconCreditCard,
  IconShoppingCart,
  IconUser,
  IconCalendar,
  IconRefresh,
  IconTruck
} from '@tabler/icons-react'

interface ReceiptVerificationResult {
  verified: boolean
  receiptId?: string
  transactionId?: string
  amount?: number
  currency?: string
  payerPhone?: string
  merchantId?: string
  cartId?: string
  items?: Array<{
    name: string
    quantity: number
    price: number
  }>
  paymentMethod?: string
  timestamp?: string
  issuer?: string
  error?: string
}

export default function ReceiptVerification() {
  const router = useRouter()
  const { transactionId } = router.query
  const env = useContext(EnvContext)
  
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ReceiptVerificationResult | null>(null)
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false)

  const backendUrl = (env?.NEXT_PUBLIC_ISSUER || nextConfig.publicRuntimeConfig?.NEXT_PUBLIC_ISSUER || 'http://localhost:3000')
    .replace('/oidc/issuer', '')

  useEffect(() => {
    if (transactionId && typeof transactionId === 'string') {
      verifyReceipt(transactionId)
    } else {
      setLoading(false)
    }
  }, [transactionId])

  const verifyReceipt = async (txId: string) => {
    setLoading(true)
    try {
      // Try receipt verification endpoint first
      const response = await axios.get(`${backendUrl}/api/receipts/verify/${txId}`)
      
      if (response.data.verified) {
        setResult({
          verified: true,
          ...response.data.receipt
        })
      } else {
        setResult({
          verified: false,
          error: response.data.error || 'Receipt not found or invalid'
        })
      }
    } catch (error: any) {
      // Fallback: query payment lookup
      try {
        const paymentResponse = await axios.get(`${backendUrl}/api/payments/lookup?ref=${txId}`)
        if (paymentResponse.data.found && paymentResponse.data.payment?.state === 'paid') {
          const p = paymentResponse.data.payment
          setResult({
            verified: true,
            transactionId: p.providerRef || p.paymentRequestToken,
            amount: p.amount,
            currency: p.currency,
            payerPhone: p.payerPhone,
            merchantId: p.tenantId,
            cartId: p.cartId,
            paymentMethod: 'EcoCash',
            timestamp: p.updatedAt
          })
        } else {
          setResult({
            verified: false,
            error: 'Payment not confirmed'
          })
        }
      } catch (lookupError) {
        setResult({
          verified: false,
          error: 'Transaction not found'
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelivery = async () => {
    // TODO: Record delivery confirmation in backend
    setDeliveryConfirmed(true)
  }

  const handleRefresh = () => {
    if (transactionId) {
      setDeliveryConfirmed(false)
      verifyReceipt(transactionId as string)
    }
  }

  // ===== SIMPLE DELIVERY VERIFICATION UI =====
  return (
    <Layout>
      <div className="min-h-screen flex flex-col items-center justify-center p-4 -mt-16">
        
        {/* Loading State */}
        {loading && (
          <div className="text-center">
            <div className="animate-spin w-16 h-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-xl text-gray-600">Verifying payment...</p>
          </div>
        )}

        {/* VERIFIED - Big Green Check */}
        {!loading && result?.verified && !deliveryConfirmed && (
          <div className="w-full max-w-md">
            {/* Big Success Icon */}
            <div className="bg-green-500 rounded-3xl p-8 text-center mb-6 shadow-xl">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <IconCheck size={56} className="text-green-500" strokeWidth={3} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">PAYMENT VERIFIED</h1>
              <p className="text-green-100 text-lg">Safe to release goods</p>
            </div>

            {/* Amount & Key Info */}
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
              <div className="text-center mb-4">
                <p className="text-sm text-gray-500">Amount Paid</p>
                <p className="text-4xl font-bold text-gray-900">
                  {result.currency || 'USD'} {(result.amount || 0).toFixed(2)}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                <div>
                  <p className="text-gray-500">Transaction</p>
                  <p className="font-mono font-medium truncate">{result.transactionId || transactionId}</p>
                </div>
                <div>
                  <p className="text-gray-500">Customer</p>
                  <p className="font-medium">{result.payerPhone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment</p>
                  <p className="font-medium">{result.paymentMethod || 'EcoCash'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Date</p>
                  <p className="font-medium">
                    {result.timestamp ? new Date(result.timestamp).toLocaleDateString() : 'Today'}
                  </p>
                </div>
              </div>
            </div>

            {/* Confirm Delivery Button */}
            <button
              onClick={handleConfirmDelivery}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-98 transition-all shadow-lg"
            >
              <IconTruck size={24} />
              CONFIRM DELIVERY
            </button>
          </div>
        )}

        {/* Delivery Confirmed */}
        {!loading && deliveryConfirmed && (
          <div className="w-full max-w-md text-center">
            <div className="bg-blue-500 rounded-3xl p-8 mb-6 shadow-xl">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <IconTruck size={48} className="text-blue-500" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">DELIVERY RECORDED</h1>
              <p className="text-blue-100">Transaction: {transactionId}</p>
            </div>
            <button
              onClick={() => router.push('/verify/receipt')}
              className="text-blue-600 font-medium"
            >
              ← Verify Another
            </button>
          </div>
        )}

        {/* NOT VERIFIED - Big Red X */}
        {!loading && result && !result.verified && (
          <div className="w-full max-w-md">
            <div className="bg-red-500 rounded-3xl p-8 text-center mb-6 shadow-xl">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <IconX size={56} className="text-red-500" strokeWidth={3} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">NOT VERIFIED</h1>
              <p className="text-red-100 text-lg">Do NOT release goods</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
              <div className="flex items-start gap-3">
                <IconAlertTriangle size={24} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Verification Failed</p>
                  <p className="text-gray-600 text-sm">{result.error}</p>
                  <ul className="text-sm text-gray-500 mt-3 space-y-1">
                    <li>• Ask customer to show wallet receipt</li>
                    <li>• Re-enter transaction ID carefully</li>
                    <li>• Contact merchant if issue persists</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2"
              >
                <IconRefresh size={20} />
                Retry
              </button>
              <button
                onClick={() => router.push('/verify/receipt')}
                className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-medium"
              >
                New Lookup
              </button>
            </div>
          </div>
        )}

        {/* No Transaction ID */}
        {!loading && !transactionId && (
          <div className="text-center">
            <IconReceipt size={64} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No transaction ID provided</p>
            <button
              onClick={() => router.push('/verify/receipt')}
              className="px-6 py-3 bg-primary text-white rounded-xl font-medium"
            >
              Enter Transaction ID
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-400 mt-8">
          Secured by Credentis • {new Date().toLocaleString()}
        </p>
      </div>
    </Layout>
  )
}
