import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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

export default function CatalogPage() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
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

    useEffect(() => {
        fetchCatalogItems();
    }, []);

    const fetchCatalogItems = async () => {
        try {
            const res = await fetch('http://localhost:3000/api/catalog/search?query=');
            const data = await res.json();
            setItems(data.items || []);
        } catch (error) {
            console.error('Failed to fetch catalog:', error);
        }
    };

    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3000/api/catalog/items', {
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
        }
    };

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout title="Catalog Management">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="sm:flex sm:items-center">
                    <div className="sm:flex-auto">
                        <h1 className="text-2xl font-semibold text-gray-900">Catalog Items</h1>
                        <p className="mt-2 text-sm text-gray-700">
                            Manage your product catalog for e-commerce transactions
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                        >
                            <PlusIcon className="h-5 w-5 mr-2" />
                            Add Item
                        </button>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search items..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full rounded-md border-gray-300 pl-10 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                </div>

                <div className="mt-8 flex flex-col">
                    <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                        <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">SKU</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Category</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Price</th>
                                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Stock</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {filteredItems.map((item) => (
                                            <tr key={item.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">{item.sku}</td>
                                                <td className="px-3 py-4 text-sm text-gray-900">{item.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.category || '-'}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">${item.price}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${item.inStock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {item.inStock ? 'In Stock' : 'Out of Stock'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {showCreateModal && (
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Catalog Item</h3>
                            <form onSubmit={handleCreateItem} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Name</label>
                                    <input type="text" required value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">SKU</label>
                                    <input type="text" required value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Price (USD)</label>
                                    <input type="number" step="0.01" required value={newItem.price} onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value)})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} rows={3} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                                <div className="flex justify-end space-x-3">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                        Cancel
                                    </button>
                                    <button type="submit" className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
                                        Create
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
