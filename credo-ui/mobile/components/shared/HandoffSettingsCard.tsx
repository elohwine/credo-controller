import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Box, Center, Group, Loader, MultiSelect, Paper, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import api from '@/lib/api';
import { getPreferredToken } from '@/lib/auth';

// Mirrors WorkflowHandoffService.WorkflowHandoffSetting (same as portal /organization/handoffs).
type Handoff = {
  key: string;
  kind: 'job' | 'request';
  label: string;
  description: string;
  fromLabel: string;
  toLabel: string;
  holdParent: boolean;
  startMode: 'auto' | 'manual';
  requiredStages: string[];
  stageOptions: Array<{ id: string; label: string }>;
  enabled: boolean;
  conditionLabel: string;
};

/** "What happens next" — when one piece of work leads to another. */
export default function HandoffSettingsCard({ orgTenantId, canEdit }: { orgTenantId: string | null; canEdit: boolean }) {
  const [handoffs, setHandoffs] = useState<Handoff[] | null>(null);
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
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/handoffs`, { headers: headers() });
      setHandoffs(Array.isArray(res.data?.handoffs) ? res.data.handoffs : []);
    } catch {
      setHandoffs(null);
    } finally {
      setLoading(false);
    }
  }, [orgTenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (item: Handoff, patch: Partial<Pick<Handoff, 'startMode' | 'requiredStages' | 'enabled'>>) => {
    if (!orgTenantId) return;
    setSaving(item.key);
    try {
      const res = await api.put(
        `/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/handoffs/${encodeURIComponent(item.key)}`,
        patch,
        { headers: headers() },
      );
      setHandoffs((current) => (current || []).map((entry) => (entry.key === item.key ? { ...entry, ...res.data } : entry)));
      notifications.show({ title: 'Saved', message: item.label, color: 'green' });
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' });
    } finally {
      setSaving(null);
    }
  };

  const section = (title: string, items: Handoff[]) =>
    items.length === 0 ? null : (
      <Stack gap="xs">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">{title}</Text>
        {items.map((item) => (
          <Paper key={item.key} p="xs" radius="sm" withBorder>
            <Stack gap={6}>
              <Group justify="space-between" wrap="nowrap" align="start">
                <Box>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>{item.label}</Text>
                    {!item.enabled && <Badge size="xs" color="gray" variant="light">Off</Badge>}
                  </Group>
                  <Text size="xs" c="dimmed">{item.fromLabel} → {item.toLabel}</Text>
                </Box>
                <Switch
                  size="sm"
                  checked={item.enabled}
                  disabled={!canEdit || saving === item.key}
                  onChange={(event) => save(item, { enabled: event.currentTarget.checked })}
                  aria-label={`Use ${item.label}`}
                />
              </Group>
              <Text size="xs" c="dimmed">{item.conditionLabel}</Text>
              {item.enabled && (
                <>
                  <SegmentedControl
                    size="xs"
                    fullWidth
                    value={item.startMode}
                    disabled={!canEdit || saving === item.key}
                    onChange={(value) => save(item, { startMode: value as 'auto' | 'manual' })}
                    data={[
                      { value: 'auto', label: 'By itself' },
                      { value: 'manual', label: 'When someone asks' },
                    ]}
                  />
                  {item.kind === 'job' && (
                    <MultiSelect
                      size="xs"
                      label="Available after"
                      placeholder="Any time"
                      data={item.stageOptions.map((option) => ({ value: option.id, label: option.label }))}
                      value={item.requiredStages}
                      disabled={!canEdit || saving === item.key}
                      onChange={(value) => save(item, { requiredStages: value })}
                      clearable
                    />
                  )}
                  {item.holdParent && (
                    <Text size="xs" c="dimmed">The job waits while this is open and continues when it is done.</Text>
                  )}
                </>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );

  return (
    <Paper id="org-card-handoffs" p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Box>
          <Text fw={700}>What happens next</Text>
          <Text size="xs" c="dimmed" mt={4}>
            When a job or request leads to the next one.
          </Text>
        </Box>
        {!canEdit && (
          <Alert variant="light" color="yellow"><Text size="xs">Only an owner can change these.</Text></Alert>
        )}
        {loading && !handoffs ? (
          <Center py="xs"><Loader size="sm" /></Center>
        ) : !handoffs ? (
          <Text size="xs" c="dimmed">Appears after selecting an organisation.</Text>
        ) : (
          <Stack gap="md">
            {section('During a job', handoffs.filter((h) => h.kind === 'job'))}
            {section('After a request is approved', handoffs.filter((h) => h.kind === 'request'))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
