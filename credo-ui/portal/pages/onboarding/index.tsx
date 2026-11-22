import { useEffect } from 'react';
import { useRouter } from 'next/router';

/** Team onboarding lives in HR operations: invite, send staff cards and see who is ready. */
export default function OnboardingRedirect() {
    const router = useRouter();
    useEffect(() => {
        void router.replace('/hr?tab=team');
    }, [router]);
    return null;
}
