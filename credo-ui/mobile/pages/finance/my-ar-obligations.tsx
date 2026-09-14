import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconArrowLeft, IconCheck, IconShieldCheck } from '@tabler/icons-react';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api, { safeArray } from '@/lib/api';
import { applyOrgContext, getActiveOrgId, getContextMode, getOrgToken, getPreferredToken, getWalletToken } from '@/lib/auth';

interface ArObligationRow {
  id: string;
  buyer_tenant_id?: string;
  collector_org_name?: string;
  debtor_org_id?: string;
  debtor_org_name?: string;
  description?: string;
  status?: string;
  trust_status?: string;
  total_amount?: number;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  next_due_date?: string | null;
  overdue_installments?: number;
  proof_request_id?: string | null;
  proof_response_id?: string | null;
  proof_presented_at?: string | null;
  receipt_vc_id?: string | null;
  receipt_issued_at?: string | null;
  required_action?: string | null;
  required_proof_type?: string | null;
  workflow_stage?: string | null;
  updated_at?: string;
  counterpartySettlement?: {
    settlementType?: string;
    direction?: string;
    sourceType?: string;
    sourcePlanId?: string;
    sourcePaymentLinkId?: string | null;
    workflow?: {
      transactionId?: string | null;
      status?: string | null;
      stage?: string | null;
      trustStatus?: string | null;
      requiredAction?: string | null;
      requiredProofType?: string | null;
    };
    apSide?: {
      invoiceId?: string | null;
    };
    links?: {
      arPlanPath?: string | null;
      apSupplierPath?: string | null;
    };
  };
}

