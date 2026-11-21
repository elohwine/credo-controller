import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Badge, Button, Image, Paper, Stack, Text, Title } from '@mantine/core'

import AppShellMobile from '@/components/layout/AppShellMobile'
import { API_BASE_URL } from '@/lib/api'

interface PublicJob {
  organisation: string
  reference: string
  storeNumber?: string
  description: string
  location?: string
  scheduledDate?: string
  status: string
  steps: Array<{ label: string; done: boolean; at?: string }>
  workerName?: string
  photos: { before: string[]; after: string[] }
  signature?: { signerName: string; signerRole?: string; signedAt: string; imageDataUrl: string }
  bills: Array<{ kind: 'quote' | 'invoice'; amount: number; currency: string; status: string; payUrl?: string }>
}

/** A client follows one job from the link the office sent. No account. */
export default function PublicJobPage() {
  const router = useRouter()
  const code = String(router.query.code || '')
  const [job, setJob] = useState<PublicJob | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) return
    fetch(`${API_BASE_URL}/api/public/job/${encodeURIComponent(code)}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok || !body.found) throw new Error(body.error || 'This link is not valid any more.')
        setJob(body.job)
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'This link is not valid any more.'))
  }, [code])

  return (
    <AppShellMobile>
      <Stack gap="md" p="md">
        {error && <Text>{error}</Text>}
        {job && (
          <>
            <div>
              <Text size="sm" c="dimmed">{job.organisation}</Text>
              <Title order={3} fw={500}>{job.reference}</Title>
              <Badge mt={6} variant="light">{job.status}</Badge>
            </div>
            <Text>{job.description}</Text>
            <Text size="sm" c="dimmed">
              {[job.storeNumber ? `Store ${job.storeNumber}` : '', job.location, job.scheduledDate, job.workerName ? `Worker: ${job.workerName}` : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Stack gap={6}>
              {job.steps.map((step) => (
                <Text key={step.label} size="sm">
                  {step.done ? 'Done' : 'Not yet'} · {step.label}
                </Text>
              ))}
            </Stack>
            {job.photos.before.map((src, index) => (
              <Image key={`b${index}`} src={src} alt={`Before photo ${index + 1}`} radius="md" />
            ))}
            {job.photos.after.map((src, index) => (
              <Image key={`a${index}`} src={src} alt={`After photo ${index + 1}`} radius="md" />
            ))}
            {job.signature && (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" mb={4}>Signed by {job.signature.signerName}{job.signature.signerRole ? `, ${job.signature.signerRole}` : ''}</Text>
                <img src={job.signature.imageDataUrl} alt="Signature" style={{ maxWidth: 280 }} />
              </Paper>
            )}
            {job.bills.map((bill, index) => (
              <Paper key={index} withBorder radius="md" p="md">
                <Text fw={500}>{bill.kind === 'quote' ? 'Quote' : 'Invoice'} · {bill.currency} {bill.amount.toFixed(2)}</Text>
                <Text size="sm" c="dimmed" mb="sm">{bill.status === 'paid' ? 'Paid' : 'Not paid yet'}</Text>
                {bill.payUrl && (
                  <Button component="a" href={bill.payUrl} radius="xl" style={{ minHeight: 48 }}>
                    {bill.kind === 'quote' ? 'View quote' : 'Pay'}
                  </Button>
                )}
              </Paper>
            ))}
          </>
        )}
      </Stack>
    </AppShellMobile>
  )
}
