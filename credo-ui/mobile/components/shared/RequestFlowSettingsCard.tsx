import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Center, Group, Loader, NumberInput, Paper, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import api from '@/lib/api';
import { getPreferredToken } from '@/lib/auth';
import {
  financeApprovalOf,
  requestFlowStepsLine,
  requestFlowThenLine,
  sameFinanceApproval,
  staffCardDefaultLine,
  stepsForFinance,
  withFinance,
  type FinanceApproval,
  type RequestFlow,
} from '../../../shared/requestFlowSettings';

/** "Who approves requests" — the approvals of each kind of request members can raise. */
export default function RequestFlowSettingsCard({ orgTenantId, canEdit }: { orgTenantId: string | null; canEdit: boolean }) {
  const [flows, setFlows] = useState<RequestFlow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FinanceApproval>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const headers = () => {
    const token = getPreferredToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const load = useCallback(async () => {
    if (!orgTenantId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/request-flows`, { headers: headers() });
      const list: RequestFlow[] = Array.isArray(res.data?.flows) ? res.data.flows : [];
      setFlows(list);
      setDrafts(Object.fromEntries(list.map((flow) => [flow.requestType, financeApprovalOf(flow)])));
    } catch {
      setFlows(null);
    } finally {
      setLoading(false);
    }
  }, [orgTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (flow: RequestFlow) => {
    if (!orgTenantId) return;
    const draft = drafts[flow.requestType] || financeApprovalOf(flow);
    setSaving(flow.requestType);
    try {
      const res = await api.put(
        `/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/request-flows/steps`,
        { requestType: flow.requestType, steps: stepsForFinance(draft) },
        { headers: headers() },
      );
      const updated = res.data as RequestFlow;
      setFlows((current) => (current || []).map((entry) => (entry.requestType === flow.requestType ? updated : entry)));
      setDrafts((current) => ({ ...current, [flow.requestType]: financeApprovalOf(updated) }));
      notifications.show({ title: 'Saved', message: `${flow.label}: ${requestFlowStepsLine(updated)}`, color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Paper id="org-card-request-flows" p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Box>
          <Text fw={700}>Who approves requests</Text>
          <Text size="xs" c="dimmed" mt={4}>
            The usual approver decides first. Finance can approve next, for every request or from an amount up. An
            approval set to need the staff card is decided only by sharing it from the wallet, with the request and
            amount on the share screen. Who the approvers are is set in Who does what.
          </Text>
        </Box>
        {!canEdit && (
          <Alert variant="light" color="yellow"><Text size="xs">Only an owner or admin can change these.</Text></Alert>
        )}
        {loading && !flows ? (
          <Center py="xs"><Loader size="sm" /></Center>
        ) : !flows ? (
          <Text size="xs" c="dimmed">Appears after selecting an organisation.</Text>
        ) : flows.length === 0 ? (
          <Text size="xs" c="dimmed">No staff requests are switched on in setup.</Text>
        ) : (
          <Stack gap="xs">
            {flows.map((flow) => {
              const draft = drafts[flow.requestType] || financeApprovalOf(flow);
              const changed = !sameFinanceApproval(draft, financeApprovalOf(flow));
              const thenLine = requestFlowThenLine(flow);
              const busy = !canEdit || saving === flow.requestType;
              return (
                <Paper key={flow.requestType} p="xs" radius="sm" withBorder>
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="nowrap" align="start">
                      <Box>
                        <Group gap={6}>
                          <Text size="sm" fw={600}>{flow.label}</Text>
                          {flow.customised && <Badge size="xs" variant="light">Own steps</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">{requestFlowStepsLine(flow)}</Text>
                        {thenLine && <Text size="xs" c="dimmed">{thenLine}</Text>}
                      </Box>
                    </Group>
                    <Switch
                      size="md"
                      style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}
                      label="Usual approver needs the staff card"
                      checked={Boolean(draft.reviewCard)}
                      disabled={busy}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [flow.requestType]: { ...draft, reviewCard: event.currentTarget.checked } }))
                      }
                    />
                    {!draft.reviewCard && <Text size="xs" c="dimmed">{staffCardDefaultLine(flow)}</Text>}
                    <Switch
                      size="md"
                      style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}
                      label="Finance approves too"
                      checked={draft.on}
                      disabled={busy}
                      onChange={(event) =>
                        setDrafts((current) => ({ ...current, [flow.requestType]: withFinance(draft, event.currentTarget.checked) }))
                      }
                    />
                    {draft.on && (
                      <Switch
                        size="md"
                        style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}
                        label="Finance needs the staff card"
                        checked={Boolean(draft.financeCard)}
                        disabled={busy}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [flow.requestType]: { ...draft, financeCard: event.currentTarget.checked } }))
                        }
                      />
                    )}
                    {draft.on && (
                      <NumberInput
                        size="xs"
                        label="Only from this amount"
                        placeholder="Every request"
                        min={0}
                        decimalScale={2}
                        value={draft.amountAtLeast ?? ''}
                        disabled={busy}
                        onChange={(value) =>
                          setDrafts((current) => ({
                            ...current,
                            [flow.requestType]: { ...draft, amountAtLeast: value === '' ? undefined : Number(value) },
                          }))
                        }
                      />
                    )}
                    {changed && (
                      <Button size="xs" loading={saving === flow.requestType} disabled={!canEdit} onClick={() => void save(flow)}>
                        Save
                      </Button>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
