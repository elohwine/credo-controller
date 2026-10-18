import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Container, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'

import RecordCheckPanel from '@/components/records/RecordCheckPanel'

/**
 * The public check. Anyone can paste a reference from a record issued here; no sign-in.
 * A short link lands here as `?id=`, and the same panel checks it straight away.
 * The signed-in apps (Home and a record's own details) use the same panel and the same words.
 */
export default function VerifyPage() {
  const router = useRouter()
  const fromLink = typeof router.query.id === 'string' ? router.query.id : ''
  const [reference, setReference] = useState('')
  const [checking, setChecking] = useState('')

  useEffect(() => {
    if (fromLink) setChecking(fromLink)
  }, [fromLink])

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Check a record</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Anyone can check a record issued here. Paste the reference from the record. No sign-in is needed.
          </Text>
        </div>
        <Paper withBorder p="lg" radius="md">
          {checking ? (
            <Stack>
              <RecordCheckPanel presetReference={checking} />
              <Group justify="flex-end">
                <Button variant="subtle" size="xs" onClick={() => { setChecking(''); setReference('') }}>
                  Check another
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack>
              <TextInput
                label="Record reference"
                placeholder="Paste the reference"
                value={reference}
                onChange={(event) => setReference(event.currentTarget.value)}
              />
              <Button disabled={!reference.trim()} onClick={() => setChecking(reference.trim())}>
                Check it is still valid
              </Button>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Container>
  )
}
