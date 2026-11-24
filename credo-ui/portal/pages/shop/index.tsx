import { PRODUCT_NAME } from '@/utils/orgProfile'
import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import {
    ActionIcon,
    Alert,
    AspectRatio,
    Box,
    Button,
    Card,
    Center,
    Divider,
    Group,
    Image,
    Indicator,
    Loader,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { useCartPolling } from '@/utils/useCartPolling';
import { useRouter } from 'next/router';
import axios from 'axios';
import { ensurePortalTenant } from '@/utils/portalTenant';
import {
    IconBox,
    IconBrandWhatsapp,
    IconCircleCheck,
    IconFileInvoice,
    IconPlus,
    IconReceipt,
    IconShoppingBag,
    IconTrash,
} from '@tabler/icons-react';
import { PhoneField } from '../../../shared/PhoneField';
import { feedback } from '@/lib/feedback';

// Reusing types locally for speed
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
    stockLeft?: number;
}

interface CartItem {
    itemId: string;
    title: string;
    quantity: number;
    price: number;
}

interface Cart {
    id: string;
    merchantId?: string;
    total: number;
    currency: string;
    items: CartItem[];
    status: string;
}

export default function ShopPage() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [cart, setCart] = useState<Cart | null>(null);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);
    const [buyerPhone, setBuyerPhone] = useState('');
    const [checkoutStep, setCheckoutStep] = useState<'cart' | 'phone' | 'invoice' | 'receipt'>('cart');
    const [invoiceUrl, setInvoiceUrl] = useState('');
    const [invoiceOfferId, setInvoiceOfferId] = useState('');
    const [savingInvoice, setSavingInvoice] = useState(false);
    const [invoiceSaved, setInvoiceSaved] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState('');
    const [savingReceipt, setSavingReceipt] = useState(false);
    const [receiptSaved, setReceiptSaved] = useState(false);
    const [refunded, setRefunded] = useState(false);
    const [refunding, setRefunding] = useState(false);
    const [refundNote, setRefundNote] = useState('');

    const env = useContext(EnvContext);
    const router = useRouter();
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const holderBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';

    // Poll for receipt ONLY when invoice is saved (user has accepted offer)
    // Stop polling once paid/receipt is obtained to reduce server load
    const { cart: pollingCart } = useCartPolling(
        invoiceSaved && checkoutStep === 'invoice' && cart?.id ? cart.id : null,
        (updatedCart: any) => {
            if (updatedCart.status === 'paid' && checkoutStep !== 'receipt') {
                setCheckoutStep('receipt');
            }
            if (updatedCart.receiptOfferUrl) {
                setReceiptUrl(updatedCart.receiptOfferUrl);
            }
        },
        {
            enabled: invoiceSaved && checkoutStep === 'invoice' && !receiptSaved,
            stopOnStatus: ['paid']
        }
    );

    useEffect(() => {
        fetchCatalogItems();
        // Restore cart from local storage if exists?
        const savedCartId = localStorage.getItem('credo_cart_id');
        if (savedCartId) fetchCart(savedCartId);
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

    const fetchCart = async (cartId: string) => {
        try {
            const res = await fetch(`${backendUrl}/api/wa/cart/${cartId}`);
            if (res.ok) {
                const data = await res.json();
                setCart(data);

                // Auto-navigate to correct step based on cart status
                if (data.status === 'refunded') {
                    setRefunded(true);
                    setCheckoutStep('receipt');
                    setIsCartOpen(true);
                } else if (data.status === 'paid') {
                    setRefunded(false);
                    setCheckoutStep('receipt');
                    if (data.receiptOfferUrl) {
                        setReceiptUrl(data.receiptOfferUrl);
                    }
                    setIsCartOpen(true);
                } else if (data.status === 'cancelled') {
                    localStorage.removeItem('credo_cart_id');
                    setCart(null);
                } else if (data.status === 'invoiced') {
                    // Cart was already checked out, skip to invoice step
                    // Note: invoiceOfferUrl might not be stored, user may need to re-checkout
                    // For now, clear the stale cart and let user start fresh
                    console.log('[Shop] Cart is invoiced but no offer URL, clearing stale cart');
                    localStorage.removeItem('credo_cart_id');
                    setCart(null);
                }
            } else {
                localStorage.removeItem('credo_cart_id');
            }
        } catch (e) {
            console.error("Failed to fetch cart", e);
        }
    };

    const addToCart = async (item: CatalogItem) => {
        setIsLoading(true);
        try {
            if (!cart) {
                // Create new cart
                const payload = {
                    merchantId: item.merchantId,
                    itemId: item.id,
                    qty: 1
                };
                const res = await fetch(`${backendUrl}/api/wa/cart/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        payload: JSON.stringify(payload),
                        buyerPhone: '' // We ask for phone later? Or should we ask now? 
                        // Backend createCart stores buyerPhone. 
                    })
                });
                const newCart = await res.json();
                setCart(newCart);
                localStorage.setItem('credo_cart_id', newCart.id);
                setIsCartOpen(true);
            } else if (cart.merchantId && cart.merchantId !== item.merchantId) {
                // One basket pays one business.
                feedback.error('Your basket is for another business. Pay for it or empty it before adding from this one.');
                setIsCartOpen(true);
            } else {
                // Add item to existing cart
                const res = await fetch(`${backendUrl}/api/wa/cart/${cart.id}/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        itemId: item.id,
                        quantity: 1
                    })
                });
                const updatedCart = await res.json();
                if (!res.ok) throw new Error(updatedCart?.message || 'Not added. Try again.');
                setCart(updatedCart);
                setIsCartOpen(true);
            }
        } catch (error: any) {
            console.error('Failed to add to cart:', error);
            feedback.error(error?.message || 'Not added. Try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const emptyBasket = async () => {
        if (!cart) return;
        try {
            const res = await fetch(`${backendUrl}/api/wa/cart/${cart.id}/cancel`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || 'Not emptied. Try again.');
            }
            localStorage.removeItem('credo_cart_id');
            setCart(null);
            feedback.success('Basket emptied.');
        } catch (error: any) {
            feedback.error(error?.message || 'Not emptied. Try again.');
        }
    };

    const handleCheckout = () => {
        if (!cart) return;
        setCheckoutStep('phone');
    };

    const submitCheckout = async () => {
        if (!cart) return;
        setCheckingOut(true);
        try {
            // Get tenantId logic to link phone number (Fastlane flow)
            let tenantId = typeof window !== 'undefined' 
                ? window.localStorage.getItem('credoTenantId') || window.localStorage.getItem('tenantId')
                : undefined;

            // If no tenant exists (Guest Checkout), create one NOW so we can link the phone number
            // This ensures that when they Register later, we can claim this tenant + VCs
            if (!tenantId) {
                try {
                   console.log('[Shop] Creating anonymous tenant for Fastlane phone linking...');
                   const auth = await ensurePortalTenant(holderBackend, { holderBackend });
                   tenantId = auth.tenantId;
                } catch (err) {
                   console.error('[Shop] Failed to pre-create tenant:', err);
                   // Proceed anyway, but linking will fail
                }
            }

            const res = await fetch(`${backendUrl}/api/wa/cart/${cart.id}/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerMsisdn: buyerPhone,
                    skipQuote: true,
                    tenantId // Link phone to browser tenant for later registration
                })
            });
            const data = await res.json();

            if (res.status >= 400) {
                throw new Error(data.message || 'Checkout failed');
            }

            setInvoiceUrl(data.invoiceOfferUrl);
            setInvoiceOfferId(data.invoiceOfferId);
            setCheckoutStep('invoice');
        } catch (error: any) {
            console.error('Checkout failed:', error);
            alert(`Checkout failed: ${error.message}`);
        } finally {
            setCheckingOut(false);
        }
    };

    const handleSaveInvoice = async () => {
        if (!invoiceUrl) return;
        setSavingInvoice(true);
        try {
            // Use MAIN backend API for accept-offer (has proper tenant security context)
            const { tenantToken } = await ensurePortalTenant(holderBackend, { holderBackend });
            console.log('[Shop] Saving invoice to wallet with offer:', invoiceUrl.slice(0, 80));
            const response = await axios.post(`${holderBackend}/api/wallet/credentials/accept-offer`, {
                offerUri: invoiceUrl
            }, {
                headers: { 
                    Authorization: `Bearer ${tenantToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('[Shop] Invoice saved successfully:', response.data);
            setInvoiceSaved(true);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                try {
                    const { tenantToken } = await ensurePortalTenant(holderBackend, { forceRefresh: true, holderBackend });
                    const retry = await axios.post(`${holderBackend}/api/wallet/credentials/accept-offer`, {
                        offerUri: invoiceUrl
                    }, {
                        headers: { 
                            Authorization: `Bearer ${tenantToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log('[Shop] Invoice saved successfully after refresh:', retry.data);
                    setInvoiceSaved(true);
                    return;
                } catch (retryError: any) {
                    console.error('[Shop] Retry save invoice failed:', retryError?.response?.data || retryError?.message);
                }
            }
            console.error('[Shop] Failed to save invoice:', e?.response?.data || e?.message);
            alert(`Failed to save invoice: ${e?.response?.data?.message || e?.message}`);
        } finally {
            setSavingInvoice(false);
        }
    };

    const handleSaveReceipt = async () => {
        if (!receiptUrl) return;
        setSavingReceipt(true);
        try {
            // Use MAIN backend API for accept-offer (has proper tenant security context)
            const { tenantToken } = await ensurePortalTenant(holderBackend, { holderBackend });
            console.log('[Shop] Saving receipt to wallet with offer:', receiptUrl.slice(0, 80));
            const response = await axios.post(`${holderBackend}/api/wallet/credentials/accept-offer`, {
                offerUri: receiptUrl
            }, {
                headers: { 
                    Authorization: `Bearer ${tenantToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('[Shop] Receipt saved successfully:', response.data);
            setReceiptSaved(true);
        } catch (e: any) {
            const status = e?.response?.status;
            if (status === 401) {
                try {
                    const { tenantToken } = await ensurePortalTenant(holderBackend, { forceRefresh: true, holderBackend });
                    const retry = await axios.post(`${holderBackend}/api/wallet/credentials/accept-offer`, {
                        offerUri: receiptUrl
                    }, {
                        headers: { 
                            Authorization: `Bearer ${tenantToken}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log('[Shop] Receipt saved successfully after refresh:', retry.data);
                    setReceiptSaved(true);
                    return;
                } catch (retryError: any) {
                    console.error('[Shop] Retry save receipt failed:', retryError?.response?.data || retryError?.message);
                }
            }
            console.error('[Shop] Failed to save receipt:', e?.response?.data || e?.message);
            alert(`Failed to save receipt: ${e?.response?.data?.message || e?.message}`);
        } finally {
            setSavingReceipt(false);
        }
    };

    // Grouping
    const categories = Array.from(new Set(items.map(i => i.category || 'Uncategorized'))).sort();
    const groupedItems: Record<string, CatalogItem[]> = {};
    categories.forEach(cat => {
        groupedItems[cat] = items.filter(i => (i.category || 'Uncategorized') === cat);
    });

    const summaryLines = (tone?: 'green') =>
        cart ? (
            <Paper
                withBorder
                p="md"
                radius="md"
                bg={tone ? 'var(--mantine-color-green-light)' : 'var(--mantine-color-default-hover)'}
                style={tone ? { borderColor: 'var(--mantine-color-green-light-hover)' } : undefined}
            >
                <Stack gap="xs">
                    <Text fw={600} size="sm">{tone ? 'Paid items' : 'Order summary'}</Text>
                    <Divider />
                    {cart.items.map((item, i) => (
                        <Group key={i} justify="space-between" wrap="nowrap">
                            <Text size="sm">{item.quantity}x {item.title}</Text>
                            <Text size="sm" fw={500}>{formatCurrency(item.price * item.quantity, cart.currency)}</Text>
                        </Group>
                    ))}
                    <Divider />
                    <Group justify="space-between" wrap="nowrap">
                        <Text fw={700}>{tone ? 'Total paid' : 'Total'}</Text>
                        <Text fw={700}>{formatCurrency(cart.total, cart.currency)}</Text>
                    </Group>
                </Stack>
            </Paper>
        ) : null;

    const basketCount = cart ? cart.items.reduce((acc, i) => acc + i.quantity, 0) : 0;

    return (
        <Layout title="Shop">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                {/* Header */}
                <Box
                    py="sm"
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        background: 'var(--mantine-color-body)',
                        borderBottom: '1px solid var(--mantine-color-default-border)',
                    }}
                >
                    <Group justify="space-between" wrap="nowrap">
                        <div>
                            <Title order={2}>{PRODUCT_NAME} Shop</Title>
                            <Text size="sm" c="dimmed" mt={4}>Checked business store</Text>
                        </div>
                        <Indicator
                            label={basketCount}
                            size={18}
                            color="red"
                            disabled={basketCount === 0}
                            offset={4}
                        >
                            <ActionIcon
                                variant="subtle"
                                color="blue"
                                size="xl"
                                radius="xl"
                                aria-label="Open basket"
                                onClick={() => setIsCartOpen(true)}
                            >
                                <IconShoppingBag size={26} stroke={1.6} />
                            </ActionIcon>
                        </Indicator>
                    </Group>
                </Box>

                {/* Items Grid */}
                {isLoading && !cart ? (
                    <Center py={80}><Loader /></Center>
                ) : (
                    <Stack gap={48}>
                        {categories.map(category => (
                            <Stack key={category} gap="md">
                                <Title order={3}>{category}</Title>
                                <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="lg">
                                    {groupedItems[category].map(item => (
                                        <Card key={item.id} withBorder radius="md" padding="md" h="100%">
                                            <Card.Section pos="relative">
                                                <AspectRatio ratio={4 / 3}>
                                                    {item.images?.[0] ? (
                                                        <Image src={item.images[0]} alt={item.title} fit="cover" />
                                                    ) : (
                                                        <Center bg="var(--mantine-color-default-hover)" c="dimmed">
                                                            <IconBox size={48} stroke={1.4} />
                                                        </Center>
                                                    )}
                                                </AspectRatio>
                                                <ActionIcon
                                                    variant="default"
                                                    radius="xl"
                                                    size="lg"
                                                    aria-label={`Add ${item.title}`}
                                                    disabled={item.stockLeft === 0}
                                                    onClick={() => addToCart(item)}
                                                    style={{ position: 'absolute', bottom: 12, right: 12, boxShadow: 'var(--mantine-shadow-md)' }}
                                                >
                                                    <IconPlus size={18} color="var(--mantine-color-blue-filled)" />
                                                </ActionIcon>
                                            </Card.Section>
                                            <Stack gap={4} mt="md" style={{ flex: 1 }}>
                                                <Text fw={600}>{item.title}</Text>
                                                <Text size="sm" c="dimmed" lineClamp={2} style={{ flex: 1 }}>{item.description}</Text>
                                            </Stack>
                                            <Group justify="space-between" mt="sm" wrap="nowrap">
                                                <Text fw={700} size="lg" c="blue">
                                                    {formatCurrency(item.price, item.currency)}
                                                </Text>
                                                {item.stockLeft === 0 ? (
                                                    <Text size="sm" fw={500} c="dimmed">Sold out</Text>
                                                ) : (
                                                    <Button variant="subtle" color="blue" size="compact-sm" onClick={() => addToCart(item)}>
                                                        {item.stockLeft !== undefined ? `Add · ${item.stockLeft} left` : 'Add'}
                                                    </Button>
                                                )}
                                            </Group>
                                        </Card>
                                    ))}
                                </SimpleGrid>
                            </Stack>
                        ))}
                    </Stack>
                )}

                {/* Cart Modal / Drawer */}
                <Modal
                    opened={isCartOpen}
                    onClose={() => setIsCartOpen(false)}
                    title={<Text fw={700} size="lg">Shopping basket</Text>}
                    size="lg"
                >
                    {checkoutStep === 'cart' && (
                        <>
                            {!cart || cart.items.length === 0 ? (
                                <Stack align="center" gap="sm" py="xl">
                                    <ThemeIcon variant="light" color="gray" size={64} radius="xl">
                                        <IconShoppingBag size={36} stroke={1.4} />
                                    </ThemeIcon>
                                    <Text c="dimmed">Your basket is empty</Text>
                                    <Button variant="light" onClick={() => setIsCartOpen(false)} mt="md">Continue Shopping</Button>
                                </Stack>
                            ) : (
                                <Stack gap="md">
                                    <Stack gap={0}>
                                        {cart.items.map((item, idx) => (
                                            <Group
                                                key={idx}
                                                gap="md"
                                                py="sm"
                                                wrap="nowrap"
                                                style={idx < cart.items.length - 1 ? { borderBottom: '1px solid var(--mantine-color-default-border)' } : undefined}
                                            >
                                                <ThemeIcon variant="light" color="gray" size={56} radius="md">
                                                    <IconBox size={28} stroke={1.4} />
                                                </ThemeIcon>
                                                <Box style={{ flex: 1, minWidth: 0 }}>
                                                    <Text fw={500}>{item.title}</Text>
                                                    <Text size="sm" c="dimmed">{formatCurrency(item.price, cart.currency)} x {item.quantity}</Text>
                                                </Box>
                                                <Text fw={700}>
                                                    {formatCurrency(item.price * item.quantity, cart.currency)}
                                                </Text>
                                            </Group>
                                        ))}
                                    </Stack>

                                    <Divider />
                                    <Group justify="space-between">
                                        <Text fw={700} size="lg">Total</Text>
                                        <Text fw={700} size="lg">{formatCurrency(cart.total, cart.currency)}</Text>
                                    </Group>
                                    <div>
                                        <Button
                                            fullWidth
                                            size="lg"
                                            color="blue"
                                            onClick={handleCheckout}
                                        >
                                            Checkout
                                        </Button>
                                        <Button
                                            fullWidth
                                            variant="subtle"
                                            color="gray"
                                            mt="xs"
                                            leftSection={<IconTrash size={16} />}
                                            onClick={emptyBasket}
                                        >
                                            Empty basket
                                        </Button>
                                    </div>
                                </Stack>
                            )}
                        </>
                    )}

                    {checkoutStep === 'phone' && (
                        <Stack gap="md" py="md">
                            <div>
                                <Title order={3}>Contact details</Title>
                                <Text size="sm" c="dimmed" mt={4}>Please enter your phone number for payment notifications.</Text>
                            </div>

                            <PhoneField
                                surface="portal"
                                label="Phone number"
                                value={buyerPhone}
                                onChange={setBuyerPhone}
                                size="md"
                            />

                            <div>
                                <Button
                                    fullWidth
                                    size="lg"
                                    color="green"
                                    onClick={submitCheckout}
                                    loading={checkingOut}
                                    disabled={!buyerPhone}
                                >
                                    Proceed to Payment
                                </Button>

                                <Button
                                    fullWidth
                                    variant="subtle"
                                    color="gray"
                                    mt="xs"
                                    onClick={() => setCheckoutStep('cart')}
                                >
                                    Back to basket
                                </Button>
                            </div>
                        </Stack>
                    )}

                    {checkoutStep === 'invoice' && (
                        <Stack gap="md" py="md">
                            <Stack align="center" gap="xs">
                                <ThemeIcon variant="light" color="green" size={64} radius="xl">
                                    <IconCircleCheck size={40} stroke={1.5} />
                                </ThemeIcon>
                                <Title order={3}>Order quoted</Title>
                            </Stack>

                            {summaryLines()}

                            <Text c="dimmed" ta="center">Check the invoice details and keep a copy before you pay.</Text>

                            {!invoiceSaved ? (
                                <Paper
                                    withBorder
                                    p="lg"
                                    radius="md"
                                    bg="var(--mantine-color-blue-light)"
                                    style={{ borderColor: 'var(--mantine-color-blue-light-hover)' }}
                                >
                                    <Stack gap="xs" align="center">
                                        <Group gap="xs" justify="center">
                                            <IconFileInvoice size={20} color="var(--mantine-color-blue-light-color)" />
                                            <Text fw={700} c="var(--mantine-color-blue-light-color)">Keep this invoice</Text>
                                        </Group>
                                        <Text size="sm" c="var(--mantine-color-blue-light-color)" ta="center">Save your invoice for proof of purchase.</Text>
                                        <Button
                                            onClick={handleSaveInvoice}
                                            loading={savingInvoice}
                                            fullWidth
                                            color="blue"
                                            size="md"
                                            mt="xs"
                                            leftSection={<IconFileInvoice size={18} />}
                                        >
                                            Save Invoice
                                        </Button>
                                    </Stack>
                                </Paper>
                            ) : (
                                <Alert color="green" title="Invoice saved" icon={<IconCircleCheck size={20} />}>
                                    Your invoice is saved. You can use it for proof of this order.
                                </Alert>
                            )}

                            {invoiceSaved && (
                                <Stack gap="xs" align="center">
                                    <Paper w="100%" p="xs" radius="md" bg="var(--mantine-color-blue-light)">
                                        <Group gap="xs" justify="center">
                                            <Loader size="xs" color="blue" />
                                            <Text size="sm" fw={500} c="var(--mantine-color-blue-light-color)">Waiting for payment...</Text>
                                        </Group>
                                    </Paper>
                                    <Text size="xs" c="dimmed">Simulate payment via EcoCash webhook</Text>
                                </Stack>
                            )}
                        </Stack>
                    )}

                    {checkoutStep === 'receipt' && (
                        <Stack gap="md" py="md">
                            <Stack align="center" gap="xs">
                                <ThemeIcon variant="light" color="green" size={80} radius="xl">
                                    <IconCircleCheck size={48} stroke={1.5} />
                                </ThemeIcon>
                                <Title order={2} ta="center">{refunded ? 'Refund recorded' : 'Payment successful'}</Title>
                                {refunded ? (
                                    <Text c="dimmed" ta="center">The business pays you back. {PRODUCT_NAME} does not move the money.</Text>
                                ) : null}
                            </Stack>

                            {cart && (
                                <Box maw={400} w="100%" mx="auto">
                                    {summaryLines('green')}
                                </Box>
                            )}

                            <Text c="dimmed" ta="center">Your receipt has been issued.</Text>

                            {receiptUrl && !receiptSaved && (
                                <Paper
                                    withBorder
                                    p="lg"
                                    radius="md"
                                    bg="var(--mantine-color-green-light)"
                                    style={{ borderColor: 'var(--mantine-color-green-light-hover)' }}
                                >
                                    <Stack gap="xs" align="center">
                                        <Group gap="xs" justify="center">
                                            <IconReceipt size={20} color="var(--mantine-color-green-light-color)" />
                                            <Text fw={700} c="var(--mantine-color-green-light-color)">Keep your receipt</Text>
                                        </Group>
                                        <Text size="sm" c="var(--mantine-color-green-light-color)" ta="center">
                                            Save for proof of payment. Use for disputes, returns, or delivery confirmation.
                                        </Text>
                                        <Button
                                            onClick={handleSaveReceipt}
                                            loading={savingReceipt}
                                            fullWidth
                                            color="green"
                                            size="md"
                                            mt="xs"
                                            leftSection={<IconReceipt size={18} />}
                                        >
                                            Save Receipt
                                        </Button>
                                    </Stack>
                                </Paper>
                            )}

                            {receiptSaved && (
                                <>
                                    <Alert color="green" title="Receipt saved" icon={<IconCircleCheck size={20} />}>
                                        Receipt has been secured. You can share it via WhatsApp.
                                    </Alert>
                                    <Button
                                        fullWidth
                                        color="green"
                                        size="md"
                                        leftSection={<IconBrandWhatsapp size={18} />}
                                        onClick={() => {
                                            const msg = encodeURIComponent(
                                                `🧾 Payment Receipt\n\n` +
                                                `Order: ${cart?.id || 'N/A'}\n` +
                                                `Amount: ${cart ? formatCurrency(cart.total, cart.currency) : 'N/A'}\n` +
                                                `Status: ✅ Paid\n\n` +
                                                `Save your receipt:\n${receiptUrl || ''}`
                                            );
                                            window.open(`https://wa.me/?text=${msg}`, '_blank');
                                        }}
                                    >
                                        Share to WhatsApp
                                    </Button>
                                </>
                            )}

                            {!refunded && cart?.status === 'paid' ? (
                                <Button
                                    fullWidth
                                    variant="light"
                                    color="gray"
                                    loading={refunding}
                                    onClick={async () => {
                                        setRefunding(true);
                                        setRefundNote('');
                                        try {
                                            const res = await fetch(`${backendUrl}/api/wa/cart/${cart.id}/refund`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ reason: 'Customer asked' }),
                                            });
                                            const data = await res.json().catch(() => ({}));
                                            if (!res.ok) throw new Error(data.message || 'This basket could not be refunded.');
                                            setRefunded(true);
                                            setCart({ ...cart, status: 'refunded' });
                                        } catch (error: any) {
                                            setRefundNote(error?.message || 'This basket could not be refunded.');
                                        } finally {
                                            setRefunding(false);
                                        }
                                    }}
                                >
                                    Record a refund
                                </Button>
                            ) : null}
                            {refundNote ? <Text size="sm" c="red">{refundNote}</Text> : null}
                            <Button
                                fullWidth
                                size="lg"
                                variant="outline"
                                onClick={() => {
                                    setIsCartOpen(false);
                                    setCheckoutStep('cart');
                                    setCart(null);
                                    localStorage.removeItem('credo_cart_id');
                                }}
                            >
                                Continue Shopping
                            </Button>
                        </Stack>
                    )}
                </Modal>
            </Stack>
        </Layout>
    );
}
