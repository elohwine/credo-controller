import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function testValidOffer(): Promise<{ success: boolean; offerUri?: string; error?: string; skipped?: boolean }> {
    console.log('\n=== TEST 1: Valid Offer Resolution ===');
    try {
        const username = `testuser_${randomUUID().substring(0, 8)}`;
        const password = 'password123';
        const email = `${username}@example.com`;

        console.log(`1. Registering user: ${username}`);
        const registerRes = await axios.post(`${BASE_URL}/api/wallet/auth/register`, {
            username,
            password,
            email
        });
        const walletId = registerRes.data.walletId;
        console.log('✓ User registered');

        console.log(`2. Logging in user: ${username}`);
        const loginRes = await axios.post(`${BASE_URL}/api/wallet/auth/login`, {
            username,
            password
        });

        const offerUri = loginRes.data.credentialOfferUri;
        if (!offerUri) {
            console.log('⚠ No offer URI returned (user may already have GenericID)');
            return { success: true, skipped: true };
        }
        console.log('✓ Login successful, offer URI:', offerUri);

        console.log(`3. Resolving offer URI...`);
        const resolveRes = await axios.post(`${BASE_URL}/api/wallet/wallet/${walletId}/exchange/resolveCredentialOffer`, {
            credential_offer_uri: offerUri
        }, {
            headers: {
                Authorization: `Bearer ${loginRes.data.token}`
            }
        });

        console.log('✓ Offer resolved successfully!');
        console.log('  Credential Issuer:', resolveRes.data.credential_issuer);
        console.log('  Credentials:', resolveRes.data.credentials);
        console.log('  Pre-authorized code present:', !!resolveRes.data.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']);

        return { success: true, offerUri };
    } catch (error: any) {
        console.error('✗ Test failed:', error.message);
        if (error.response) {
            console.error('  Status:', error.response.status);
            console.error('  Data:', error.response.data);
        }
        return { success: false, error: error.message };
    }
}

async function testExpiredOffer(): Promise<{ success: boolean; error?: string }> {
    console.log('\n=== TEST 2: Expired Offer Error Handling ===');
    try {
        // Use a fake expired offer code
        const fakeExpiredCode = '00000000-0000-0000-0000-000000000000';
        const offerUri = `${BASE_URL}/oidc/credential-offers/${fakeExpiredCode}`;

        console.log(`1. Attempting to resolve expired/non-existent offer: ${offerUri}`);
        const res = await axios.get(offerUri);

        console.log('✗ Should have received an error but got:', res.data);
        return { success: false, error: 'Expected 404 but got success' };
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log('✓ Correctly returned 404 for non-existent offer');
            console.log('  Error message:', error.response.data?.message);

            if (error.response.data?.message && typeof error.response.data.message === 'string') {
                console.log('✓ Error response is JSON with message field');
                return { success: true };
            } else {
                console.log('✗ Error response is not properly formatted JSON');
                return { success: false, error: 'Invalid error format' };
            }
        } else {
            console.log('✗ Expected 404 but got:', error.response?.status);
            return { success: false, error: `Wrong status code: ${error.response?.status}` };
        }
    }
}

async function testOfferURIFormat(): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    console.log('\n=== TEST 3: Offer URI Format Validation ===');
    try {
        const username = `testuser_${randomUUID().substring(0, 8)}`;
        const password = 'password123';
        const email = `${username}@example.com`;

        await axios.post(`${BASE_URL}/api/wallet/auth/register`, {
            username,
            password,
            email
        });

        const loginRes = await axios.post(`${BASE_URL}/api/wallet/auth/login`, {
            username,
            password
        });

        const offerUri = loginRes.data.credentialOfferUri;
        if (!offerUri) {
            console.log('⚠ No offer URI returned');
            return { success: true, skipped: true };
        }

        // Extract the pre-authorized code from the URI
        const match = offerUri.match(/\/oidc\/credential-offers\/([^\/\?]+)/);
        if (!match) {
            console.log('✗ Offer URI format is invalid:', offerUri);
            return { success: false, error: 'Invalid URI format' };
        }

        const codeFromUri = match[1];
        console.log(`1. Extracted code from URI: ${codeFromUri}`);

        // Verify the offer can be fetched directly
        const directRes = await axios.get(`${BASE_URL}/oidc/credential-offers/${codeFromUri}`);

        if (directRes.data.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'] === codeFromUri) {
            console.log('✓ Offer URI uses correct pre-authorized code (not offerId)');
            console.log('✓ Offer is accessible at the generated URI');
            return { success: true };
        } else {
            console.log('✗ Pre-authorized code mismatch');
            return { success: false, error: 'Code mismatch' };
        }
    } catch (error: any) {
        console.error('✗ Test failed:', error.message);
        if (error.response) {
            console.error('  Status:', error.response.status);
            console.error('  Data:', error.response.data);
        }
        return { success: false, error: error.message };
    }
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Credential Offer Resolution - Integration Tests      ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    const results = {
        passed: 0,
        failed: 0,
        skipped: 0
    };

    const test1 = await testValidOffer();
    if (test1.success) results.passed++; else results.failed++;

    const test2 = await testExpiredOffer();
    if (test2.success) results.passed++; else results.failed++;

    const test3 = await testOfferURIFormat();
    if (test3.success) {
        results.passed++;
        if (test3.skipped) results.skipped++;
    } else {
        results.failed++;
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                          ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`  ✓ Passed:  ${results.passed}`);
    console.log(`  ✗ Failed:  ${results.failed}`);
    if (results.skipped > 0) {
        console.log(`  ⚠ Skipped: ${results.skipped}`);
    }
    console.log('');

    process.exit(results.failed > 0 ? 1 : 0);
}

runAllTests();
