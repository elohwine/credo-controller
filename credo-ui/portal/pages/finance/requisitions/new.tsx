import { useState, useContext } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { useRequireOrgContext } from '@/lib/portalContext';
import {
    Container, Title, Text, Paper, Group, Stack, Button, NumberInput, Select, Textarea, TextInput, Divider
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconReceipt } from '@tabler/icons-react';

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
        amount: '',
        currency: 'USD',
        description: '',
    });

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
            await axios.post(
                `${baseUrl}/api/finance/requisitions/request`,
                {
                    orgTenantId: getTargetOrgTenantId() || undefined,
                    department: form.department,
                    vendor: form.payWith === 'cash' ? '' : form.vendor,
                    paymentMethod: form.payWith === 'cash' ? 'cash' : 'supplier',
                    currency: form.currency,
                    notes: form.description,
                    items: [
                        {
                            id: `item-${Date.now()}`,
                            name: itemName,
                            price: parsedAmount,
                            quantity: 1,
                        },
                    ],
                    totalAmount: parsedAmount
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            notifications.show({
                title: 'Request sent',
                message: form.payWith === 'cash'
                    ? 'Your cash request is with the approvers. It is paid out when released.'
                    : 'Your request is with the approvers. A purchase order is created when it is approved.',
                color: 'green',
                icon: <IconCheck size={16} />
            });
            router.push('/finance/requisitions');
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
        <Layout title="New requisition">
            <Container size="sm" py="md">
                <Group gap="sm" mb="lg">
                    <IconReceipt size={28} />
                    <Title order={3}>New requisition</Title>
                </Group>

                <Paper p="xl" radius="md" withBorder>
                    <Stack gap="md">
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

                        {form.payWith === 'supplier' && (
                            <TextInput
                                label="Supplier"
                                placeholder="e.g. BuildMart"
                                description="Who you are buying from. Leave empty if you do not know yet."
                                value={form.vendor}
                                onChange={(e) => setForm({ ...form, vendor: e.currentTarget.value })}
                            />
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
                    </Stack>
                </Paper>
            </Container>
        </Layout>
    );
}
