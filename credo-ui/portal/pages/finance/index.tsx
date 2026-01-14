import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function FinanceIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/finance/reports');
  }, [router]);
  
  return null;
}
