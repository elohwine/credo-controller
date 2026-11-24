import { useState, useEffect, useContext, type ReactNode } from 'react';
import Layout from '../../components/Layout';
import axios from 'axios';
import { formatCurrency } from '@/lib/theme';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Grid,
  Group,
  Loader,
  NativeSelect,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBox,
  IconChartBar,
  IconCircleCheck,
  IconClock,
  IconCurrencyDollar,
  IconFileSearch,
  IconListDetails,
  IconMapPin,
  IconPackages,
  IconPlus,
  IconQrcode,
  IconRefresh,
  IconShieldCheck,
} from '@tabler/icons-react';
import { EnvContext } from '@/pages/_app';
import { StatTile } from '../../../shared/StatTile';

const HEADER_STYLE = {
  borderBottom: '1px solid var(--mantine-color-default-border)',
};

function SectionCard({ icon, title, right, children }: { icon?: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" wrap="wrap" gap="sm" px="lg" py="sm" bg="var(--mantine-color-default-hover)" style={HEADER_STYLE}>
        <Group gap="sm" wrap="nowrap">
          {icon && (
            <ThemeIcon variant="light" color="gray" size="md" radius="md">
              {icon}
            </ThemeIcon>
          )}
          <Title order={4}>{title}</Title>
        </Group>
        {right}
      </Group>
      <Box p="lg">{children}</Box>
    </Paper>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text size="sm" c="dimmed" ta="center" py="xl">
          {children}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

const InventoryDashboard = () => {
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [aging, setAging] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [scanResult, setScanResult] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [verifyChainResult, setVerifyChainResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stock' | 'manage' | 'scan' | 'events' | 'trace' | 'valuation' | 'aging' | 'profit'>('stock');
  const [profitData, setProfitData] = useState<any>(null);

  const [createLocation, setCreateLocation] = useState({ name: '', type: 'warehouse', address: '' });
  const [receiveGoods, setReceiveGoods] = useState({
    catalogItemId: '',
    locationId: '',
    quantity: 1,
    unitCost: 0,
    currency: 'USD',
    lotNumber: '',
    serialNumber: '',
    barcode: '',
    expiryDate: '',
    supplierId: '',
    supplierInvoiceRef: '',
    issueVC: true,
  });
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanLocationId, setScanLocationId] = useState('');
  const [eventsQuery, setEventsQuery] = useState({ catalogItemId: '', locationId: '', limit: 50 });
  const [traceReceiptId, setTraceReceiptId] = useState('');

  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345';

  const apiHeaders = { 'x-api-key': apiKey };

  const fetchStockLevels = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/levels`, { headers: apiHeaders });
      setStockLevels(res.data || []);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/locations`, { headers: apiHeaders });
      setLocations(res.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchValuation = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/valuation`, { headers: apiHeaders });
      setValuation(res.data);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const fetchAging = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/aging`, { headers: apiHeaders });
      setAging(res.data || []);
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Authentication failed. Please check your API key in .env.local' : err.message);
    } finally { setLoading(false); }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/inventory/locations`, createLocation, { headers: apiHeaders });
      setCreateLocation({ name: '', type: 'warehouse', address: '' });
      fetchLocations();
    } catch (err: any) {
      setError(err.message || 'Failed to create location');
    } finally { setLoading(false); }
  };

  const handleReceiveGoods = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${backendUrl}/api/inventory/receive`, receiveGoods, { headers: apiHeaders });
      fetchStockLevels();
    } catch (err: any) {
      setError(err.message || 'Failed to receive goods');
    } finally { setLoading(false); }
  };

  const handleScan = async () => {
    if (!scanBarcode) return;
    setLoading(true);
    try {
      const url = `${backendUrl}/api/inventory/scan/${encodeURIComponent(scanBarcode)}${scanLocationId ? `?locationId=${encodeURIComponent(scanLocationId)}` : ''}`;
      const res = await axios.get(url, { headers: apiHeaders });
      setScanResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to scan barcode');
    } finally { setLoading(false); }
  };

  const handleFetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        catalogItemId: eventsQuery.catalogItemId,
        locationId: eventsQuery.locationId,
        limit: String(eventsQuery.limit),
      });
      const res = await axios.get(`${backendUrl}/api/inventory/events?${params.toString()}`, { headers: apiHeaders });
      setEvents(res.data || []);

      const verifyRes = await axios.get(`${backendUrl}/api/inventory/verify-chain?${params.toString()}`, { headers: apiHeaders });
      setVerifyChainResult(verifyRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally { setLoading(false); }
  };

  const handleTraceReceipt = async () => {
    if (!traceReceiptId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/trace/receipt/${encodeURIComponent(traceReceiptId)}`, { headers: apiHeaders });
      setTraceResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to trace receipt');
    } finally { setLoading(false); }
  };

  const fetchProfitAnalytics = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${backendUrl}/api/inventory/analytics/profit`, { headers: apiHeaders });
      setProfitData(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleBuyNow = async (lotId: string) => {
    if (!confirm('Confirm purchase and remove item from inventory?')) return;
    setLoading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/inventory/buy`, { lotId, quantity: 1 }, { headers: apiHeaders });
      alert(`Success! Receipt ID: ${res.data.receiptId}`);
      handleScan(); // Refresh scan view
      fetchStockLevels();
    } catch (err: any) {
      setError(err.message || 'Failed to process purchase');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchStockLevels();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'stock') fetchStockLevels();
    else if (activeTab === 'valuation') fetchValuation();
    else if (activeTab === 'aging') fetchAging();
    else if (activeTab === 'profit') fetchProfitAnalytics();
  }, [activeTab]);

  const unitsOnHand = stockLevels.reduce((sum, level) => sum + (Number(level.quantityOnHand) || 0), 0);
  const stockValue = stockLevels.reduce((sum, level) => sum + (Number(level.totalCost) || 0), 0);

  return (
    <Layout title="Inventory">
      <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Title order={2}>Inventory</Title>
            <Text size="sm" c="dimmed" mt={4}>Receive stock, scan items, track lots and check stock history</Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setActiveTab('manage')}>
            Receive stock
          </Button>
        </Group>

        {/* Stats */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <StatTile label="Stock lines" value={stockLevels.length} icon={IconBox} hint="Item and location pairs" />
          <StatTile label="Units on hand" value={unitsOnHand.toLocaleString()} icon={IconPackages} />
          <StatTile label="Stock value" value={formatCurrency(stockValue)} icon={IconCurrencyDollar} hint="At cost" />
          <StatTile label="Locations" value={locations.length} icon={IconMapPin} />
        </SimpleGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value as any)}>
          <Tabs.List>
            <Tabs.Tab value="stock" leftSection={<IconBox size={16} />}>Stock levels</Tabs.Tab>
            <Tabs.Tab value="manage" leftSection={<IconPlus size={16} />}>Receive stock</Tabs.Tab>
            <Tabs.Tab value="scan" leftSection={<IconQrcode size={16} />}>Scan & look up</Tabs.Tab>
            <Tabs.Tab value="events" leftSection={<IconListDetails size={16} />}>Stock history</Tabs.Tab>
            <Tabs.Tab value="trace" leftSection={<IconFileSearch size={16} />}>Trace receipt</Tabs.Tab>
            <Tabs.Tab value="valuation" leftSection={<IconCurrencyDollar size={16} />}>Valuation</Tabs.Tab>
            <Tabs.Tab value="profit" leftSection={<IconChartBar size={16} />}>Profit</Tabs.Tab>
            <Tabs.Tab value="aging" leftSection={<IconClock size={16} />}>Aging</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {activeTab === 'stock' && (
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th ta="right">On hand</Table.Th>
                    <Table.Th ta="right">Reserved</Table.Th>
                    <Table.Th ta="right">Available</Table.Th>
                    <Table.Th ta="right">Total cost</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {stockLevels.map((level, idx) => (
                    <Table.Tr key={idx}>
                      <Table.Td fw={500}>{level.catalogItemId}</Table.Td>
                      <Table.Td c="dimmed">{level.locationId}</Table.Td>
                      <Table.Td ta="right">{level.quantityOnHand}</Table.Td>
                      <Table.Td ta="right" c="dimmed">{level.quantityReserved}</Table.Td>
                      <Table.Td ta="right" fw={600}>{level.quantityAvailable}</Table.Td>
                      <Table.Td ta="right" fw={500}>{formatCurrency(level.totalCost || 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                  {stockLevels.length === 0 && !loading && (
                    <EmptyRow colSpan={6}>No stock yet. Use &quot;Receive stock&quot; to add goods.</EmptyRow>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}

        {activeTab === 'manage' && (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            {/* Create Location Card */}
            <SectionCard icon={<IconMapPin size={18} />} title="Add a location">
              <form onSubmit={handleCreateLocation}>
                <Stack gap="sm">
                  <TextInput
                    label="Location name"
                    placeholder="e.g. Main Warehouse"
                    value={createLocation.name}
                    onChange={(e) => setCreateLocation({ ...createLocation, name: e.currentTarget.value })}
                    required
                  />
                  <NativeSelect
                    label="Type"
                    value={createLocation.type}
                    onChange={(e) => setCreateLocation({ ...createLocation, type: e.currentTarget.value })}
                    data={[
                      { value: 'warehouse', label: 'Warehouse' },
                      { value: 'shop', label: 'Shop' },
                      { value: 'transit', label: 'Transit' },
                      { value: 'virtual', label: 'Virtual' },
                    ]}
                  />
                  <TextInput
                    label="Address"
                    placeholder="Physical address"
                    value={createLocation.address}
                    onChange={(e) => setCreateLocation({ ...createLocation, address: e.currentTarget.value })}
                  />
                  <Button type="submit" fullWidth>Add location</Button>
                </Stack>
              </form>

              <Stack gap="xs" mt="lg" pt="lg" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                <Text size="sm" fw={600}>Existing locations</Text>
                {locations.map((loc) => (
                  <Paper key={loc.id} withBorder radius="sm" px="sm" py={6}>
                    <Group gap="xs" wrap="nowrap">
                      <Box c="dimmed" style={{ display: 'flex' }}><IconMapPin size={16} /></Box>
                      <Text size="sm">{loc.name}</Text>
                      <Text size="xs" c="dimmed">· {loc.type}</Text>
                    </Group>
                  </Paper>
                ))}
                {locations.length === 0 && <Text size="sm" c="dimmed">No locations yet</Text>}
              </Stack>
            </SectionCard>

            {/* Receive Goods Card */}
            <SectionCard icon={<IconBox size={18} />} title="Receive goods">
              <form onSubmit={handleReceiveGoods}>
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput
                      label="Catalogue item ID"
                      placeholder="Item ID"
                      value={receiveGoods.catalogItemId}
                      onChange={(e) => setReceiveGoods({ ...receiveGoods, catalogItemId: e.currentTarget.value })}
                      required
                    />
                    <NativeSelect
                      label="Location"
                      value={receiveGoods.locationId}
                      onChange={(e) => setReceiveGoods({ ...receiveGoods, locationId: e.currentTarget.value })}
                      required
                      data={[
                        { value: '', label: 'Select location' },
                        ...locations.map((loc) => ({ value: String(loc.id), label: String(loc.name) })),
                      ]}
                    />
                    <NumberInput
                      label="Quantity"
                      placeholder="Qty"
                      value={receiveGoods.quantity}
                      onChange={(value) => setReceiveGoods({ ...receiveGoods, quantity: Number(value) })}
                      required
                    />
                    <NumberInput
                      label="Unit cost"
                      placeholder="Cost"
                      decimalScale={2}
                      value={receiveGoods.unitCost}
                      onChange={(value) => setReceiveGoods({ ...receiveGoods, unitCost: Number(value) })}
                    />
                    <TextInput
                      label="Lot number"
                      placeholder="LOT-XXX"
                      value={receiveGoods.lotNumber}
                      onChange={(e) => setReceiveGoods({ ...receiveGoods, lotNumber: e.currentTarget.value })}
                    />
                    <TextInput
                      label="Barcode"
                      placeholder="Barcode"
                      value={receiveGoods.barcode}
                      onChange={(e) => setReceiveGoods({ ...receiveGoods, barcode: e.currentTarget.value })}
                    />
                  </SimpleGrid>
                  <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                    <Checkbox
                      label="Issue a goods-received record on receipt"
                      checked={receiveGoods.issueVC}
                      onChange={(e) => setReceiveGoods({ ...receiveGoods, issueVC: e.currentTarget.checked })}
                    />
                  </Paper>
                  <Button type="submit" fullWidth>Receive goods</Button>
                </Stack>
              </form>
            </SectionCard>
          </SimpleGrid>
        )}

        {activeTab === 'scan' && (
          <SectionCard icon={<IconQrcode size={18} />} title="Scan barcode or SKU">
            <Group align="flex-end" gap="sm" wrap="wrap" mb="lg">
              <TextInput label="Barcode or SKU" placeholder="Enter barcode" value={scanBarcode} onChange={(e) => setScanBarcode(e.currentTarget.value)} />
              <TextInput label="Location (optional)" placeholder="Location ID" value={scanLocationId} onChange={(e) => setScanLocationId(e.currentTarget.value)} />
              <Button leftSection={<IconQrcode size={16} />} onClick={handleScan}>Scan</Button>
            </Group>

            {scanResult && (
              <Stack gap="md">
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" fw={600} mb="sm">Catalogue item</Text>
                  <SimpleGrid cols={2} spacing="md">
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Title</Text>
                      <Text fw={600}>{scanResult.catalogItem?.title}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Price</Text>
                      <Text fw={600}>{formatCurrency(scanResult.catalogItem?.price)}</Text>
                    </div>
                  </SimpleGrid>
                </Paper>

                {/* Item history */}
                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                  <Group justify="space-between" px="md" py="sm" bg="var(--mantine-color-default-hover)" style={HEADER_STYLE}>
                    <Text size="sm" fw={600}>Item history</Text>
                    <Badge variant="light" color="green" size="sm">Verified</Badge>
                  </Group>
                  <Box p="md">
                    <Timeline bulletSize={26} lineWidth={2} active={(scanResult.provenanceTrial?.length ?? 0) - 1}>
                      {scanResult.provenanceTrial?.map((event: any) => (
                        <Timeline.Item
                          key={event.id}
                          color={event.eventType === 'RECEIVE' ? 'green' : 'blue'}
                          bullet={<IconCircleCheck size={14} />}
                          title={
                            <Group justify="space-between" wrap="nowrap" gap="sm">
                              <Text size="sm">
                                <Text span fw={600}>{event.eventType}</Text>
                                <Text span c="dimmed"> · Qty {event.quantity}</Text>
                              </Text>
                              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{event.createdAt.slice(0, 10)}</Text>
                            </Group>
                          }
                        />
                      ))}
                    </Timeline>
                  </Box>
                </Paper>

                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                  <Box px="md" py="sm" bg="var(--mantine-color-default-hover)" style={HEADER_STYLE}>
                    <Text size="sm" fw={600}>Available lots</Text>
                  </Box>
                  <Stack gap={0}>
                    {scanResult.lots?.map((lot: any, idx: number) => (
                      <Group
                        key={lot.id}
                        justify="space-between"
                        wrap="wrap"
                        gap="sm"
                        p="md"
                        style={idx > 0 ? { borderTop: '1px solid var(--mantine-color-default-border)' } : undefined}
                      >
                        <div>
                          <Text size="sm" fw={600}>{lot.lotNumber || lot.serialNumber || lot.id}</Text>
                          <Text size="xs" c="dimmed">On hand: {lot.quantityOnHand}</Text>
                        </div>
                        <Group gap="sm">
                          {lot.grnVcId && (
                            <Badge variant="light" color="green" size="sm" leftSection={<IconCircleCheck size={12} />}>
                              Proof on file
                            </Badge>
                          )}
                          <Button size="xs" onClick={() => handleBuyNow(lot.id)} disabled={lot.quantityOnHand <= 0}>
                            Buy now
                          </Button>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              </Stack>
            )}
          </SectionCard>
        )}

        {activeTab === 'events' && (
          <SectionCard icon={<IconListDetails size={18} />} title="Stock history">
            <Group align="flex-end" gap="sm" wrap="wrap" mb="lg">
              <TextInput
                label="Catalogue item ID"
                placeholder="Item ID"
                value={eventsQuery.catalogItemId}
                onChange={(e) => setEventsQuery({ ...eventsQuery, catalogItemId: e.currentTarget.value })}
              />
              <TextInput
                label="Location ID"
                placeholder="Location"
                value={eventsQuery.locationId}
                onChange={(e) => setEventsQuery({ ...eventsQuery, locationId: e.currentTarget.value })}
              />
              <Button leftSection={<IconRefresh size={16} />} onClick={handleFetchEvents}>Load history</Button>
            </Group>

            {verifyChainResult && (
              <Alert
                mb="lg"
                variant="light"
                color={verifyChainResult.valid ? 'green' : 'red'}
                icon={verifyChainResult.valid ? <IconShieldCheck size={18} /> : <IconAlertTriangle size={18} />}
              >
                History {verifyChainResult.valid ? 'checks out' : 'has been altered'} · {verifyChainResult.eventCount} events
              </Alert>
            )}

            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
              <Table.ScrollContainer minWidth={560}>
                <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Type</Table.Th>
                      <Table.Th ta="right">Qty</Table.Th>
                      <Table.Th>Proof</Table.Th>
                      <Table.Th>Fingerprint</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {events.map((ev) => (
                      <Table.Tr key={ev.id}>
                        <Table.Td fw={500}>{ev.eventType}</Table.Td>
                        <Table.Td ta="right">{ev.quantity}</Table.Td>
                        <Table.Td>
                          {ev.vcId ? (
                            <Badge variant="light" color="green" size="sm" leftSection={<IconCircleCheck size={12} />} style={{ textTransform: 'none' }}>
                              <Text span size="xs" ff="monospace">{ev.vcId.slice(0, 8)}...</Text>
                            </Badge>
                          ) : (
                            <Text span c="dimmed">—</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed" ff="monospace">{ev.eventHash?.slice(0, 18)}...</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {events.length === 0 && !loading && <EmptyRow colSpan={4}>No history found</EmptyRow>}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          </SectionCard>
        )}

        {activeTab === 'trace' && (
          <SectionCard icon={<IconFileSearch size={18} />} title="Trace a receipt to its lots">
            <Group align="flex-end" gap="sm" wrap="wrap" mb="lg">
              <TextInput label="Receipt ID" placeholder="Receipt ID" value={traceReceiptId} onChange={(e) => setTraceReceiptId(e.currentTarget.value)} />
              <Button onClick={handleTraceReceipt}>Trace</Button>
            </Group>

            {traceResult && (
              <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                <Group gap="xs" px="md" py="sm" bg="var(--mantine-color-default-hover)" style={HEADER_STYLE}>
                  <ThemeIcon variant="light" size="sm" color={traceResult.chainValid ? 'green' : 'red'}>
                    {traceResult.chainValid ? <IconShieldCheck size={14} /> : <IconAlertTriangle size={14} />}
                  </ThemeIcon>
                  <Text size="sm" fw={600}>Receipt: {traceResult.receiptId}</Text>
                  <Badge variant="light" size="sm" color={traceResult.chainValid ? 'green' : 'red'}>
                    {traceResult.chainValid ? 'History checks out' : 'History altered'}
                  </Badge>
                </Group>
                <Stack gap={0}>
                  {traceResult.fulfillments?.map((f: any, idx: number) => (
                    <Group
                      key={idx}
                      justify="space-between"
                      wrap="wrap"
                      gap="sm"
                      px="md"
                      py="sm"
                      style={idx > 0 ? { borderTop: '1px solid var(--mantine-color-default-border)' } : undefined}
                    >
                      <Text size="sm">Lot {f.lotId}</Text>
                      <Text size="sm" c="dimmed">Qty {f.quantity}</Text>
                      {f.grnVcId && (
                        <Badge variant="light" color="green" size="sm" leftSection={<IconCircleCheck size={12} />}>
                          Goods received proof
                        </Badge>
                      )}
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}
          </SectionCard>
        )}

        {activeTab === 'valuation' && (
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <StatTile
                label="Total inventory value"
                value={formatCurrency(valuation?.totalValue || 0)}
                icon={IconCurrencyDollar}
                hint={valuation?.currency || 'USD'}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <SectionCard title="Value by location">
                <Stack gap={0}>
                  {valuation?.byLocation?.map((loc: any, idx: number) => (
                    <Group
                      key={idx}
                      justify="space-between"
                      py="sm"
                      style={idx > 0 ? { borderTop: '1px solid var(--mantine-color-default-border)' } : undefined}
                    >
                      <Text size="sm">{loc.location_id}</Text>
                      <Text size="sm" fw={600}>{formatCurrency(loc.value || 0, loc.currency)}</Text>
                    </Group>
                  ))}
                  {!valuation?.byLocation?.length && <Text c="dimmed" ta="center" py="md">No valuation data</Text>}
                </Stack>
              </SectionCard>
            </Grid.Col>
          </Grid>
        )}

        {activeTab === 'aging' && (
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={480}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Age</Table.Th>
                    <Table.Th ta="right">Lots</Table.Th>
                    <Table.Th ta="right">Value</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {aging.map((bucket, idx) => {
                    const stale = bucket.age_bucket === '90+ days';
                    return (
                      <Table.Tr key={idx} bg={stale ? 'var(--mantine-color-red-light)' : undefined}>
                        <Table.Td fw={500}>
                          <Group gap={6} wrap="nowrap">
                            {stale && <Box c="red" style={{ display: 'flex' }}><IconAlertTriangle size={16} /></Box>}
                            {bucket.age_bucket}
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right">{bucket.lot_count}</Table.Td>
                        <Table.Td ta="right" fw={500}>{formatCurrency(bucket.value || 0)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                  {aging.length === 0 && !loading && <EmptyRow colSpan={3}>No aging data available</EmptyRow>}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}

        {activeTab === 'profit' && (
          <Stack gap="lg">
            {/* Profit Summary Stats */}
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
              <StatTile label="Forecast profit" value={profitData?.summary?.totalProfit != null ? formatCurrency(profitData.summary.totalProfit) : '—'} icon={IconChartBar} />
              <StatTile
                label="Overall margin"
                value={profitData?.summary?.overallMargin != null ? `${profitData.summary.overallMargin.toFixed(1)}%` : '—'}
                icon={IconChartBar}
              />
              <StatTile label="Active stock items" value={profitData?.summary?.totalItems ?? '—'} icon={IconBox} />
            </SimpleGrid>

            {/* Profit per Item Table */}
            <SectionCard title="Profit by item" right={<Text size="xs" c="dimmed">Revenue against cost</Text>}>
              <Table.ScrollContainer minWidth={860}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Item</Table.Th>
                      <Table.Th ta="right">Qty</Table.Th>
                      <Table.Th ta="right">Avg cost</Table.Th>
                      <Table.Th ta="right">Price</Table.Th>
                      <Table.Th ta="right">Unit profit</Table.Th>
                      <Table.Th ta="right">Total profit</Table.Th>
                      <Table.Th ta="right">Avg days in stock</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {profitData?.items?.map((item: any, idx: number) => (
                      <Table.Tr key={idx}>
                        <Table.Td>
                          <Text size="sm" fw={600}>{item.item_name}</Text>
                          <Text size="xs" c="dimmed" ff="monospace">{item.sku}</Text>
                        </Table.Td>
                        <Table.Td ta="right" c="dimmed">{item.total_qty}</Table.Td>
                        <Table.Td ta="right" c="dimmed">{formatCurrency(item.avg_cost)}</Table.Td>
                        <Table.Td ta="right" fw={500}>{formatCurrency(item.selling_price)}</Table.Td>
                        <Table.Td ta="right" fw={600}>{formatCurrency(item.selling_price - item.avg_cost)}</Table.Td>
                        <Table.Td ta="right" fw={700}>{formatCurrency(item.projected_profit)}</Table.Td>
                        <Table.Td ta="right">
                          <Badge variant="light" size="sm" color={item.avg_days_in_stock > 30 ? 'red' : 'green'}>
                            {Math.round(item.avg_days_in_stock)} days
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </SectionCard>
          </Stack>
        )}

        {loading && (
          <Group justify="center" gap="sm" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">Loading...</Text>
          </Group>
        )}
      </Stack>
    </Layout>
  );
};

export default InventoryDashboard;
