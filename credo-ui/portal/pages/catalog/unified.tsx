import { PRODUCT_NAME } from '@/utils/orgProfile'
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import axios from 'axios';
import { Badge, Button, Grid, Group, NumberInput, Paper, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core';
import { IconBrandWhatsapp } from '@tabler/icons-react';

interface CatalogItem {
    id: string;
    title: string;
    description: string;
    price: number;
    currency: string;
    sku: string;
}

interface TrustCard {
    merchantId: string;
    score: number;
    badge: 'gold' | 'silver' | 'bronze' | 'new';
    topDrivers: { name: string; value: number; icon: string }[];
}

export default function UnifiedCatalog() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [trustCard, setTrustCard] = useState<TrustCard | null>(null);
    const [newItem, setNewItem] = useState({ title: '', price: 0, description: '', sku: '' });
    const [loading, setLoading] = useState(false);

    const merchantId = 'merchant-001'; // Hardcoded for MVP
    const backend = process.env.NEXT_PUBLIC_CREDO_BACKEND || 'http://localhost:3000';

    useEffect(() => {
        fetchItems();
        fetchTrustCard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchItems() {
        try {
            const res = await axios.get(`${backend}/api/catalog/search?q=`);
            setItems(res.data);
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchTrustCard() {
        try {
            const res = await axios.get(`${backend}/api/trust/${merchantId}/card`);
            setTrustCard(res.data);
        } catch (e) {
            console.error(e);
        }
    }

    async function handleCreateItem(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`${backend}/api/catalog/merchant/${merchantId}/items`, newItem);
            setNewItem({ title: '', price: 0, description: '', sku: '' });
            fetchItems();
        } catch (err) {
            alert('Failed to create item');
        } finally {
            setLoading(false);
        }
    }

    async function generateWaLink(itemId: string) {
        try {
            const res = await axios.get(`${backend}/api/wa/link/${merchantId}/${itemId}`);
            window.open(res.data.link, '_blank');
        } catch (e) {
            alert('Failed to generate link');
        }
    }

    const badgeColor =
        trustCard?.badge === 'gold'
            ? 'yellow'
            : trustCard?.badge === 'silver'
                ? 'gray'
                : trustCard?.badge === 'bronze'
                    ? 'orange'
                    : 'blue';

    return (
        <Layout title="Unified Catalog">
            <Head>
                <title>{`Unified Catalog - ${PRODUCT_NAME} Portal`}</title>
            </Head>
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <Group justify="space-between" align="flex-start" gap="md">
                    <div>
                        <Title order={2}>Unified Catalog</Title>
                        <Text size="sm" c="dimmed" mt={4}>Manage your inventory and Trust Score</Text>
                    </div>
                    {trustCard && (
                        <Paper
                            withBorder
                            radius="md"
                            p="md"
                            miw={240}
                            style={{ borderLeft: `4px solid var(--mantine-color-${badgeColor}-filled)` }}
                        >
                            <Group gap="sm" wrap="nowrap">
                                <Text fw={700} style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{trustCard.score}</Text>
                                <Badge variant="light" color={badgeColor}>
                                    {trustCard.badge} Merchant
                                </Badge>
                            </Group>
                            <Stack gap={4} mt="sm">
                                {trustCard.topDrivers.map((d, i) => (
                                    <Group key={i} justify="space-between" gap="md" wrap="nowrap">
                                        <Text size="xs" c="dimmed">
                                            {d.icon} {d.name}
                                        </Text>
                                        <Text size="xs" fw={500} c="green">{d.value}%</Text>
                                    </Group>
                                ))}
                            </Stack>
                        </Paper>
                    )}
                </Group>

                <Grid gap="xl">
                    <Grid.Col span={{ base: 12, lg: 8 }}>
                        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                            <Table.ScrollContainer minWidth={560}>
                                <Table verticalSpacing="sm" horizontalSpacing="lg">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Item</Table.Th>
                                            <Table.Th>Price</Table.Th>
                                            <Table.Th>Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {items.map((item) => (
                                            <Table.Tr key={item.id}>
                                                <Table.Td>
                                                    <Text size="sm" fw={500}>{item.title}</Text>
                                                    <Text size="sm" c="dimmed">{item.description}</Text>
                                                    <Text size="xs" c="dimmed" mt={4}>SKU: {item.sku}</Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" c="dimmed">
                                                        {item.currency} {item.price.toFixed(2)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Button
                                                        variant="subtle"
                                                        color="green"
                                                        size="compact-sm"
                                                        leftSection={<IconBrandWhatsapp size={16} />}
                                                        onClick={() => generateWaLink(item.id)}
                                                    >
                                                        WhatsApp Link
                                                    </Button>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </Paper>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, lg: 4 }}>
                        <Paper withBorder radius="md" p="lg">
                            <Title order={4} mb="md">Add New Item</Title>
                            <form onSubmit={handleCreateItem}>
                                <Stack gap="md">
                                    <TextInput
                                        label="Title"
                                        required
                                        value={newItem.title}
                                        onChange={(e) => setNewItem({ ...newItem, title: e.currentTarget.value })}
                                    />
                                    <Textarea
                                        label="Description"
                                        value={newItem.description}
                                        onChange={(e) => setNewItem({ ...newItem, description: e.currentTarget.value })}
                                    />
                                    <SimpleGrid cols={2} spacing="md">
                                        <NumberInput
                                            label="Price (USD)"
                                            required
                                            step={0.01}
                                            decimalScale={2}
                                            value={newItem.price}
                                            onChange={(value) => setNewItem({ ...newItem, price: typeof value === 'number' ? value : parseFloat(value) })}
                                        />
                                        <TextInput
                                            label="SKU"
                                            value={newItem.sku}
                                            onChange={(e) => setNewItem({ ...newItem, sku: e.currentTarget.value })}
                                        />
                                    </SimpleGrid>
                                    <Button type="submit" fullWidth color="blue" loading={loading}>
                                        Add Item
                                    </Button>
                                </Stack>
                            </form>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </Stack>
        </Layout>
    );
}
