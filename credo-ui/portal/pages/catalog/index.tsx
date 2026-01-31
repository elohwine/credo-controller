import React, { useState, useEffect, useContext, useRef } from 'react';
import Layout from '@/components/Layout';
import {
    CubeIcon,
    TagIcon,
    CheckCircleIcon,
    XCircleIcon,
    MagnifyingGlassIcon,
    Bars3Icon,
    Squares2X2Icon,
    ArrowUpTrayIcon,
    PlusIcon,
    ListBulletIcon
} from '@heroicons/react/24/outline';
import { BRAND, formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import { Loader } from '@mantine/core';

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
    <div className="mb-10">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: BRAND.dark }}>
            <span className="w-1.5 h-6 rounded-full" style={{ backgroundColor: BRAND.curious }}></span>
            {title}
            <span className="text-sm font-normal text-gray-400 ml-2">({items.length})</span>
        </h2>

        {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map(item => (
                    <div key={item.id} className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-transparent hover:border-gray-100 overflow-hidden flex flex-col">
                        <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                            {item.images && item.images.length > 0 ? (
                                <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-300">
                                    <CubeIcon className="w-12 h-12" />
                                </div>
                            )}
                            <div className="absolute top-2 right-2">
                                <span className="bg-white/90 backdrop-blur text-xs font-bold px-2 py-1 rounded-md shadow-sm" style={{ color: BRAND.dark }}>
                                    {formatCurrency(item.price, item.currency)}
                                </span>
                            </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className="font-semibold text-lg mb-1 line-clamp-1" style={{ color: BRAND.dark }}>{item.title}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2 mb-3 flex-1">{item.description || 'No description'}</p>

                            <div className="flex items-center justify-between text-xs text-gray-400 mt-auto pt-3 border-t border-gray-50">
                                <span className="font-mono">{item.sku || 'No SKU'}</span>
                                {item.category && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                        <TagIcon className="w-3 h-3" />
                                        {item.category}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                            {item.images?.[0] ? <img src={item.images[0]} className="w-full h-full object-cover" /> : <CubeIcon className="w-6 h-6 text-gray-400" />}
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{item.title}</div>
                                            <div className="text-sm text-gray-500 truncate max-w-xs">{item.description}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800">
                                        {item.category || 'Uncategorized'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{item.sku || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ color: BRAND.curious }}>
                                    {formatCurrency(item.price, item.currency)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
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
            <div className="px-4 sm:px-6 lg:px-8 py-8 transition-all duration-500 ease-in-out">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight" style={{ color: BRAND.dark }}>Catalog</h1>
                        <p className="mt-1 text-gray-500">Manage products, prices, and categories</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="file"
                            ref={fileInputRef}
                            hidden
                            accept=".csv"
                            onChange={handleImport}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing}
                            className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:shadow-sm transition-all shadow-sm"
                        >
                            {importing ? <Loader size="xs" color="gray" className="mr-2" /> : <ArrowUpTrayIcon className="h-5 w-5 mr-2 text-gray-500" />}
                            Import CSV
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-105 hover:shadow-blue-500/40"
                            style={{ backgroundColor: BRAND.curious }}
                        >
                            <PlusIcon className="h-5 w-5 mr-2" />
                            Add Item
                        </button>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 mb-8 sticky top-0 z-10 bg-gray-50/80 backdrop-blur pb-4 pt-2">
                    <div className="relative flex-1">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search catalog..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full rounded-xl border-gray-200 pl-10 py-3 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 transition-all"
                        />
                    </div>

                    <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gray-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <Squares2X2Icon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <ListBulletIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader size="xl" color={BRAND.curious} />
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                        <CubeIcon className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-2 text-sm font-semibold text-gray-900">No items found</h3>
                        <p className="mt-1 text-sm text-gray-500">{searchTerm ? 'Try a different search term.' : 'Get started by creating a new item or importing one.'}</p>
                    </div>
                ) : (
                    <div>
                        {categories.map(category => (
                            <CategorySection
                                key={category}
                                title={category}
                                items={groupedItems[category]}
                                viewMode={viewMode}
                            />
                        ))}
                    </div>
                )}

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                        <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl transform transition-all scale-100 animate-in fade-in zoom-in duration-200">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                                    <CubeIcon className="h-8 w-8" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold" style={{ color: BRAND.dark }}>Add Product</h3>
                                    <p className="text-sm text-gray-500">Create a new item in your catalog</p>
                                </div>
                            </div>
                            <form onSubmit={handleCreateItem} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700">Product Name</label>
                                    <input type="text" required value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 py-2.5" placeholder="e.g., Wireless Headphones" />
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700">SKU</label>
                                        <input type="text" value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 py-2.5" placeholder="SKU-123" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700">Category</label>
                                        <input type="text" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 py-2.5" placeholder="Electronics" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700">Price</label>
                                        <div className="relative">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                <span className="text-gray-500 sm:text-sm">$</span>
                                            </div>
                                            <input type="number" step="0.01" required value={newItem.price} onChange={e => setNewItem({ ...newItem, price: parseFloat(e.target.value) })} className="w-full rounded-xl border-gray-300 shadow-sm pl-7 focus:border-blue-500 focus:ring-blue-500/20 py-2.5" placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700">Currency</label>
                                        <select value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value })} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 py-2.5">
                                            <option value="USD">USD</option>
                                            <option value="ZWL">ZWL</option>
                                            <option value="ZAR">ZAR</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700">Description</label>
                                    <textarea value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} rows={3} className="w-full rounded-xl border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500/20 py-2.5" placeholder="Detailed product description..." />
                                </div>

                                <div className="flex justify-end gap-3 pt-6">
                                    <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
                                    <button type="submit" disabled={isLoading} className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 transition-all hover:translate-y-[-1px]" style={{ backgroundColor: BRAND.curious }}>{isLoading ? 'Creating...' : 'Create Product'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
