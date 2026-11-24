import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { Box, Button, Group, Paper, Stack, Text, TextInput, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { 
  IconReceipt, 
  IconSearch,
  IconCamera,
  IconShieldCheck,
  IconTruck
} from '@tabler/icons-react'
import { PRODUCT_NAME } from '@/utils/orgProfile'

export default function ReceiptVerificationIndex() {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const [recentVerifications, setRecentVerifications] = useState<string[]>([])

  // Load recent verifications from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentVerifications')
    if (stored) {
      try {
        setRecentVerifications(JSON.parse(stored).slice(0, 5))
      } catch (e) {}
    }
  }, [])

  const handleSearch = () => {
    if (searchInput.trim()) {
      // Save to recent
      const updated = [searchInput.trim(), ...recentVerifications.filter(r => r !== searchInput.trim())].slice(0, 5)
      setRecentVerifications(updated)
      localStorage.setItem('recentVerifications', JSON.stringify(updated))
      
      router.push(`/verify/receipt/${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleRecent = (ref: string) => {
    router.push(`/verify/receipt/${encodeURIComponent(ref)}`)
  }

  return (
    <Layout>
      <Stack align="center" justify="center" gap="lg" p="md" mih="calc(100vh - 8rem)">

        {/* Hero */}
        <Stack align="center" gap={6} ta="center">
          <ThemeIcon size={72} radius="lg" variant="light" mb="xs">
            <IconTruck size={38} />
          </ThemeIcon>
          <Title order={2}>Delivery Verification</Title>
          <Text c="dimmed">Verify payment before releasing goods</Text>
        </Stack>

        {/* Main Search */}
        <Stack w="100%" maw={448} gap="lg">
          <Paper withBorder shadow="sm" radius="lg" p="lg">
            <TextInput
              label="Transaction ID / Reference"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="INV-XXXXXXXX"
              size="lg"
              radius="md"
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', textAlign: 'center', fontSize: 'var(--mantine-font-size-xl)' } }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={!searchInput.trim()}
              fullWidth
              size="lg"
              radius="md"
              mt="md"
              leftSection={<IconSearch size={22} />}
            >
              Verify payment
            </Button>
          </Paper>

          {/* QR Scan Option - Coming Soon */}
          {/* 
          <Button variant="default" fullWidth size="lg" onClick={() => router.push('/verify/scan')} leftSection={<IconCamera size={24} />}>
            Scan QR Code Instead
          </Button>
           */}

          {/* Recent Verifications */}
          {recentVerifications.length > 0 && (
            <Paper radius="md" p="md" bg="var(--mantine-color-default-hover)">
              <Text size="sm" fw={500} c="dimmed" mb="sm">Recent</Text>
              <Stack gap="xs">
                {recentVerifications.map((ref, idx) => (
                  <UnstyledButton key={idx} onClick={() => handleRecent(ref)}>
                    <Paper withBorder radius="md" px="md" py="sm">
                      <Text ff="monospace" size="sm">{ref}</Text>
                    </Paper>
                  </UnstyledButton>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>

        {/* Trust Badge */}
        <Group gap={6} mt="lg">
          <Box c="dimmed" style={{ display: 'flex' }}><IconShieldCheck size={18} /></Box>
          <Text size="sm" c="dimmed">Secured by <Text span fw={600} c="var(--mantine-color-text)">{PRODUCT_NAME}</Text></Text>
        </Group>
      </Stack>
    </Layout>
  )
}
