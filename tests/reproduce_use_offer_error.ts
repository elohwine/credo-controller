import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function testUseOfferRequestErrorHandling() {
    console.log('\n=== TEST: useOfferRequest Error Handling ===');
    try {
        // 1. Register and Login to get a valid token
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
        const token = (await axios.post(`${BASE_URL}/api/wallet/auth/login`, { username, password })).data.token;
        console.log('✓ User registered and logged in');

        // 2. Call useOfferRequest with an INVALID offer URI to trigger an error
        // This simulates the backend failing to parse/fetch/process the offer
        console.log('2. Calling useOfferRequest with invalid offer URI...');

        const invalidBody = {
            credential_offer_uri: 'http://localhost:3000/oidc/credential-offers/INVALID-CODE'
        };

        try {
            await axios.post(
                `${BASE_URL}/api/wallet/wallet/${walletId}/exchange/useOfferRequest?did=did:key:z6MkptSnRQDiagW1SjdNiVVycSk5jZUzu6eRrHpLpMadbb6M`,
                invalidBody,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            console.log('✗ Expected error but got success');
        } catch (error: any) {
            console.log('✓ Received error response');
            console.log('  Status:', error.response?.status);
            console.log('  Content-Type:', error.response?.headers['content-type']);
            console.log('  Body Type:', typeof error.response?.data);
            console.log('  Body:', error.response?.data);

            // Check if body is JSON
            if (typeof error.response?.data === 'string' && error.response.data.startsWith('<!DOCTYPE html>')) {
                console.log('✗ FAIL: Response is HTML, expected JSON');
                process.exit(1);
            } else if (typeof error.response?.data === 'object') {
                console.log('✓ PASS: Response is JSON');
            } else {
                console.log('⚠ WARNING: Response might be plain text:', error.response?.data);
                // If it's a plain string error message, it's still better than HTML but JSON is preferred
            }
        }

    } catch (error: any) {
        console.error('✗ Test setup failed:', error.message);
        process.exit(1);
    }
}

testUseOfferRequestErrorHandling();
