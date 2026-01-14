import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { ChatBubbleLeftRightIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';

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
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h1 className="text-2xl font-semibold text-gray-900">WhatsApp Commerce</h1>
                        <p className="mt-2 text-sm text-gray-700">
                            Manage WhatsApp shopping carts and customer interactions
                        </p>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Carts List */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                            <ShoppingCartIcon className="h-6 w-6 mr-2 text-indigo-600" />
                            Active Carts
                        </h3>
                        <div className="space-y-3">
                            {carts.map((cart) => (
                                <div
                                    key={cart.id}
                                    onClick={() => setSelectedCart(cart)}
                                    className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{cart.customerId}</p>
                                            <p className="text-xs text-gray-500 mt-1">{cart.items.length} items</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-gray-900">${cart.total?.toFixed(2)}</p>
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
                        </div>
                    </div>

                    {/* Cart Details */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Cart Details</h3>
                        {selectedCart ? (
                            <div>
                                <dl className="space-y-3">
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500">Customer ID</dt>
                                        <dd className="text-sm text-gray-900 mt-1">{selectedCart.customerId}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500">Status</dt>
                                        <dd className="text-sm text-gray-900 mt-1">{selectedCart.status}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500">Items</dt>
                                        <dd className="mt-2 space-y-2">
                                            {selectedCart.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-900">{item.sku} (×{item.quantity})</span>
                                                    <span className="text-gray-500">${(item.price * item.quantity).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </dd>
                                    </div>
                                    <div className="pt-3 border-t">
                                        <div className="flex justify-between">
                                            <dt className="text-sm font-medium text-gray-900">Total</dt>
                                            <dd className="text-sm font-semibold text-gray-900">${selectedCart.total?.toFixed(2)}</dd>
                                        </div>
                                    </div>
                                </dl>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Select a cart to view details</p>
                        )}
                    </div>
                </div>

                <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
                    <div className="flex">
                        <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-400" />
                        <div className="ml-3">
                            <p className="text-sm text-blue-700">
                                <strong>WhatsApp Integration:</strong> Customers can browse catalog, add items to cart, and checkout via WhatsApp messaging.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
