import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import {
    ShoppingBagIcon,
    PlusIcon,
    MinusIcon,
    TrashIcon,
    XMarkIcon,
    CheckCircleIcon,
    CubeIcon
} from '@heroicons/react/24/outline';
import { BRAND, formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import { Loader, Modal, Button, TextInput, NumberInput, Alert } from '@mantine/core';
import { useCartPolling } from '@/utils/useCartPolling';
import { useRouter } from 'next/router';
import axios from 'axios';
import { ensurePortalTenant } from '@/utils/portalTenant';
import { IconWallet, IconReceipt, IconBrandWhatsapp } from '@tabler/icons-react';

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
}

interface CartItem {
    itemId: string;
    title: string;
    quantity: number;
    price: number;
}

interface Cart {
    id: string;
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

    const env = useContext(EnvContext);
    const router = useRouter();
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const holderBackend = env.NEXT_PUBLIC_HOLDER_URL || 'http://localhost:7000';

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
                if (data.status === 'paid') {
                    setCheckoutStep('receipt');
                    if (data.receiptOfferUrl) {
                        setReceiptUrl(data.receiptOfferUrl);
                    }
                    setIsCartOpen(true);
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
                setCart(updatedCart);
                setIsCartOpen(true);
            }
        } catch (error) {
            console.error('Failed to add to cart:', error);
            alert('Failed to add item to cart');
        } finally {
            setIsLoading(false);
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
            alert(`Failed to save invoice to wallet: ${e?.response?.data?.message || e?.message}`);
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
            alert(`Failed to save receipt to wallet: ${e?.response?.data?.message || e?.message}`);
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

    return (
        <Layout title="Shop">
            <div className="px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 sticky top-0 z-20 bg-white/80 backdrop-blur py-4 -mx-4 px-4 border-b border-gray-100">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: BRAND.dark }}>Credentis Shop</h1>
                        <p className="text-sm text-gray-500">Verified Merchant Store</p>
                    </div>
                    <button
                        onClick={() => setIsCartOpen(true)}
                        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <ShoppingBagIcon className="h-7 w-7" style={{ color: BRAND.curious }} />
                        {cart && cart.items.length > 0 && (
                            <span className="absolute top-0 right-0 -mt-1 -mr-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                {cart.items.reduce((acc, i) => acc + i.quantity, 0)}
                            </span>
                        )}
                    </button>
                </div>

                {/* Items Grid */}
                {isLoading && !cart ? (
                    <div className="flex justify-center py-20"><Loader /></div>
                ) : (
                    <div className="space-y-12">
                        {categories.map(category => (
                            <div key={category}>
                                <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: BRAND.dark }}>
                                    {category}
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                    {groupedItems[category].map(item => (
                                        <div key={item.id} className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden flex flex-col h-full">
                                            <div className="aspect-[4/3] bg-gray-100 relative group">
                                                {item.images?.[0] ? (
                                                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300"><CubeIcon className="w-12 h-12" /></div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                <button
                                                    onClick={() => addToCart(item)}
                                                    className="absolute bottom-3 right-3 bg-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300"
                                                >
                                                    <PlusIcon className="h-5 w-5 text-blue-600" />
                                                </button>
                                            </div>
                                            <div className="p-4 flex-1 flex flex-col">
                                                <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                                                <p className="text-gray-500 text-sm line-clamp-2 mb-3 flex-1">{item.description}</p>
                                                <div className="flex justify-between items-center mt-auto">
                                                    <span className="font-bold text-lg" style={{ color: BRAND.curious }}>
                                                        {formatCurrency(item.price, item.currency)}
                                                    </span>
                                                    <button
                                                        onClick={() => addToCart(item)}
                                                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Cart Modal / Drawer */}
                <Modal
                    opened={isCartOpen}
                    onClose={() => setIsCartOpen(false)}
                    title={<span className="font-bold text-lg">Shopping Cart</span>}
                    size="lg"
                >
                    {checkoutStep === 'cart' && (
                        <>
                            {!cart || cart.items.length === 0 ? (
                                <div className="text-center py-10">
                                    <ShoppingBagIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                    <p className="text-gray-500">Your cart is empty</p>
                                    <Button variant="light" onClick={() => setIsCartOpen(false)} mt="md">Continue Shopping</Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {cart.items.map((item, idx) => (
                                        <div key={idx} className="flex gap-4 py-3 border-b last:border-0">
                                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                                                <CubeIcon className="w-8 h-8 text-gray-400" />
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-medium">{item.title}</h4>
                                                <div className="text-sm text-gray-500">{formatCurrency(item.price, cart.currency)} x {item.quantity}</div>
                                            </div>
                                            <div className="font-bold">
                                                {formatCurrency(item.price * item.quantity, cart.currency)}
                                            </div>
                                        </div>
                                    ))}

                                    <div className="mt-6 pt-4 border-t border-gray-200">
                                        <div className="flex justify-between text-lg font-bold mb-6">
                                            <span>Total</span>
                                            <span>{formatCurrency(cart.total, cart.currency)}</span>
                                        </div>
                                        <Button
                                            fullWidth
                                            size="lg"
                                            color="blue"
                                            onClick={handleCheckout}
                                        >
                                            Checkout
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {checkoutStep === 'phone' && (
                        <div className="py-6">
                            <h3 className="text-xl font-bold mb-4">Contact Details</h3>
                            <p className="text-gray-500 mb-6 text-sm">Please enter your phone number for payment notifications.</p>

                            <TextInput
                                label="Phone Number (with country code)"
                                placeholder="26377xxxxxxx"
                                value={buyerPhone}
                                onChange={(e) => setBuyerPhone(e.target.value)}
                                className="mb-6"
                                size="md"
                            />

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
                                className="mt-2"
                                onClick={() => setCheckoutStep('cart')}
                            >
                                Back to Cart
                            </Button>
                        </div>
                    )}

                    {checkoutStep === 'invoice' && (
                        <div className="text-center py-6">
                            <CheckCircleIcon className="w-16 h-16 mx-auto text-green-500 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Order Quoted!</h3>

                            {/* CAET TEMS RESTORED */}
                            {cart && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                                    <h4 className="font-bold text-sm text-gray-700 mb-2 border-b pb-1">Order Summary</h4>
                                    <ul className="space-y-2 mb-3">
                                        {cart.items.map((item, i) => (
                                            <li key={i} className="flex justify-between text-sm">
                                                <span>{item.quantity}x {item.title}</span>
                                                <span className="font-medium">{formatCurrency(item.price * item.quantity, cart.currency)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex justify-between font-bold border-t pt-2">
                                        <span>Total</span>
                                        <span>{formatCurrency(cart.total, cart.currency)}</span>
                                    </div>
                                </div>
                            )}

                            <p className="text-gray-600 mb-6">Verify invoice details and save to your wallet before payment.</p>

                            {!invoiceSaved ? (
                                <div className="mb-8 p-6 bg-blue-50 rounded-xl border border-blue-100">
                                    <h4 className="font-bold text-blue-900 mb-2 flex items-center justify-center gap-2">
                                        <IconWallet size={20} /> Keep this Invoice
                                    </h4>
                                    <p className="text-sm text-blue-700 mb-4">Save your invoice for proof of purchase.</p>
                                    <Button
                                        onClick={handleSaveInvoice}
                                        loading={savingInvoice}
                                        fullWidth
                                        color="blue"
                                        size="md"
                                        leftSection={<IconWallet size={18} />}
                                    >
                                        Save Invoice
                                    </Button>
                                </div>
                            ) : (
                                <Alert color="green" title="Invoice Saved" icon={<CheckCircleIcon className="h-5 w-5" />} mb="lg" className="text-left">
                                    Your invoice is saved. You can use it for proof of this order.
                                </Alert>
                            )}

                            {invoiceSaved && (
                                <>
                                    <div className="animate-pulse flex items-center justify-center gap-2 text-sm text-blue-600 font-medium bg-blue-50 py-2 rounded-lg mb-4">
                                        <Loader size="xs" />
                                        Waiting for Payment...
                                    </div>
                                    <p className="text-xs text-gray-400">Simulate payment via EcoCash webhook</p>
                                </>
                            )}
                        </div>
                    )}

                    {checkoutStep === 'receipt' && (
                        <div className="text-center py-6">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircleIcon className="w-12 h-12 text-green-600" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Payment Successful!</h3>

                            {/* CAET TEMS RESTORED */}
                            {cart && (
                                <div className="bg-green-50 rounded-lg p-4 mb-6 text-left mx-auto max-w-sm border border-green-100">
                                    <h4 className="font-bold text-sm text-green-800 mb-2 border-b border-green-200 pb-1">Paid Items</h4>
                                    <ul className="space-y-2 mb-3">
                                        {cart.items.map((item, i) => (
                                            <li key={i} className="flex justify-between text-sm text-green-900">
                                                <span>{item.quantity}x {item.title}</span>
                                                <span className="font-medium">{formatCurrency(item.price * item.quantity, cart.currency)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex justify-between font-bold border-t border-green-200 pt-2 text-green-900">
                                        <span>Total Paid</span>
                                        <span>{formatCurrency(cart.total, cart.currency)}</span>
                                    </div>
                                </div>
                            )}

                            <p className="text-gray-600 mb-8">Your receipt has been issued.</p>

                            {receiptUrl && !receiptSaved && (
                                <div className="mb-8 p-6 bg-green-50 rounded-xl border border-green-100">
                                    <h4 className="font-bold text-green-900 mb-2 flex items-center justify-center gap-2">
                                        <IconReceipt size={20} /> Keep Your Receipt
                                    </h4>
                                    <p className="text-sm text-green-700 mb-4">Save for proof of payment. Use for disputes, returns, or delivery confirmation.</p>
                                    <Button
                                        onClick={handleSaveReceipt}
                                        loading={savingReceipt}
                                        fullWidth
                                        color="green"
                                        size="md"
                                        leftSection={<IconReceipt size={18} />}
                                    >
                                        Save Receipt
                                    </Button>
                                </div>
                            )}

                            {receiptSaved && (
                                <>
                                    <Alert color="green" title="Receipt Saved" icon={<CheckCircleIcon className="h-5 w-5" />} mb="lg" className="text-left">
                                        Receipt has been secured. You can share it via WhatsApp.
                                    </Alert>
                                    <Button
                                        fullWidth
                                        color="green"
                                        size="md"
                                        mb="md"
                                        leftSection={<IconBrandWhatsapp size={18} />}
                                        onClick={() => {
                                            const msg = encodeURIComponent(
                                                `🧾 Payment Receipt\n\n` +
                                                `Order: ${cart?.id || 'N/A'}\n` +
                                                `Amount: ${cart ? formatCurrency(cart.total, cart.currency) : 'N/A'}\n` +
                                                `Status: ✅ Paid\n\n` +
                                                `Save your verifiable receipt:\n${receiptUrl || ''}`
                                            );
                                            window.open(`https://wa.me/?text=${msg}`, '_blank');
                                        }}
                                    >
                                        Share to WhatsApp
                                    </Button>
                                </>
                            )}

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
                        </div>
                    )}
                </Modal>
            </div>
        </Layout>
    );
}
