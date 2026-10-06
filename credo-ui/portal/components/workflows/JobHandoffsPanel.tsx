import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Alert, Badge, Button, Card, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconHourglass } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';

// Mirrors WorkflowHandoffService.RunHandoffsView
type Field = { name: string; label: string; type: 'text' | 'number'; required?: boolean };
type Available = { key: string; label: string; description: string; holdParent: boolean; startMode: 'auto' | 'manual'; fields: Field[] };
type Link = { id: string; key: string; label: string; status: 'running' | 'completed' | 'failed' | 'cancelled'; holdParent: boolean; startedAt?: string };
type View = { available: Available[]; active: Link[]; waitingFor: Link[] };

const STATUS_LABEL: Record<Link['status'], string> = {
    running: 'In progress',
    completed: 'Done',
    failed: 'Declined',
    cancelled: 'Cancelled',
};
const STATUS_COLOR: Record<Link['status'], string> = { running: 'blue', completed: 'teal', failed: 'red', cancelled: 'gray' };

/**
 * Work this job led to (a quote for extra work, buying materials) and what it can start now.
 * Only what the organization allows for the current step is offered.
 */
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

    const backend = ((typeof window !== 'undefined' && (window as any).__ENV?.NEXT_PUBLIC_VC_REPO) as string) || 'http://localhost:3000';
    const token = () => getOrgScopedToken() || getPreferredTenantToken();

    const load = useCallback(async () => {
        const t = token();
        if (!t || !runId) return;
        try {
            const { data } = await axios.get<View>(`${backend}/workflows/runs/${runId}/handoffs`, { headers: { Authorization: `Bearer ${t}` } });
            const next: View | null = data && Array.isArray((data as View).available) ? data : null;
            setView(next);
            onHoldChangeRef.current?.(Boolean(next && next.waitingFor.length > 0));
        } catch {
            setView(null);
            onHoldChangeRef.current?.(false);
        }
    }, [backend, runId]);

    // Reload whenever the job moves to another step so newly unlocked hand-offs show up.
    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    const start = async (item: Available) => {
        const t = token();
        if (!t) return;
        setStarting(true);
        setError(null);
        try {
            const { data } = await axios.post(
                `${backend}/workflows/runs/${runId}/handoffs`,
                { key: item.key, input: values },
                { headers: { Authorization: `Bearer ${t}`, 'x-idempotency-key': `handoff-${runId}-${item.key}-${JSON.stringify(values)}` } },
            );
            if (data?.error) throw new Error(data.error);
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
        <Card withBorder radius="md">
            <Text fw={600} mb="xs">Related work</Text>
            <Stack gap="sm">
                {view.waitingFor.length > 0 && (
                    <Alert color="orange" variant="light" icon={<IconHourglass size={16} />}>
                        This job is waiting for {view.waitingFor.map((link) => link.label.toLowerCase()).join(' and ')}. It continues when that is done.
                    </Alert>
                )}

                {view.active.map((link) => (
                    <Group key={link.id} justify="space-between">
                        <Text size="sm">{link.label}</Text>
                        <Badge color={STATUS_COLOR[link.status]} variant="light">{STATUS_LABEL[link.status]}</Badge>
                    </Group>
                ))}

                {view.available.map((item) => (
                    <Stack key={item.key} gap={6}>
                        {openKey === item.key ? (
                            <Card withBorder radius="sm" p="sm">
                                <Stack gap="xs">
                                    <Text size="sm" fw={600}>{item.label}</Text>
                                    <Text size="xs" c="dimmed">{item.description}</Text>
                                    {item.fields.map((field) =>
                                        field.type === 'number' ? (
                                            <NumberInput
                                                key={field.name}
                                                label={field.label}
                                                required={field.required}
                                                min={0}
                                                value={values[field.name] as number | undefined}
                                                onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                                            />
                                        ) : (
                                            <TextInput
                                                key={field.name}
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
                                    <Group gap="xs">
                                        <Button size="xs" loading={starting} onClick={() => start(item)}>Start</Button>
                                        <Button size="xs" variant="subtle" onClick={() => { setOpenKey(null); setError(null); }}>Cancel</Button>
                                    </Group>
                                </Stack>
                            </Card>
                        ) : (
                            <Button
                                size="xs"
                                variant="light"
                                rightSection={<IconArrowRight size={14} />}
                                onClick={() => { setOpenKey(item.key); setValues({}); setError(null); }}
                                style={{ alignSelf: 'flex-start' }}
                            >
                                {item.label}
                            </Button>
                        )}
                    </Stack>
                ))}
            </Stack>
        </Card>
    );
}
