import React, { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';

interface LayoutProps {
    children: ReactNode;
    title?: string;
}

const Layout = ({ children, title = 'Credo Portal' }: LayoutProps) => {
    return (
        <div className="min-h-screen bg-gray-50">
            <Head>
                <title>{title}</title>
                <meta charSet="utf-8" />
                <meta name="viewport" content="initial-scale=1.0, width=device-width" />
            </Head>
            <header className="bg-white shadow">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
                        <nav className="flex space-x-6">
                            <Link href="/" className="text-gray-700 hover:text-gray-900 font-medium">
                                Home
                            </Link>
                            <Link href="/credential-models" className="text-gray-700 hover:text-gray-900 font-medium">
                                Credentials
                            </Link>
                            <Link href="/workflows" className="text-gray-700 hover:text-gray-900 font-medium">
                                Workflows
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>
            <main>
                <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
