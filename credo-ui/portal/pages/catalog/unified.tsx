import { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import axios from 'axios';

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

    return (
        <Layout title="Unified Catalog">
            <Head>
                <title>Unified Catalog - Credentis Portal</title>
            </Head>
            <div className="p-8">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Unified Catalog</h1>
                        <p className="text-gray-600 mt-2">Manage your inventory and Trust Score</p>
                    </div>
                    {trustCard && (
                        <div
                            className={`bg-white p-4 rounded-lg shadow-md border-l-4 ${
                                trustCard.badge === 'gold'
                                    ? 'border-yellow-400'
                                    : trustCard.badge === 'silver'
                                        ? 'border-gray-400'
                                        : trustCard.badge === 'bronze'
                                            ? 'border-orange-600'
                                            : 'border-blue-400'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="text-2xl font-bold">{trustCard.score}</div>
                                <div className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                                    {trustCard.badge} Merchant
                                </div>
                            </div>
                            <div className="mt-3 space-y-1">
                                {trustCard.topDrivers.map((d, i) => (
                                    <div key={i} className="flex justify-between text-xs gap-4">
                                        <span className="text-gray-600 flex gap-1 items-center">
                                            {d.icon} {d.name}
                                        </span>
                                        <span className="font-medium text-green-600">{d.value}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-white">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Item
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Price
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900">{item.title}</div>
                                                <div className="text-sm text-gray-500">{item.description}</div>
                                                <div className="text-xs text-gray-400 mt-1">SKU: {item.sku}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {item.currency} {item.price.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium">
                                                <button
                                                    onClick={() => generateWaLink(item.id)}
                                                    className="text-green-600 hover:text-green-900 flex items-center gap-1"
                                                >
                                                    <span className="text-lg">📱</span> WhatsApp Link
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow h-fit">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h2>
                        <form onSubmit={handleCreateItem} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Title</label>
                                <input
                                    type="text"
                                    required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                    value={newItem.title}
                                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                <textarea
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Price (USD)</label>
                                    <input
                                        type="number"
                                        required
                                        step="0.01"
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                        value={newItem.price}
                                        onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">SKU</label>
                                    <input
                                        type="text"
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                        value={newItem.sku}
                                        onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Add Item'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
