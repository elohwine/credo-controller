import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function HRIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/hr/operations');
  }, [router]);
  
  return null;
}
