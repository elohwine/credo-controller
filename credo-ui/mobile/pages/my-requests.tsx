import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Text, Title, Badge, Paper, Group, Button, Skeleton, ThemeIcon, Divider
} from '@mantine/core';
import {
  IconClock, IconCheck, IconX, IconAlertCircle, IconFileText, IconBuilding, IconChevronRight
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import EmptyState from '@/components/shared/EmptyState';
import { getWalletToken, isAuthenticated } from '@/lib/auth';
import api from '@/lib/api';
import { formatCredentialType } from '@/lib/format';

interface VcRequest {
  id: string;
  vcType: string;
  orgName: string;
  orgId: string;
  status: string;
  requestPayload: Record<string, any>;
  feeAmount?: number;
  feeCurrency?: string;
  estimatedCompletion?: string;
  credentialId?: string;
  credentialOfferUrl?: string;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  issuedAt?: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: any }> = {
  pending: { color: 'yellow', label: 'Pending Review', icon: IconClock },
  submitted: { color: 'blue', label: 'Submitted', icon: IconClock },
  under_review: { color: 'cyan', label: 'Under Review', icon: IconClock },
  approved: { color: 'green', label: 'Approved', icon: IconCheck },
  issued: { color: 'green', label: 'Issued', icon: IconCheck },
  rejected: { color: 'red', label: 'Rejected', icon: IconX },
  failed: { color: 'red', label: 'Failed', icon: IconAlertCircle },
  expired: { color: 'gray', label: 'Expired', icon: IconAlertCircle },
};

function RequestCard({ request, onClick }: { request: VcRequest; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const Icon = statusConfig.icon;

  return (
    <Paper p="md" radius="md" withBorder onClick={onClick} style={{ cursor: 'pointer' }}>
      <Group wrap="nowrap">
        <ThemeIcon size="lg" radius="md" variant="light" color={statusConfig.color}>
          <Icon size={20} />
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>
              {formatCredentialType(request.vcType)}
            </Text>
            <Badge size="sm" variant="light" color={statusConfig.color}>
              {statusConfig.label}
            </Badge>
          </Group>
          <Group gap="xs" mt={4}>
            <IconBuilding size={12} color="#94a3b8" />
            <Text size="xs" c="dimmed" lineClamp={1}>
              {request.orgName}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Requested {new Date(request.createdAt).toLocaleDateString()}
          </Text>
        </Box>
        <IconChevronRight size={18} color="#94a3b8" />
      </Group>
    </Paper>
  );
}

export default function MyRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<VcRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/my-requests');
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    loadRequests();
  }, [checkingAuth]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const token = getWalletToken();
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await api.get('/api/vc-requests/outbound', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRequests(response.data?.requests || []);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewRequest = (request: VcRequest) => {
    // If issued, navigate to inbox to accept the offer
    if (request.status === 'issued' && request.credentialOfferUrl) {
      router.push('/inbox');
    } else if (request.status === 'issued' || request.status === 'approved') {
      // Completed request — view audit trail for the credential
      router.push(`/activity?ref=${encodeURIComponent(request.id)}`);
    } else {
      // Otherwise show the organization profile
      router.push(`/organizations/${request.orgId}`);
    }
  };

  if (checkingAuth || loading) {
    return (
      <AppShellMobile>
        <Box p="md">
          <Skeleton height={40} mb="md" />
          <Skeleton height={100} mb="sm" />
          <Skeleton height={100} mb="sm" />
          <Skeleton height={100} />
        </Box>
      </AppShellMobile>
    );
  }

  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'submitted' || r.status === 'under_review'
  );
  const completedRequests = requests.filter(
    (r) => r.status === 'approved' || r.status === 'issued'
  );
  const otherRequests = requests.filter(
    (r) => r.status === 'rejected' || r.status === 'failed' || r.status === 'expired'
  );

  return (
    <AppShellMobile>
      <Box>
        {/* Header */}
        <Box
          p="md"
          style={{
            background: 'rgba(255,255,255,0.74)',
            borderBottom: '1px solid rgba(148,163,184,0.2)',
            backdropFilter: 'blur(12px) saturate(150%)',
          }}
        >
          <Title order={3}>My Requests</Title>
          <Text size="sm" c="dimmed">
            Track your credential requests
          </Text>
        </Box>

        {/* Content */}
        {requests.length === 0 ? (
          <Box p="md">
            <EmptyState
              icon={<IconFileText size={26} />}
              title="No Requests Yet"
              description="Browse organizations and request credentials to see them here"
            />
            <Group justify="center" mt="sm">
              <Button onClick={() => router.push('/organizations')}>
                Discover Organizations
              </Button>
            </Group>
          </Box>
        ) : (
          <Stack gap="md" p="md">
            {/* Pending Section */}
            {pendingRequests.length > 0 && (
              <Box>
                <Text size="sm" fw={600} mb="sm" c="dimmed">
                  PENDING ({pendingRequests.length})
                </Text>
                <Stack gap="sm">
                  {pendingRequests.map((request) => (
                    <RequestCard key={request.id} request={request} onClick={() => viewRequest(request)} />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Completed Section */}
            {completedRequests.length > 0 && (
              <Box>
                {pendingRequests.length > 0 && <Divider my="md" />}
                <Text size="sm" fw={600} mb="sm" c="dimmed">
                  COMPLETED ({completedRequests.length})
                </Text>
                <Stack gap="sm">
                  {completedRequests.map((request) => (
                    <RequestCard key={request.id} request={request} onClick={() => viewRequest(request)} />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Other Section */}
            {otherRequests.length > 0 && (
              <Box>
                {(pendingRequests.length > 0 || completedRequests.length > 0) && <Divider my="md" />}
                <Text size="sm" fw={600} mb="sm" c="dimmed">
                  OTHER ({otherRequests.length})
                </Text>
                <Stack gap="sm">
                  {otherRequests.map((request) => (
                    <RequestCard key={request.id} request={request} onClick={() => viewRequest(request)} />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}

        {/* Bottom Padding */}
        <Box style={{ height: 80 }} />
      </Box>
    </AppShellMobile>
  );
}
