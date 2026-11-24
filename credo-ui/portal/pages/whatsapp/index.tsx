import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import Link from 'next/link';
import { Alert, Anchor, Badge, Box, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconBrandWhatsapp, IconClock, IconCurrencyDollar, IconDeviceMobile, IconShoppingCart } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';

const cartStatusColor = (status: string) =>
    status === 'completed' ? 'green' : status === 'pending' ? 'yellow' : 'gray';

interface Cart {
    id: string;
    customerId: string;
    items: Array<{
        sku: string;
        quantity: number;
        price: number;
    }>;
    status: string;
    total: number;
    createdAt: string;
}

export default function WhatsAppPage() {
    const [carts, setCarts] = useState<Cart[]>([]);
    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const [selectedCart, setSelectedCart] = useState<Cart | null>(null);

    useEffect(() => {
        if (env.NEXT_PUBLIC_BACKEND_URL) fetchCarts();
    }, [env.NEXT_PUBLIC_BACKEND_URL]);

    const fetchCarts = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/wa/carts`);
            const data = await res.json();
            setCarts(data.carts || []);
        } catch (error) {
            console.warn('Failed to fetch carts:', error);
        }
    };

    return (
        <Layout title="WhatsApp Commerce">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <div>
                    <Title order={2}>WhatsApp Commerce</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        Optional: carts and orders that customers start over WhatsApp
                    </Text>
                </div>

                <Alert variant="light" color="gray" icon={<IconBrandWhatsapp size={18} />} title="WhatsApp is optional">
                    <Text size="sm">
                        WhatsApp delivery is off by default. Customers can browse the catalogue, add items to a cart and
                        check out by message only once your organisation turns it on in{' '}
                        <Anchor component={Link} href="/organization/whatsapp" size="sm">WhatsApp settings</Anchor>.
                        Everything else works without it.
                    </Text>
                </Alert>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    <StatTile label="Active Carts" value={carts.filter(c => c.status === 'pending').length} icon={IconShoppingCart} />
                    <StatTile label="Total Sales" value={`$${carts.reduce((sum, c) => sum + (c.total || 0), 0).toFixed(2)}`} icon={IconCurrencyDollar} />
                    <StatTile label="Completed Orders" value={carts.filter(c => c.status === 'completed').length} icon={IconDeviceMobile} />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                    {/* Carts List */}
                    <Paper withBorder radius="md" p="lg">
                        <Group gap="xs" mb="md">
                            <Box c="dimmed" style={{ display: 'flex' }}><IconShoppingCart size={18} /></Box>
                            <Title order={4}>Active Carts</Title>
                        </Group>
                        <Stack gap="sm">
                            {carts.map((cart) => {
                                const selected = selectedCart?.id === cart.id;
                                return (
                                    <UnstyledButton key={cart.id} onClick={() => setSelectedCart(cart)} w="100%">
                                        <Paper
                                            withBorder
                                            radius="md"
                                            p="sm"
                                            style={selected ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}
                                            bg={selected ? 'var(--mantine-primary-color-light)' : undefined}
                                        >
                                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                                <div>
                                                    <Text size="sm" fw={500}>{cart.customerId}</Text>
                                                    <Text size="xs" c="dimmed" mt={2}>{cart.items.length} items</Text>
                                                </div>
                                                <Stack gap={4} align="flex-end">
                                                    <Text size="sm" fw={600}>${cart.total?.toFixed(2)}</Text>
                                                    <Badge variant="light" size="sm" color={cartStatusColor(cart.status)} tt="none">
                                                        {cart.status}
                                                    </Badge>
                                                </Stack>
                                            </Group>
                                            <Text size="xs" c="dimmed" mt="xs">{new Date(cart.createdAt).toLocaleString()}</Text>
                                        </Paper>
                                    </UnstyledButton>
                                );
                            })}
                            {carts.length === 0 && (
                                <Text ta="center" c="dimmed" py="xl">No carts found</Text>
                            )}
                        </Stack>
                    </Paper>

                    {/* Cart Details */}
                    <Paper withBorder radius="md" p="lg">
                        <Group gap="xs" mb="md">
                            <Box c="dimmed" style={{ display: 'flex' }}><IconClock size={18} /></Box>
                            <Title order={4}>Cart Details</Title>
                        </Group>
                        {selectedCart ? (
                            <Stack gap="sm">
                                <div>
                                    <Text size="sm" c="dimmed" fw={500}>Customer ID</Text>
                                    <Text size="sm" mt={2}>{selectedCart.customerId}</Text>
                                </div>
                                <div>
                                    <Text size="sm" c="dimmed" fw={500}>Status</Text>
                                    <Text size="sm" mt={2}>{selectedCart.status}</Text>
                                </div>
                                <div>
                                    <Text size="sm" c="dimmed" fw={500}>Items</Text>
                                    <Stack gap={6} mt="xs">
                                        {selectedCart.items.map((item, idx) => (
                                            <Group key={idx} justify="space-between">
                                                <Text size="sm">{item.sku} (×{item.quantity})</Text>
                                                <Text size="sm" c="dimmed">${(item.price * item.quantity).toFixed(2)}</Text>
                                            </Group>
                                        ))}
                                    </Stack>
                                </div>
                                <Group justify="space-between" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                                    <Text size="sm" fw={500}>Total</Text>
                                    <Text size="sm" fw={700}>${selectedCart.total?.toFixed(2)}</Text>
                                </Group>
                            </Stack>
                        ) : (
                            <Text size="sm" c="dimmed" ta="center" py="xl">Select a cart to view details</Text>
                        )}
                    </Paper>
                </SimpleGrid>
            </Stack>
        </Layout>
    );
}
