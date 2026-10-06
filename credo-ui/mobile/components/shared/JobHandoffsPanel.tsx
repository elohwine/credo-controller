import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import api from '@/lib/api';
import { getPreferredToken } from '@/lib/auth';

// Mirrors WorkflowHandoffService.RunHandoffsView (same as portal JobHandoffsPanel).
type Field = { name: string; label: string; type: 'text' | 'number'; required?: boolean };
type Available = { key: string; label: string; description: string; holdParent: boolean; startMode: 'auto' | 'manual'; fields: Field[] };
type Link = { id: string; key: string; label: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; holdParent: boolean };
type View = { available: Available[]; active: Link[]; waitingFor: Link[] };

const STATUS_LABEL: Record<Link['status'], string> = { running: 'In progress', completed: 'Done', failed: 'Declined', cancelled: 'Cancelled' };
const STATUS_COLOR: Record<Link['status'], string> = { running: 'blue', completed: 'teal', failed: 'red', cancelled: 'gray' };

/** Work this job led to, and what the worker or admin can start from it right now. */
export default function JobHandoffsPanel({ runId, refreshKey, onChanged, onHoldChange }: {
  runId: string;
  refreshKey?: string;
  onChanged?: () => void;
  /** Tells the parent whether the job is currently waiting on related work (so step buttons can be disabled). */
  onHoldChange?: (held: boolean) => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onHoldChangeRef = useRef(onHoldChange);
  onHoldChangeRef.current = onHoldChange;

  const headers = () => {
    const token = getPreferredToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await api.get(`/workflows/runs/${encodeURIComponent(runId)}/handoffs`, { headers: headers() });
      const next: View | null = res.data && Array.isArray(res.data.available) ? res.data : null;
      setView(next);
      onHoldChangeRef.current?.(Boolean(next && next.waitingFor.length > 0));
    } catch {
      setView(null);
      onHoldChangeRef.current?.(false);
    }
  }, [runId]);

  // Reload whenever the job moves to another step so newly unlocked hand-offs show up.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const start = async (item: Available) => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post(`/workflows/runs/${encodeURIComponent(runId)}/handoffs`, { key: item.key, input: values }, { headers: headers() });
      if (res.data?.error) throw new Error(res.data.error);
      notifications.show({
        title: `${item.label} started`,
        message: item.holdParent ? 'This job continues when it is done.' : 'It is now with the right person.',
        color: 'green',
      });
      setOpenKey(null);
      setValues({});
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Could not start this');
    } finally {
      setStarting(false);
    }
  };

  if (!view || (view.available.length === 0 && view.active.length === 0)) return null;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Text size="sm" fw={700}>Related work</Text>
        {view.waitingFor.length > 0 && (
          <Alert color="orange" variant="light">
            <Text size="xs">
              This job is waiting for {view.waitingFor.map((link) => link.label.toLowerCase()).join(' and ')}. It continues when that is done.
            </Text>
          </Alert>
        )}
        {view.active.map((link) => (
          <Group key={link.id} justify="space-between">
            <Text size="sm">{link.label}</Text>
            <Badge size="sm" color={STATUS_COLOR[link.status]} variant="light">{STATUS_LABEL[link.status]}</Badge>
          </Group>
        ))}
        {view.available.map((item) =>
          openKey === item.key ? (
            <Paper key={item.key} p="xs" radius="sm" withBorder>
              <Stack gap={6}>
                <Text size="sm" fw={600}>{item.label}</Text>
                <Text size="xs" c="dimmed">{item.description}</Text>
                {item.fields.map((field) =>
                  field.type === 'number' ? (
                    <NumberInput
                      key={field.name}
                      size="sm"
                      label={field.label}
                      required={field.required}
                      min={0}
                      value={values[field.name] as number | undefined}
                      onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    />
                  ) : (
                    <TextInput
                      key={field.name}
                      size="sm"
                      label={field.label}
                      required={field.required}
                      value={String(values[field.name] ?? '')}
                      onChange={(event) => {
                        const next = event.currentTarget.value;
                        setValues((current) => ({ ...current, [field.name]: next }));
                      }}
                    />
                  ),
                )}
                {error && <Text size="xs" c="red">{error}</Text>}
                <Group gap="xs" grow>
                  <Button size="sm" loading={starting} onClick={() => start(item)}>Start</Button>
                  <Button size="sm" variant="subtle" onClick={() => { setOpenKey(null); setError(null); }}>Cancel</Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            <Button key={item.key} size="sm" variant="light" fullWidth onClick={() => { setOpenKey(item.key); setValues({}); setError(null); }}>
              {item.label}
            </Button>
          ),
        )}
      </Stack>
    </Paper>
  );
}
