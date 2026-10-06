import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Modal, Stack, TextInput, Textarea, NumberInput, Select, Group, Button, Alert, Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';

interface Member { userId: string; role: string; displayName?: string; phone?: string; status?: string }
interface Contact { name: string; phone: string }

interface NewJobModalProps {
    opened: boolean;
    onClose: () => void;
    onCreated: (runId: string) => void;
}

const STAGE_ACTOR = 'stage-actor';

function backendUrl(): string {
    return ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
}

function personName(member: Member): string {
    const name = String(member.displayName || '').trim();
    const generic = !name || /^organization owner$/i.test(name);
    if (!generic) return name;
    if (member.phone) return member.phone;
    if (String(member.role || '').toLowerCase() === 'owner') return 'Organization owner';
    return `Team member · ${member.userId.slice(0, 6)}`;
}

function memberLabel(member: Member): string {
    const role = String(member.role || 'member').replace(/_/g, ' ');
    return `${personName(member)} (${role})`;
}

/**
 * Create a field job from the portal: who does the work, who signs it off, what and where.
 * Mirrors the mobile "New job" form so both surfaces send the same request.
 */
export default function NewJobModal({ opened, onClose, onCreated }: NewJobModalProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [loadingSetup, setLoadingSetup] = useState(false);
    const [setupError, setSetupError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        description: '',
        clientName: '',
        location: '',
        scheduledDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        amount: 0 as number | string,
        currency: 'USD',
        assigneeId: STAGE_ACTOR,
        receiverId: STAGE_ACTOR,
    });

    useEffect(() => {
        if (!opened) return;
        const org = readActiveOrganization();
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!org?.orgTenantId || !token) {
            setSetupError('Switch to the organization before creating a job.');
            return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const backend = backendUrl();
        setLoadingSetup(true);
        setSetupError(null);
        Promise.all([
            axios.get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, { headers }).catch(() => ({ data: [] })),
            axios.get(`${backend}/api/contacts`, { params: { contactScope: 'internal' }, headers }).catch(() => ({ data: [] })),
            axios.get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/workflows`, { headers }).catch(() => ({ data: {} })),
        ]).then(([membersRes, contactsRes, workflowsRes]) => {
            const memberRows = Array.isArray(membersRes.data) ? membersRes.data : [];
            setMembers(memberRows
                .filter((m: any) => m?.userId && m?.status !== 'inactive')
                .map((m: any) => ({ userId: String(m.userId), role: String(m.role || 'member'), displayName: m.displayName ? String(m.displayName) : undefined, status: m.status })));
            const contactRows = Array.isArray(contactsRes.data?.contacts) ? contactsRes.data.contacts : Array.isArray(contactsRes.data) ? contactsRes.data : [];
            setContacts(contactRows.filter((c: any) => c?.phone).map((c: any) => ({ name: String(c.name || 'Contact'), phone: String(c.phone) })));
            const templates = Array.isArray(workflowsRes.data?.templates) ? workflowsRes.data.templates : [];
            const fept = templates.find((t: any) => String(t?.workflowType || '').toLowerCase() === 'field_execution_fept')
                || templates.find((t: any) => /fept|field/.test(String(t?.id || t?.workflowType || '').toLowerCase()));
            // A saved template row is optional. The first job can run from the answers.
            setTemplateId(fept?.id ? String(fept.id) : 'field_execution_fept');
        }).finally(() => setLoadingSetup(false));
    }, [opened]);

    const peopleOptions = useMemo(() => {
        const memberOptions = members.map((m) => ({ value: m.userId, label: memberLabel(m) }));
        const contactOptions = contacts.map((c) => ({ value: `contact:${c.phone}`, label: `${c.name} (saved contact)` }));
        return [...memberOptions, ...contactOptions];
    }, [members, contacts]);

    const ensureOnTeam = async (selection: string, role: string, headers: Record<string, string>) => {
        if (!selection || selection === STAGE_ACTOR) return undefined;
        if (!selection.startsWith('contact:')) return selection;
        const org = readActiveOrganization();
        if (!org?.orgTenantId) throw new Error('Switch to the organization before creating a job.');
        const res = await axios.post(
            `${backendUrl()}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members/invite`,
            { phone: selection.slice('contact:'.length), role },
            { headers },
        );
        const userId = String(res.data?.targetUserId || '').trim();
        if (!userId) throw new Error('That contact could not be added to the team.');
        return userId;
    };

    const handleCreate = async () => {
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!token || !templateId) return;
        const amount = Number(form.amount);
        if (!form.description.trim()) {
            notifications.show({ title: 'Describe the work', message: 'Say what needs to be done on site.', color: 'orange' });
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            notifications.show({ title: 'Add the job value', message: 'Enter the amount to be paid for this job.', color: 'orange' });
            return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        setSaving(true);
        try {
            const assigneeUserId = await ensureOnTeam(form.assigneeId, 'field_worker', headers);
            const receiverUserId = await ensureOnTeam(form.receiverId, 'member', headers);
            const ref = `FR-${Date.now()}`;
            const body: Record<string, unknown> = {
                amount,
                currency: form.currency,
                description: form.description.trim(),
                clientName: form.clientName.trim(),
                location: form.location.trim(),
                scheduledDate: form.scheduledDate,
                reference: ref,
                poNumber: ref,
                requestId: ref,
                triggerRef: `portal-job-${Date.now()}`,
            };
            if (assigneeUserId) {
                body.assigneeId = assigneeUserId;
                body.assigneeUserId = assigneeUserId;
            }
            if (receiverUserId) body.receiverId = receiverUserId;
            const res = await axios.post(`${backendUrl()}/workflows/${encodeURIComponent(templateId)}/execute`, body, { headers });
            if (res.data?.error) throw new Error(String(res.data.error));
            notifications.show({ title: 'Job created', message: 'The worker will see it in their inbox.', color: 'teal' });
            onCreated(String(res.data?.runId || ''));
            setForm((prev) => ({ ...prev, description: '', clientName: '', location: '', amount: 0 }));
            onClose();
        } catch (err: any) {
            notifications.show({
                title: 'Job not created',
                message: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Please try again.',
                color: 'red',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title="New job" size="lg" centered>
            <Stack gap="sm">
                {setupError && <Alert color="orange" variant="light">{setupError}</Alert>}
                <Textarea
                    label="What needs to be done"
                    placeholder="e.g. Fix window leak, Block B"
                    required
                    minRows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
                />
                <Group grow>
                    <TextInput label="Client / site name" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.currentTarget.value })} />
                    <TextInput label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.currentTarget.value })} />
                </Group>
                <Group grow>
                    <TextInput type="date" label="Scheduled date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.currentTarget.value })} />
                    <NumberInput label="Job value" min={0} value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
                    <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={form.currency} onChange={(value) => setForm({ ...form, currency: value || 'USD' })} />
                </Group>
                <Select
                    label="Who goes out"
                    description="The person who does this job. Saved contacts are added to the team."
                    searchable
                    data={[{ value: STAGE_ACTOR, label: 'Use the person already chosen' }, ...peopleOptions]}
                    value={form.assigneeId}
                    onChange={(value) => setForm({ ...form, assigneeId: value || STAGE_ACTOR })}
                />
                <Select
                    label="Who checks the work"
                    description="They review the finished work and confirm it."
                    searchable
                    data={[{ value: STAGE_ACTOR, label: 'Use the person already chosen' }, ...peopleOptions]}
                    value={form.receiverId}
                    onChange={(value) => setForm({ ...form, receiverId: value || STAGE_ACTOR })}
                />
                <Text size="xs" c="dimmed">Payment is released after sign-off by the person chosen for it under Who does what.</Text>
                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleCreate} loading={saving || loadingSetup} disabled={!templateId}>Create job</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
