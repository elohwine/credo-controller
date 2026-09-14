import React, { useState, useCallback } from 'react';
import {
  Stack, Title, Text, Box, Group, Badge, Card, Center, Loader, Paper,
  TextInput, Button, Progress, ThemeIcon, Divider, Alert,
} from '@mantine/core';
import {
  IconShieldCheck, IconSearch, IconAlertTriangle,
  IconStar, IconExternalLink,
} from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api from '@/lib/api';
import { getPreferredToken } from '@/lib/auth';
import { useRouter } from 'next/router';

interface TrustDriver {
  name: string;
  score: number;
  weight: number;
  icon?: string;
}

interface TrustScore {
  merchantId: string;
  score: number;
  badge: string;
  drivers: TrustDriver[];
}

const BADGE_COLOR: Record<string, string> = {
  gold: 'yellow',
  silver: 'gray',
  bronze: 'orange',
  verified: 'teal',
  pending: 'blue',
  flagged: 'red',
};

export default function TrustPage() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState('');
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrust = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setTrustScore(null);
    try {
      const token = getPreferredToken();
      const res = await api.get(`/api/trust/${encodeURIComponent(id.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setTrustScore(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Could not load trust score');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = () => void fetchTrust(merchantId);

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={80}>
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>Trust &amp; Compliance</Title>
            <Text size="sm" c="dimmed">Look up org trust scores and flag compliance concerns.</Text>
          </Box>
          <ThemeIcon size="xl" radius="xl" variant="light" color="teal">
            <IconShieldCheck size={22} />
          </ThemeIcon>
        </Group>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="sm">
            <Text size="sm" fw={600}>Trust Score Lookup</Text>
            <Group align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                label="Merchant / Org ID"
                placeholder="merchant-001 or org tenant ID"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button leftSection={<IconSearch size={16} />} onClick={handleSearch} loading={loading}>
                Lookup
              </Button>
            </Group>
          </Stack>
        </Paper>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>{error}</Alert>
        )}

        {loading && <Center py="xl"><Loader /></Center>}

        {trustScore && (
          <Stack gap="md">
            <Card withBorder radius="md" p="lg">
              <Group justify="space-between" align="flex-start" mb="md">
                <Box>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Trust Score</Text>
                  <Text fw={900} size="xl" style={{ fontSize: 48, lineHeight: 1 }}>{trustScore.score}</Text>
                  <Text size="xs" c="dimmed" mt={4}>{trustScore.merchantId}</Text>
                </Box>
                <Badge
                  size="lg"
                  color={BADGE_COLOR[trustScore.badge?.toLowerCase()] || 'blue'}
                  variant="light"
                  leftSection={<IconStar size={14} />}
                >
                  {(trustScore.badge || 'N/A').toUpperCase()}
                </Badge>
              </Group>

              <Progress
                value={trustScore.score}
                size="lg"
                radius="xl"
                color={trustScore.score >= 80 ? 'teal' : trustScore.score >= 60 ? 'yellow' : 'red'}
                mb="md"
              />

              {trustScore.drivers?.length > 0 && (
                <>
                  <Divider label="Score Breakdown" labelPosition="left" mb="sm" />
                  <Stack gap="xs">
                    {trustScore.drivers.map((driver, idx) => (
                      <Box key={idx}>
                        <Group justify="space-between" mb={4}>
                          <Text size="xs" fw={600}>{driver.name}</Text>
                          <Group gap={4}>
                            <Text size="xs" fw={700} c={driver.score >= 70 ? 'teal' : driver.score >= 40 ? 'yellow' : 'red'}>
                              {driver.score}
                            </Text>
                            <Text size="xs" c="dimmed">· weight {driver.weight}%</Text>
                          </Group>
                        </Group>
                        <Progress
                          value={driver.score}
                          size="xs"
                          color={driver.score >= 70 ? 'teal' : driver.score >= 40 ? 'yellow' : 'red'}
                        />
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
            </Card>

            <Paper p="md" radius="md" withBorder>
              <Text size="sm" fw={600} mb="sm">Actions</Text>
              <Stack gap="xs">
                <Button
                  variant="light"
                  color="blue"
                  size="sm"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={() => router.push(`/activity?ref=${encodeURIComponent(trustScore.merchantId)}`)}
                >
                  View Audit Trail
                </Button>
                <Button
                  variant="light"
                  color="red"
                  size="sm"
                  leftSection={<IconAlertTriangle size={14} />}
                  onClick={() => {
                    const subject = encodeURIComponent(`Trust concern: ${trustScore.merchantId}`);
                    const body = encodeURIComponent(`I am reporting a compliance concern for merchant ${trustScore.merchantId}.`);
                    window.open(`mailto:compliance@credentis.io?subject=${subject}&body=${body}`, '_blank');
                  }}
                >
                  Report Compliance Concern
                </Button>
              </Stack>
            </Paper>
          </Stack>
        )}

        {!loading && !trustScore && !error && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <ThemeIcon size={56} radius="xl" variant="light" color="teal">
                <IconShieldCheck size={28} />
              </ThemeIcon>
              <Text fw={600} c="dimmed">Enter a merchant or org ID above</Text>
              <Text size="sm" c="dimmed" ta="center">Trust scores are computed from payment history, VC verification activity, and compliance records.</Text>
            </Stack>
          </Center>
        )}
      </Stack>
    </AppShellMobile>
  );
}
