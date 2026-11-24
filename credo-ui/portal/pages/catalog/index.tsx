import React, { useState, useEffect, useContext, useRef } from 'react';
import Layout from '@/components/Layout';
import { formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import {
    AspectRatio,
    Badge,
    Box,
    Button,
    Card,
    Center,
    Group,
    Image,
    Loader,
    Modal,
    NumberInput,
    Paper,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Textarea,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { IconBox, IconLayoutGrid, IconList, IconPlus, IconSearch, IconTag, IconUpload } from '@tabler/icons-react';

interface CatalogItem {
    id: string;
    merchantId: string;
    title: string;
    description?: string;
    sku?: string;
    price: number;
    currency: string;
    category?: string;
    images: string[];
    createdAt: string;
}

const CategorySection: React.FC<{ title: string, items: CatalogItem[], viewMode: 'grid' | 'list' }> = ({ title, items, viewMode }) => (
    <Stack gap="md">
        <Group gap="xs" wrap="nowrap">
            <Box w={6} h={24} bg="blue" style={{ borderRadius: 'var(--mantine-radius-xl)' }} />
            <Title order={3}>{title}</Title>
            <Text size="sm" c="dimmed">({items.length})</Text>
        </Group>

        {viewMode === 'grid' ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
                {items.map(item => (
                    <Card key={item.id} withBorder radius="md" padding="md" h="100%">
                        <Card.Section pos="relative">
                            <AspectRatio ratio={4 / 3}>
                                {item.images && item.images.length > 0 ? (
                                    <Image src={item.images[0]} alt={item.title} fit="cover" />
                                ) : (
                                    <Center bg="var(--mantine-color-default-hover)" c="dimmed">
                                        <IconBox size={48} stroke={1.4} />
                                    </Center>
                                )}
                            </AspectRatio>
                            <Badge
                                variant="default"
                                size="lg"
                                radius="sm"
                                style={{ position: 'absolute', top: 8, right: 8, boxShadow: 'var(--mantine-shadow-xs)' }}
                            >
                                {formatCurrency(item.price, item.currency)}
                            </Badge>
                        </Card.Section>
                        <Stack gap={4} mt="md" style={{ flex: 1 }}>
                            <Text fw={600} size="lg" lineClamp={1}>{item.title}</Text>
                            <Text size="sm" c="dimmed" lineClamp={2} style={{ flex: 1 }}>{item.description || 'No description'}</Text>
                        </Stack>
                        <Group
                            justify="space-between"
                            mt="sm"
                            pt="sm"
                            wrap="nowrap"
                            style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                        >
                            <Text size="xs" c="dimmed" ff="monospace">{item.sku || 'No SKU'}</Text>
                            {item.category && (
                                <Badge variant="light" color="blue" size="sm" leftSection={<IconTag size={12} />}>
                                    {item.category}
                                </Badge>
                            )}
                        </Group>
                    </Card>
                ))}
            </SimpleGrid>
        ) : (
            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                <Table.ScrollContainer minWidth={640}>
                    <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Item</Table.Th>
                                <Table.Th>Category</Table.Th>
                                <Table.Th>SKU</Table.Th>
                                <Table.Th>Price</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {items.map(item => (
                                <Table.Tr key={item.id}>
                                    <Table.Td>
                                        <Group gap="md" wrap="nowrap">
                                            {item.images?.[0] ? (
                                                <Image src={item.images[0]} alt="" w={40} h={40} radius="md" fit="cover" />
                                            ) : (
                                                <ThemeIcon variant="light" color="gray" size={40} radius="md">
                                                    <IconBox size={22} stroke={1.5} />
                                                </ThemeIcon>
                                            )}
                                            <Box style={{ minWidth: 0 }}>
                                                <Text size="sm" fw={500}>{item.title}</Text>
                                                <Text size="sm" c="dimmed" truncate="end" maw={320}>{item.description}</Text>
                                            </Box>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color="blue">
                                            {item.category || 'Uncategorized'}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed" ff="monospace">{item.sku || '-'}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={500} c="blue">{formatCurrency(item.price, item.currency)}</Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>
        )}
    </Stack>
);

export default function CatalogPage() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [importing, setImporting] = useState(false);
    const [newItem, setNewItem] = useState({
        title: '',
        description: '',
        sku: '',
        price: 0,
        currency: 'USD',
        category: '',
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        fetchCatalogItems();
    }, []);

    const fetchCatalogItems = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/catalog/search?q=`);
            const data = await res.json();
            setItems(data || []);
        } catch (error) {
            console.error('Failed to fetch catalog:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/catalog/merchant/merchant-001/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if (res.ok) {
                setShowCreateModal(false);
                fetchCatalogItems();
                setNewItem({ title: '', description: '', sku: '', price: 0, currency: 'USD', category: '' });
            }
        } catch (error) {
            console.error('Failed to create item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            const text = await file.text();
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

            // Simple validation: check if headers roughly match
            const hasTitle = headers.some(h => h.includes('title') || h.includes('name'));

            const payload = lines.slice(1)
                .map(line => line.trim())
                .filter(line => line)
                .map(line => {
                    const values = line.split(',');
                    const getVal = (key: string) => {
                        const idx = headers.findIndex(h => h.includes(key));
                        return idx > -1 ? values[idx]?.trim() : undefined;
                    };

                    return {
                        title: getVal('title') || getVal('name') || values[0] || 'Untitled',
                        description: getVal('description') || values[1] || '',
                        price: parseFloat(getVal('price') || values[2] || '0'),
                        currency: getVal('currency') || 'USD',
                        sku: getVal('sku') || values[3] || undefined,
                        category: getVal('category') || values[4] || 'Uncategorized',
                        images: []
                    };
                });

            if (payload.length === 0) throw new Error("No valid items found in CSV");

            const res = await fetch(`${backendUrl}/api/catalog/merchant/merchant-001/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                fetchCatalogItems();
                alert(`Successfully imported ${data.imported} items!`);
            } else {
                throw new Error("Import failed on server");
            }
        } catch (error: any) {
            console.error('Import Error:', error);
            alert(`Import failed: ${error.message}`);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const categories = Array.from(new Set(filteredItems.map(i => i.category || 'Uncategorized'))).sort();

    // Group items
    const groupedItems: Record<string, CatalogItem[]> = {};
    categories.forEach(cat => {
        groupedItems[cat] = filteredItems.filter(i => (i.category || 'Uncategorized') === cat);
    });

    return (
        <Layout title="Catalog">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                {/* Header */}
                <Group justify="space-between" align="flex-start" gap="md">
                    <div>
                        <Title order={2}>Catalog</Title>
                        <Text size="sm" c="dimmed" mt={4}>Manage products, prices, and categories</Text>
                    </div>

                    <Group gap="sm">
                        <input
                            type="file"
                            ref={fileInputRef}
                            hidden
                            accept=".csv"
                            onChange={handleImport}
                        />
                        <Button
                            variant="default"
                            onClick={() => fileInputRef.current?.click()}
                            loading={importing}
                            leftSection={<IconUpload size={18} />}
                        >
                            Import CSV
                        </Button>
                        <Button
                            color="blue"
                            onClick={() => setShowCreateModal(true)}
                            leftSection={<IconPlus size={18} />}
                        >
                            Add Item
                        </Button>
                    </Group>
                </Group>

                {/* Controls */}
                <Group
                    gap="md"
                    py="xs"
                    wrap="wrap"
                    style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--mantine-color-body)' }}
                >
                    <TextInput
                        placeholder="Search catalog..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        leftSection={<IconSearch size={18} />}
                        size="md"
                        style={{ flex: 1, minWidth: 220 }}
                    />

                    <SegmentedControl
                        value={viewMode}
                        onChange={(value) => setViewMode(value as 'grid' | 'list')}
                        data={[
                            { value: 'grid', label: <Center aria-label="Grid view"><IconLayoutGrid size={18} /></Center> },
                            { value: 'list', label: <Center aria-label="List view"><IconList size={18} /></Center> },
                        ]}
                    />
                </Group>

                {isLoading ? (
                    <Center py={80}>
                        <Loader size="xl" color="blue" />
                    </Center>
                ) : filteredItems.length === 0 ? (
                    <Paper withBorder radius="lg" py={80} px="md" style={{ borderStyle: 'dashed' }}>
                        <Stack align="center" gap="xs">
                            <ThemeIcon variant="light" color="gray" size={56} radius="xl">
                                <IconBox size={30} stroke={1.4} />
                            </ThemeIcon>
                            <Text fw={600} size="sm">No items found</Text>
                            <Text size="sm" c="dimmed" ta="center">
                                {searchTerm ? 'Try a different search term.' : 'Get started by creating a new item or importing one.'}
                            </Text>
                        </Stack>
                    </Paper>
                ) : (
                    <Stack gap={40}>
                        {categories.map(category => (
                            <CategorySection
                                key={category}
                                title={category}
                                items={groupedItems[category]}
                                viewMode={viewMode}
                            />
                        ))}
                    </Stack>
                )}

                {/* Create Modal */}
                <Modal
                    opened={showCreateModal}
                    onClose={() => setShowCreateModal(false)}
                    size="lg"
                    radius="md"
                    title={
                        <Group gap="md" wrap="nowrap">
                            <ThemeIcon variant="light" color="blue" size={48} radius="md">
                                <IconBox size={28} stroke={1.5} />
                            </ThemeIcon>
                            <div>
                                <Title order={3}>Add Product</Title>
                                <Text size="sm" c="dimmed">Create a new item in your catalog</Text>
                            </div>
                        </Group>
                    }
                >
                    <form onSubmit={handleCreateItem}>
                        <Stack gap="md">
                            <TextInput
                                label="Product Name"
                                required
                                value={newItem.title}
                                onChange={e => setNewItem({ ...newItem, title: e.currentTarget.value })}
                                placeholder="e.g., Wireless Headphones"
                            />
                            <SimpleGrid cols={2} spacing="md">
                                <TextInput
                                    label="SKU"
                                    value={newItem.sku}
                                    onChange={e => setNewItem({ ...newItem, sku: e.currentTarget.value })}
                                    placeholder="SKU-123"
                                />
                                <TextInput
                                    label="Category"
                                    value={newItem.category}
                                    onChange={e => setNewItem({ ...newItem, category: e.currentTarget.value })}
                                    placeholder="Electronics"
                                />
                            </SimpleGrid>
                            <SimpleGrid cols={2} spacing="md">
                                <NumberInput
                                    label="Price"
                                    required
                                    min={0}
                                    step={0.01}
                                    decimalScale={2}
                                    leftSection={<Text size="sm" c="dimmed">$</Text>}
                                    value={newItem.price}
                                    onChange={value => setNewItem({ ...newItem, price: typeof value === 'number' ? value : parseFloat(value) })}
                                    placeholder="0.00"
                                />
                                <Select
                                    label="Currency"
                                    value={newItem.currency}
                                    onChange={value => setNewItem({ ...newItem, currency: value || 'USD' })}
                                    data={['USD', 'ZWL', 'ZAR']}
                                    allowDeselect={false}
                                />
                            </SimpleGrid>
                            <Textarea
                                label="Description"
                                value={newItem.description}
                                onChange={e => setNewItem({ ...newItem, description: e.currentTarget.value })}
                                rows={3}
                                placeholder="Detailed product description..."
                            />

                            <Group justify="flex-end" gap="sm" pt="md">
                                <Button type="button" variant="subtle" color="gray" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                                <Button type="submit" color="blue" loading={isLoading}>Create Product</Button>
                            </Group>
                        </Stack>
                    </form>
                </Modal>
            </Stack>
        </Layout>
    );
}
