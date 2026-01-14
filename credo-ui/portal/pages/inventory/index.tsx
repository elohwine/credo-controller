import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function InventoryIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/inventory/dashboard');
  }, [router]);
  
  return null;
}
