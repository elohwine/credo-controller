import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { ensurePortalTenant } from './portalTenant';

export interface Cart {
    id: string;
    merchantId: string;
    buyerPhone?: string;
    status: 'pending' | 'quoted' | 'invoiced' | 'paid' | 'abandoned';
    total: number;
    currency: string;
    items: any[];
    createdAt: string;
}

type CartPollingOptions = {
    enabled?: boolean;
    stopOnStatus?: Array<Cart['status']>;
}

export function useCartPolling(cartId: string | null, onPaid?: (cart: Cart) => void, options?: CartPollingOptions) {
    const [cart, setCart] = useState<Cart | null>(null);
    const [error, setError] = useState<string | null>(null);
    const env = useContext(EnvContext);
    const [stopped, setStopped] = useState(false);

    useEffect(() => {
        if (!cartId || !env?.NEXT_PUBLIC_VC_REPO) return;
        if (options?.enabled === false) return;
        if (stopped) return;

        const pollCart = async () => {
            try {
                // Endpoint is public, no auth needed for polling
                const credoBackend = env.NEXT_PUBLIC_VC_REPO;

                const response = await axios.get(
                    `${credoBackend}/api/wa/cart/${cartId}`
                );
                const data = response.data;
                setCart(data);

                if (data.status === 'paid' && onPaid) {
                    onPaid(data);
                }
                if (options?.stopOnStatus?.includes(data.status)) {
                    setStopped(true);
                }
            } catch (err: any) {
                console.error("Polling error:", err);
                setError(err.message);
            }
        };

        // Poll every 3 seconds
        const intervalId = setInterval(pollCart, 3000);

        // Initial fetch
        pollCart();

        return () => clearInterval(intervalId);
    }, [cartId, env, onPaid, options?.enabled, options?.stopOnStatus, stopped]);

    return { cart, error };
}
