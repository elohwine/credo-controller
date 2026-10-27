import { useState, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext';
import FormCard from '@/components/shared/FormCard';
import { ContactPickerSelect, type PickerContact } from '@/components/finance/ContactPickerSelect';
import { useRequireOrgContext } from '@/lib/portalContext';
import {
    Container, Title, Text, Paper, Group, Stack, Button, NumberInput, Select, Textarea, TextInput, Divider
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconReceipt, IconShoppingCart } from '@tabler/icons-react';

export default function NewRequisitionPage() {
    // Org-only surface, like the requisition list and detail pages.
    useRequireOrgContext('/inbox');
    const env = useContext(EnvContext);
    const router = useRouter();
    const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        department: 'HR',
        payWith: 'supplier' as 'supplier' | 'cash',
        vendor: '',
        purchaseKind: 'goods' as 'goods' | 'service',
        receivingRequired: 'yes' as 'yes' | 'no',
        amount: '',
        currency: 'USD',
        description: '',
    });
    const [contacts, setContacts] = useState<PickerContact[]>([]);

    // Saved contacts, so the supplier field can be picked instead of typed.
    useEffect(() => {
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!token) return;
        void Promise.allSettled(
            (['external', 'internal'] as const).map((contactScope) =>
                axios.get(`${baseUrl}/api/contacts`, { headers: { Authorization: `Bearer ${token}` }, params: { contactScope } }).then((res) => {
                    const rows = Array.isArray(res.data?.contacts) ? res.data.contacts : Array.isArray(res.data) ? res.data : [];
                    return rows.map((c: any) => ({
                        id: String(c.id),
                        name: String(c.name || 'Unknown'),
                        phone: c.phone || undefined,
                        email: c.email || undefined,
                        contactScope,
                    })) as PickerContact[];
                }),
            ),
        ).then((results) => {
            const merged = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
            setContacts(Array.from(new Map(merged.map((contact) => [contact.id, contact])).values()));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseUrl]);

    const getToken = () =>
        typeof window !== 'undefined'
            ? getOrgScopedToken() || getPreferredTenantToken() || localStorage.getItem('walletToken')
            : null;

    const getTargetOrgTenantId = () => {
        if (typeof window === 'undefined') return null;
        try {
            const activeOrgRaw = localStorage.getItem('credoActiveOrg');
            if (activeOrgRaw) {
                const activeOrg = JSON.parse(activeOrgRaw) as { orgTenantId?: string; id?: string };
                return activeOrg.orgTenantId || activeOrg.id || localStorage.getItem('credoTenantId');
            }
        } catch {
            // fall through to tenant id fallback
        }
        return localStorage.getItem('credoTenantId');
    };

    const handleSubmit = async () => {
        const token = getToken();
        if (!token || !form.amount) return;
        setSubmitting(true);
        try {
            const parsedAmount = parseFloat(form.amount)
            const itemName = form.description?.trim() || form.vendor?.trim() || 'Requisition item'
            const created = await axios.post(
                `${baseUrl}/api/platform/requests/`,
                {
                    requestType: 'procurement.requisition',
                    title: itemName,
                    description: form.description || undefined,
                    amount: parsedAmount,
                    currency: form.currency,
                    targetModule: 'finance',
                    context: {
                        department: form.department,
                        supplierRef: form.payWith === 'cash' ? undefined : form.vendor,
                        paymentMethod: form.payWith === 'cash' ? 'cash' : 'supplier',
                        itemType: form.purchaseKind,
                        receivingRequired: form.receivingRequired === 'yes',
                    },
                    items: [
                        {
                            description: itemName,
                            unitPrice: parsedAmount,
                            quantity: 1,
                            itemType: form.purchaseKind,
                        },
                    ],
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await axios.post(
                `${baseUrl}/api/platform/requests/${encodeURIComponent(created.data.id)}/submit`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );

            notifications.show({
                title: 'Request sent',
                message: form.payWith === 'cash'
                    ? 'Your cash request is with the approvers. It is paid out when released.'
                    : 'Your request is with the approvers. A purchase order is created when it is approved.',
                color: 'green',
                icon: <IconCheck size={16} />
            });
            router.push(`/requests?tab=requisitions&request=${encodeURIComponent(created.data.id)}`);
        } catch (err: any) {
            notifications.show({
                title: 'Could not send this request',
                message: err?.response?.data?.error || err?.response?.data?.message || err.message,
                color: 'red',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Layout title="New purchase request">
            <Container size="sm" py="md">
                <FormCard
                    title="New purchase request"
                    subtitle="Ask for something to be bought. It goes to the person who approves purchases."
                    issuer={readActiveOrganization()?.name}
                    icon={<IconShoppingCart size={24} />}
                >
                        <Group grow>
                            <Select
                                label="Department"
                                data={['HR', 'IT', 'Operations', 'Procurement', 'Marketing']}
                                value={form.department}
                                onChange={(val) => setForm({ ...form, department: val || 'HR' })}
                                required
                            />
                            <Select
                                label="How will this be paid?"
                                data={[
                                    { value: 'supplier', label: 'Buy from a supplier (purchase order on approval)' },
                                    { value: 'cash', label: 'Cash or petty cash (paid out on release, no purchase order)' },
                                ]}
                                value={form.payWith}
                                onChange={(val) => setForm({ ...form, payWith: val === 'cash' ? 'cash' : 'supplier' })}
                                allowDeselect={false}
                                required
                            />
                        </Group>
                        <Group grow>
                            <Select
                                label="What are you buying?"
                                data={[{ value: 'goods', label: 'Goods or materials' }, { value: 'service', label: 'A service' }]}
                                value={form.purchaseKind}
                                onChange={(value) => setForm({ ...form, purchaseKind: value === 'service' ? 'service' : 'goods' })}
                            />
                            <Select
                                label={form.purchaseKind === 'goods' ? 'Confirm delivery before paying?' : 'Confirm the service before paying?'}
                                data={[{ value: 'yes', label: 'Yes, confirmation is required' }, { value: 'no', label: 'No separate confirmation' }]}
                                value={form.receivingRequired}
                                onChange={(value) => setForm({ ...form, receivingRequired: value === 'no' ? 'no' : 'yes' })}
                            />
                        </Group>

                        {form.payWith === 'supplier' && (
                            <>
                                <ContactPickerSelect
                                    contacts={contacts}
                                    requirePhone={false}
                                    label="Pick the supplier from contacts"
                                    onPick={(picked) => {
                                        if (picked) setForm((prev) => ({ ...prev, vendor: picked.name || prev.vendor }));
                                    }}
                                />
                                <TextInput
                                    label="Supplier"
                                    placeholder="e.g. BuildMart"
                                    description="Who you are buying from. Leave empty if you do not know yet."
                                    value={form.vendor}
                                    onChange={(e) => setForm({ ...form, vendor: e.currentTarget.value })}
                                />
                            </>
                        )}

                        <Group grow>
                            <NumberInput
                                label="Amount"
                                required
                                min={0.01}
                                decimalScale={2}
                                value={form.amount ? parseFloat(form.amount) : undefined}
                                onChange={(val) => setForm({ ...form, amount: String(val ?? '') })}
                            />
                            <Select
                                label="Currency"
                                data={['USD', 'ZWL']}
                                value={form.currency}
                                onChange={(val) => setForm({ ...form, currency: val || 'USD' })}
                            />
                        </Group>

                        <Textarea
                            label="What is it for?"
                            placeholder="Say what you need and why..."
                            minRows={4}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.currentTarget.value })}
                        />

                        <Divider my="sm" />
                        <Group justify="flex-end">
                            <Button variant="subtle" onClick={() => router.back()}>Cancel</Button>
                            <Button loading={submitting} disabled={!form.amount} onClick={handleSubmit}>
                                Send request
                            </Button>
                        </Group>
                </FormCard>
            </Container>
        </Layout>
    );
}