function formatMoney(amount: unknown, currency = 'USD'): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '-';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${currency || 'USD'} ${numeric.toFixed(2)}`;
  }
}

function trustColor(trustStatus?: string): string {
  const status = String(trustStatus || '').toLowerCase();
  if (status === 'settled') return 'green';
  if (status === 'proof_presented') return 'indigo';
  if (status === 'disputed') return 'red';
  if (status === 'revoked') return 'orange';
  return 'blue';
}

function statusColor(status?: string): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'paid') return 'green';
  if (normalized === 'cancelled') return 'red';
  if (normalized === 'overdue') return 'orange';
  return 'gray';
}

function deriveProofStage(row: ArObligationRow): 'issued' | 'proof_requested' | 'proof_presented' | 'settled' {
  if (row.receipt_vc_id || String(row.trust_status || '').toLowerCase() === 'settled' || String(row.status || '').toLowerCase() === 'completed') {
    return 'settled';
  }
  if (row.proof_response_id || row.proof_presented_at || String(row.trust_status || '').toLowerCase() === 'proof_presented') {
    return 'proof_presented';
  }
  if (row.proof_request_id) {
    return 'proof_requested';
  }
  return 'issued';
}

function proofStageColor(stage: ReturnType<typeof deriveProofStage>): string {
  if (stage === 'settled') return 'green';
  if (stage === 'proof_presented') return 'indigo';
  if (stage === 'proof_requested') return 'orange';
  return 'blue';
}

function proofStageLabel(stage: ReturnType<typeof deriveProofStage>): string {
  if (stage === 'proof_requested') return 'Proof Requested';
  if (stage === 'proof_presented') return 'Proof Presented';
  if (stage === 'settled') return 'Settled';
  return 'Issued';
}

function ledgerLabel(value?: string | null, fallback = 'Pending'): string {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.replace(/_/g, ' ');
}

export default function MyArObligationsPage() {
  const router = useRouter();
  const orgTenantIdQuery = typeof router.query.orgTenantId === 'string' ? router.query.orgTenantId : undefined;

  const [rows, setRows] = useState<ArObligationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trustFilter, setTrustFilter] = useState<string>('all');

  const ensureOrgContext = useCallback(async (): Promise<string> => {
    const currentOrgId = getActiveOrgId();
    const currentMode = getContextMode();
    const currentOrgToken = getOrgToken();

    if (currentMode === 'org' && currentOrgToken && (!orgTenantIdQuery || currentOrgId === orgTenantIdQuery)) {
      return currentOrgToken;
    }

    const targetOrgId = orgTenantIdQuery || currentOrgId;
    if (!targetOrgId) {
      throw new Error('Select an organization context to view obligations.');
    }

    const holderToken = getWalletToken();
    if (!holderToken) {
      throw new Error('Missing personal wallet token for organization switch.');
    }

    const switchRes = await api.post(`/api/organizations/${encodeURIComponent(targetOrgId)}/switch`, {}, {
      headers: { Authorization: `Bearer ${holderToken}` },
      skipAuthRedirect: true as any,
    } as any);

    const orgToken = switchRes.data?.token as string | undefined;
    if (!orgToken) {
      throw new Error('Failed to establish organization context.');
    }

    applyOrgContext({
      orgId: targetOrgId,
      orgName: switchRes.data?.name || switchRes.data?.label || targetOrgId,
      orgToken,
      orgRole: switchRes.data?.orgRole,
      sector: switchRes.data?.sector,
      workflowTypes: switchRes.data?.workflowTypes,
    });

    return orgToken;
  }, [orgTenantIdQuery]);

  const fetchObligations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const orgScopedToken = await ensureOrgContext().catch(() => null);
      const walletToken = getWalletToken();
      const primaryToken = orgScopedToken || getPreferredToken() || walletToken;

      if (!primaryToken) {
        throw new Error('Missing wallet or organization session for AR obligations.');
      }

      const response = await api.get('/api/finance/ar/my-obligations', {
        headers: { Authorization: `Bearer ${primaryToken}` },
      });

      let obligations = safeArray(response.data?.obligations);

      // Current cross-org AR flows can bind debtor obligations to the acting wallet tenant
      // rather than the switched org tenant. When org-scoped lookup is empty, retry with the
      // personal wallet token so debtor-side obligations remain visible in mobile UI.
      if (obligations.length === 0 && walletToken && primaryToken !== walletToken) {
        const walletResponse = await api.get('/api/finance/ar/my-obligations', {
          headers: { Authorization: `Bearer ${walletToken}` },
        });
        obligations = safeArray(walletResponse.data?.obligations);
      }

      setRows(obligations as ArObligationRow[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load AR obligations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [ensureOrgContext]);

  useEffect(() => {
    void fetchObligations();
  }, [fetchObligations]);

  const filteredRows = useMemo(() => {
    if (trustFilter === 'all') return rows;
    return rows.filter((row) => String(row.counterpartySettlement?.workflow?.trustStatus || row.trust_status || '').toLowerCase() === trustFilter);
  }, [rows, trustFilter]);

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb="lg">
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>What I Owe</Title>
            <Text size="sm" c="dimmed">Debtor-side AR obligations with SSI trust and consent state</Text>
          </Box>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => router.push('/finance?tab=ar')}
          >
            Back to AR
          </Button>
        </Group>

        <Group grow>
          <Select
            label="Trust Status"
            value={trustFilter}
            onChange={(value) => setTrustFilter(value || 'all')}
            data={[
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'proof_presented', label: 'Proof Presented' },
              { value: 'settled', label: 'Settled' },
              { value: 'disputed', label: 'Disputed' },
              { value: 'revoked', label: 'Revoked' },
            ]}
          />
          <Button mt={24} variant="light" onClick={() => void fetchObligations()}>
            Refresh
          </Button>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : filteredRows.length === 0 ? (
          <Paper withBorder radius="md" p="md">
            <Text size="sm" c="dimmed">No AR obligations found for this organization.</Text>
          </Paper>
        ) : (
          <Stack gap="sm">
            {filteredRows.map((row) => {
              const trustStatus = String(row.counterpartySettlement?.workflow?.trustStatus || row.trust_status || 'pending').replace(/_/g, ' ');
              const workflowStage = String(row.counterpartySettlement?.workflow?.stage || row.workflow_stage || row.status || 'pending').replace(/_/g, ' ');
              const proofPresented = Boolean(row.proof_response_id || row.proof_presented_at);
              const proofStage = deriveProofStage(row);
              const settlement = row.counterpartySettlement;
              return (
                <Card key={row.id} withBorder radius="md" padding="md">
                  <Stack gap={8}>
                    <Group justify="space-between" align="flex-start">
                      <Box>
                        <Text fw={700}>{row.description || row.id}</Text>
                        <Text size="xs" c="dimmed">
                          Creditor: {row.collector_org_name || row.buyer_tenant_id || 'Unknown org'}
                        </Text>
                      </Box>
                      <Badge color={statusColor(row.status)} variant="light">
                        {String(row.status || 'pending').toUpperCase()}
                      </Badge>
                    </Group>

                    <Group gap="xs" wrap="wrap">
                      <Badge color={trustColor(row.trust_status)} variant="light">Trust: {trustStatus}</Badge>
                      <Badge color="gray" variant="light">Workflow: {workflowStage}</Badge>
                      <Badge color={proofStageColor(proofStage)} variant="outline">Flow: {proofStageLabel(proofStage)}</Badge>
                      {row.overdue_installments ? (
                        <Badge color="orange" variant="light">Overdue: {row.overdue_installments}</Badge>
                      ) : null}
                    </Group>

                    <Group justify="space-between" align="center">
                      <Text size="sm">Total: {formatMoney(row.total_amount, row.currency)}</Text>
                      <Text size="sm" c="teal">Due: {formatMoney(row.amount_due, row.currency)}</Text>
                    </Group>

                    {settlement && (
                      <Paper withBorder radius="md" p="sm">
                        <Stack gap={4}>
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">Counterpart Details</Text>
                          <Text size="xs">Status: {ledgerLabel(settlement.workflow?.stage || row.workflow_stage, 'Pending')}</Text>
                          <Text size="xs">Next step: {ledgerLabel(settlement.workflow?.requiredAction, 'None')}</Text>
                          {settlement.apSide?.invoiceId && (
                            <Text size="xs" c="dimmed">Invoice: {settlement.apSide.invoiceId}</Text>
                          )}
                        </Stack>
                      </Paper>
                    )}

                    <Divider />

                    <Stack gap={4}>
                      <Text size="xs" c="dimmed" fw={600}>Consent</Text>
                      {row.proof_request_id
                        ? <Text size="xs">Request: <Text span style={{ fontFamily: 'monospace' }}>{row.proof_request_id.substring(0, 20)}…</Text></Text>
                        : <Text size="xs" c="dimmed">Request: not issued</Text>}
                      {row.proof_response_id
                        ? <Text size="xs" c="indigo">Response: <Text span style={{ fontFamily: 'monospace' }}>{row.proof_response_id.substring(0, 20)}…</Text></Text>
                        : <Text size="xs" c="dimmed">Response: pending presentation</Text>}
                      {row.proof_presented_at && <Text size="xs" c="dimmed">Presented: {row.proof_presented_at}</Text>}
                    </Stack>

                    <Stack gap={4}>
                      <Text size="xs" c="dimmed" fw={600}>Credential Chain</Text>
                      {row.receipt_vc_id ? (
                        <Group justify="space-between" align="center">
                          <Text size="xs" c="teal">Receipt VC: <Text span style={{ fontFamily: 'monospace' }}>{row.receipt_vc_id.substring(0, 20)}…</Text></Text>
                          <Button
                            size="xs" variant="subtle" color="teal"
                            onClick={() => {
                              const params = new URLSearchParams({ tab: 'ar', planId: row.id, credentialId: row.receipt_vc_id!, credentialType: 'ReceiptVC' });
                              if (orgTenantIdQuery) params.set('orgTenantId', orgTenantIdQuery);
                              void router.push(`/finance?${params.toString()}`);
                            }}
                          >
                            Inspect
                          </Button>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed">Receipt VC: not issued yet</Text>
                      )}
                      {row.receipt_issued_at && <Text size="xs" c="dimmed">Issued: {row.receipt_issued_at}</Text>}
                    </Stack>

                    <Group grow>
                      {row.proof_request_id && !proofPresented ? (
                        <Button
                          size="sm"
                          variant="light"
                          color="indigo"
                          leftSection={<IconShieldCheck size={14} />}
                          onClick={() => {
                            const params = new URLSearchParams({ tab: 'ar', planId: row.id, focusProof: 'true' });
                            if (orgTenantIdQuery) params.set('orgTenantId', orgTenantIdQuery);
                            void router.push(`/finance?${params.toString()}`);
                          }}
                        >
                          Resume AR Consent Proof
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="light"
                        color="teal"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => {
                          const params = new URLSearchParams({ tab: 'ar', planId: row.id });
                          if (orgTenantIdQuery) params.set('orgTenantId', orgTenantIdQuery);
                          void router.push(`/finance?${params.toString()}`);
                        }}
                      >
                        Open AR Detail
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </AppShellMobile>
  );
}
