import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { PlusIcon, MagnifyingGlassIcon, CubeIcon, TagIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { BRAND, formatCurrency } from '@/lib/theme';

interface CatalogItem {
    id: string;
    merchantId: string;
    name: string;
    description?: string;
    sku: string;
    price: number;
    currency: string;
    category?: string;
    inStock: boolean;
    createdAt: string;
}

const StatusBadge: React.FC<{ inStock: boolean }> = ({ inStock }) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${inStock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {inStock ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
        {inStock ? 'In Stock' : 'Out of Stock'}
    </span>
);

export default function CatalogPage() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [newItem, setNewItem] = useState({
        merchantId: 'merchant-001',
        name: '',
        description: '',
        sku: '',
        price: 0,
        currency: 'USD',
        category: '',
        inStock: true
    });

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        fetchCatalogItems();
    }, []);

    const fetchCatalogItems = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/catalog/search?query=`);
            const data = await res.json();
            setItems(data.items || []);
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
            const res = await fetch(`${backendUrl}/api/catalog/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if (res.ok) {
                setShowCreateModal(false);
                fetchCatalogItems();
                setNewItem({ merchantId: 'merchant-001', name: '', description: '', sku: '', price: 0, currency: 'USD', category: '', inStock: true });
            }
        } catch (error) {
            console.error('Failed to create item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = [
        { label: 'Total Items', value: items.length, icon: <CubeIcon className="h-6 w-6" /> },
        { label: 'In Stock', value: items.filter(i => i.inStock).length, icon: <CheckCircleIcon className="h-6 w-6" /> },
        { label: 'Out of Stock', value: items.filter(i => !i.inStock).length, icon: <XCircleIcon className="h-6 w-6" /> },
        { label: 'Categories', value: new Set(items.map(i => i.category).filter(Boolean)).size, icon: <TagIcon className="h-6 w-6" /> },
    ];

    return (
        <Layout title="Catalog Management">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Catalog Management</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>Manage your product catalog for e-commerce transactions</p>
                    </div>
                    <div className="mt-4 sm:mt-0">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
                            style={{ backgroundColor: BRAND.curious }}
                        >
                            <PlusIcon className="h-5 w-5 mr-2" />
                            Add Item
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    {stats.map((stat, idx) => (
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

                {/* Search */}
                <div className="mb-6">
                    <div className="relative max-w-md">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <MagnifyingGlassIcon className="h-5 w-5" style={{ color: BRAND.viking }} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by name or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full rounded-lg border-2 pl-10 py-2 transition-all focus:ring-2 focus:ring-opacity-50"
                            style={{ borderColor: BRAND.viking, outline: 'none' }}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl shadow ring-1 ring-black ring-opacity-5">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead style={{ backgroundColor: BRAND.linkWater }}>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>SKU</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Name</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Category</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Price</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase" style={{ color: BRAND.dark }}>Stock</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                                        {isLoading ? 'Loading...' : 'No catalog items yet. Click "Add Item" to create one.'}
                                    </td>
                                </tr>
                            ) : filteredItems.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-mono" style={{ color: BRAND.dark }}>{item.sku}</td>
                                    <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.dark }}>{item.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{item.category || '—'}</td>
                                    <td className="px-6 py-4 text-sm font-medium" style={{ color: BRAND.curious }}>{formatCurrency(item.price, item.currency)}</td>
                                    <td className="px-6 py-4 text-sm"><StatusBadge inStock={item.inStock} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[100]">
                        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                    <CubeIcon className="h-6 w-6" style={{ color: BRAND.curious }} />
                                </div>
                                <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>Add Catalog Item</h3>
                            </div>
                            <form onSubmit={handleCreateItem} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Name</label>
                                    <input type="text" required value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:border-transparent" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>SKU</label>
                                        <input type="text" required value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Category</label>
                                        <input type="text" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Price</label>
                                        <input type="number" step="0.01" required value={newItem.price} onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value)})} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Currency</label>
                                        <select value={newItem.currency} onChange={e => setNewItem({...newItem, currency: e.target.value})} className="w-full rounded-lg border-gray-300 shadow-sm">
                                            <option value="USD">USD</option>
                                            <option value="ZWL">ZWL</option>
                                            <option value="ZAR">ZAR</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1" style={{ color: BRAND.dark }}>Description</label>
                                    <textarea value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} rows={3} className="w-full rounded-lg border-gray-300 shadow-sm" />
                                </div>
                                <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.linkWater }}>
                                    <label className="flex items-center gap-2 text-sm" style={{ color: BRAND.dark }}>
                                        <input type="checkbox" checked={newItem.inStock} onChange={e => setNewItem({...newItem, inStock: e.target.checked})} className="rounded" />
                                        <span className="font-medium">Item is in stock</span>
                                    </label>
                                </div>
                                <div className="flex justify-end gap-3 pt-4">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND.curious }}>{isLoading ? 'Creating...' : 'Create Item'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
