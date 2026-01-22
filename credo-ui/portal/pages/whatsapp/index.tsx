import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { BRAND } from '@/lib/theme';
import { ChatBubbleLeftRightIcon, ShoppingCartIcon, DevicePhoneMobileIcon, CurrencyDollarIcon, ClockIcon } from '@heroicons/react/24/outline';

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
    const [selectedCart, setSelectedCart] = useState<Cart | null>(null);

    useEffect(() => {
        fetchCarts();
    }, []);

    const fetchCarts = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/wa/carts');
            const data = await res.json();
            setCarts(data.carts || []);
        } catch (error) {
            console.error('Failed to fetch carts:', error);
        }
    };

    return (
        <Layout title="WhatsApp Commerce">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>WhatsApp Commerce</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>
                            Manage WhatsApp shopping carts and customer interactions
                        </p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
                    {[
                        { label: 'Active Carts', value: carts.filter(c => c.status === 'pending').length, icon: <ShoppingCartIcon className="h-6 w-6" /> },
                        { label: 'Total Sales', value: `$${carts.reduce((sum, c) => sum + (c.total || 0), 0).toFixed(2)}`, icon: <CurrencyDollarIcon className="h-6 w-6" /> },
                        { label: 'Completed Orders', value: carts.filter(c => c.status === 'completed').length, icon: <DevicePhoneMobileIcon className="h-6 w-6" /> },
                    ].map((stat, idx) => (
                        <div key={idx} className="relative overflow-hidden rounded-xl p-6 shadow-sm hover:shadow-md transition-all" style={{ backgroundColor: BRAND.linkWater }}>
                            <dt>
                                <div className="absolute rounded-lg p-3" style={{ backgroundColor: BRAND.curious }}>
                                    <span className="text-white">{stat.icon}</span>
                                </div>
                                <p className="ml-16 truncate text-sm font-medium" style={{ color: BRAND.dark }}>{stat.label}</p>
                            </dt>
                            <dd className="ml-16 flex items-baseline">
                                <p className="text-2xl font-semibold" style={{ color: BRAND.dark }}>{stat.value}</p>
                            </dd>
                        </div>
                    ))}
                </div>

                <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Carts List */}
                    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
                        <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex items-center gap-3">
                                <ShoppingCartIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Active Carts</h3>
                            </div>
                        </div>
                        <div className="p-6 space-y-3">
                            {carts.map((cart) => (
                                <div
                                    key={cart.id}
                                    onClick={() => setSelectedCart(cart)}
                                    className="border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
                                    style={{ borderColor: selectedCart?.id === cart.id ? BRAND.curious : '#E5E7EB' }}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: BRAND.dark }}>{cart.customerId}</p>
                                            <p className="text-xs text-gray-500 mt-1">{cart.items.length} items</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold" style={{ color: BRAND.curious }}>${cart.total?.toFixed(2)}</p>
                                            <span className={`inline-flex mt-1 rounded-full px-2 text-xs font-semibold ${
                                                cart.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                cart.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {cart.status}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">{new Date(cart.createdAt).toLocaleString()}</p>
                                </div>
                            ))}
                            {carts.length === 0 && (
                                <p className="text-center py-8 text-gray-500">No carts found</p>
                            )}
                        </div>
                    </div>

                    {/* Cart Details */}
                    <div className="rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: 'white' }}>
                        <div className="px-6 py-4" style={{ backgroundColor: BRAND.linkWater }}>
                            <div className="flex items-center gap-3">
                                <ClockIcon className="h-5 w-5" style={{ color: BRAND.curious }} />
                                <h3 className="text-lg font-semibold" style={{ color: BRAND.dark }}>Cart Details</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            {selectedCart ? (
                                <div>
                                    <dl className="space-y-3">
                                        <div>
                                            <dt className="text-sm font-medium text-gray-500">Customer ID</dt>
                                            <dd className="text-sm mt-1" style={{ color: BRAND.dark }}>{selectedCart.customerId}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm font-medium text-gray-500">Status</dt>
                                            <dd className="text-sm mt-1" style={{ color: BRAND.dark }}>{selectedCart.status}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm font-medium text-gray-500">Items</dt>
                                            <dd className="mt-2 space-y-2">
                                                {selectedCart.items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm">
                                                        <span style={{ color: BRAND.dark }}>{item.sku} (×{item.quantity})</span>
                                                        <span className="text-gray-500">${(item.price * item.quantity).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </dd>
                                        </div>
                                        <div className="pt-3 border-t">
                                            <div className="flex justify-between">
                                                <dt className="text-sm font-medium" style={{ color: BRAND.dark }}>Total</dt>
                                                <dd className="text-sm font-semibold" style={{ color: BRAND.curious }}>${selectedCart.total?.toFixed(2)}</dd>
                                            </div>
                                        </div>
                                    </dl>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-8">Select a cart to view details</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6 rounded-xl p-4" style={{ backgroundColor: BRAND.linkWater }}>
                    <div className="flex items-start gap-3">
                        <ChatBubbleLeftRightIcon className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.curious }} />
                        <div>
                            <p className="text-sm" style={{ color: BRAND.dark }}>
                                <strong>WhatsApp Integration:</strong> Customers can browse catalog, add items to cart, and checkout via WhatsApp messaging.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
