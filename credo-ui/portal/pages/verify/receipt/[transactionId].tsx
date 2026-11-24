import { useState, useEffect, useContext, type ReactNode } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { EnvContext } from '@/pages/_app'
import { appUrls } from '@/lib/appUrls'
import Layout from '@/components/Layout'
import { Anchor, Box, Button, Divider, Group, List, Loader, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { formatTxnTime } from '@/lib/inboxAttention'
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
import { PRODUCT_NAME } from '@/utils/orgProfile'

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

  const backendUrl = (env?.NEXT_PUBLIC_ISSUER || appUrls.NEXT_PUBLIC_ISSUER || 'http://localhost:3000')
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
    try {
      setLoading(true)
      const txnId = result?.transactionId || transactionId
      
      const response = await axios.post(`${backendUrl}/api/receipts/confirm-delivery`, {
        transactionId: txnId
      })

      if (response.data.success) {
        setDeliveryConfirmed(true)
      } else {
        alert('Failed to confirm delivery: ' + response.data.message)
      }
    } catch (error: any) {
      console.error('Delivery confirmation error:', error)
      alert('Error confirming delivery: ' + (error.response?.data?.message || error.message))
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    if (transactionId) {
      setDeliveryConfirmed(false)
      verifyReceipt(transactionId as string)
    }
  }

  const detail = (label: string, value: ReactNode, mono = false) => (
    <div style={{ minWidth: 0 }}>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} ff={mono ? 'monospace' : undefined} truncate>{value}</Text>
    </div>
  )

  // ===== SIMPLE DELIVERY VERIFICATION UI =====
  return (
    <Layout>
      <Stack align="center" justify="center" gap="lg" p="md" mih="calc(100vh - 8rem)">

        {/* Loading State */}
        {loading && (
          <Stack align="center" gap="md">
            <Loader size="xl" />
            <Text size="xl">Verifying payment...</Text>
          </Stack>
        )}

        {/* VERIFIED */}
        {!loading && result?.verified && !deliveryConfirmed && (
          <Stack w="100%" maw={448} gap="md">
            <Paper withBorder shadow="sm" radius="lg" p="xl" ta="center" style={{ borderTop: '4px solid var(--mantine-color-success-6, var(--mantine-color-green-6))' }}>
              <Stack align="center" gap="xs">
                <ThemeIcon size={88} radius="xl" color="success" variant="light">
                  <IconCheck size={52} stroke={3} />
                </ThemeIcon>
                <Title order={2} c="success">Payment verified</Title>
                <Text size="lg" c="dimmed">Safe to release goods</Text>
              </Stack>
            </Paper>

            {/* Amount & Key Info */}
            <Paper withBorder shadow="sm" radius="lg" p="lg">
              <Stack align="center" gap={2} mb="md">
                <Text size="sm" c="dimmed">Amount Paid</Text>
                <Text fz={36} fw={700}>
                  {result.currency || 'USD'} {(result.amount || 0).toFixed(2)}
                </Text>
              </Stack>
              <Divider mb="md" />
              <SimpleGrid cols={2} spacing="md">
                {detail('Transaction', result.transactionId || transactionId, true)}
                {detail('Customer', result.payerPhone || 'N/A')}
                {detail('Payment', result.paymentMethod || 'EcoCash')}
                {detail('When', result.timestamp ? formatTxnTime(result.timestamp) : 'Today')}
              </SimpleGrid>
            </Paper>

            {/* Confirm Delivery Button */}
            <Button onClick={handleConfirmDelivery} fullWidth size="lg" radius="md" leftSection={<IconTruck size={22} />}>
              Confirm delivery
            </Button>
          </Stack>
        )}

        {/* Delivery Confirmed */}
        {!loading && deliveryConfirmed && (
          <Stack w="100%" maw={448} gap="md" ta="center">
            <Paper withBorder shadow="sm" radius="lg" p="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={88} radius="xl" variant="light">
                  <IconTruck size={48} />
                </ThemeIcon>
                <Title order={2}>Delivery recorded</Title>
                <Text c="dimmed">Transaction: {transactionId}</Text>
              </Stack>
            </Paper>
            <Anchor component="button" fw={500} onClick={() => router.push('/verify/receipt')}>
              ← Verify Another
            </Anchor>
          </Stack>
        )}

        {/* NOT VERIFIED */}
        {!loading && result && !result.verified && (
          <Stack w="100%" maw={448} gap="md">
            <Paper withBorder shadow="sm" radius="lg" p="xl" ta="center" style={{ borderTop: '4px solid var(--mantine-color-danger-6, var(--mantine-color-red-6))' }}>
              <Stack align="center" gap="xs">
                <ThemeIcon size={88} radius="xl" color="danger" variant="light">
                  <IconX size={52} stroke={3} />
                </ThemeIcon>
                <Title order={2} c="danger">Not verified</Title>
                <Text size="lg" c="dimmed">Do NOT release goods</Text>
              </Stack>
            </Paper>

            <Paper withBorder shadow="sm" radius="lg" p="lg">
              <Group align="flex-start" gap="sm" wrap="nowrap">
                <Box c="warning" style={{ display: 'flex', flexShrink: 0 }} mt={2}><IconAlertTriangle size={22} /></Box>
                <div>
                  <Text fw={600} mb={6}>Verification Failed</Text>
                  <Text size="sm" c="dimmed">{result.error}</Text>
                  <List size="sm" c="dimmed" mt="sm" spacing={4}>
                    <List.Item>Ask customer to show the receipt in their app</List.Item>
                    <List.Item>Re-enter transaction ID carefully</List.Item>
                    <List.Item>Contact merchant if issue persists</List.Item>
                  </List>
                </div>
              </Group>
            </Paper>

            <Group grow gap="sm">
              <Button variant="default" radius="md" size="md" leftSection={<IconRefresh size={18} />} onClick={handleRefresh}>
                Retry
              </Button>
              <Button radius="md" size="md" onClick={() => router.push('/verify/receipt')}>
                New Lookup
              </Button>
            </Group>
          </Stack>
        )}

        {/* No Transaction ID */}
        {!loading && !transactionId && (
          <Stack align="center" gap="sm">
            <Box c="dimmed" style={{ display: 'flex' }}><IconReceipt size={64} stroke={1.5} /></Box>
            <Text c="dimmed">No transaction ID provided</Text>
            <Button radius="md" onClick={() => router.push('/verify/receipt')}>
              Enter Transaction ID
            </Button>
          </Stack>
        )}

        {/* Footer */}
        <Stack gap={2} align="center" mt="lg">
          <Text size="xs" c="dimmed">
            Secured by <Text span size="xs" fw={600} c="var(--mantine-color-text)">{PRODUCT_NAME}</Text>
          </Text>
          <Text size="xs" c="dimmed">{new Date().toLocaleString()}</Text>
        </Stack>
      </Stack>
    </Layout>
  )
}
