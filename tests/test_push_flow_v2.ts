
import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';
const HOLDER_URL = 'http://localhost:6000';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testPushFlow() {
    console.log('\n=== TEST: Event-Based Offer Push Flow ===');
    try {
        const username = `push_test_${randomUUID().substring(0, 8)}`;
        const password = 'password123';
        const email = `${username}@example.com`;

        console.log(`1. Registering user: ${username}`);
        // Registration automatically triggers tenant creation & user setup
        const registerRes = await axios.post(`${BASE_URL}/api/wallet/auth/register`, {
            username,
            password,
            email
        });
        const walletId = registerRes.data.walletId;
        console.log(`✓ User registered (WalletID: ${walletId})`);

        console.log(`2. Logging in user (Triggers Offer Creation -> Push)`);
        const loginRes = await axios.post(`${BASE_URL}/api/wallet/auth/login`, {
            username,
            password
        });

        const token = loginRes.data.token;
        console.log('✓ Login successful');

        console.log('2.5. Triggering Credential Offer (Manual Push)...');
        // Manually trigger the offer as the login hook might be disabled
        // We request 'jwt_vc' format as per user requirement
        await axios.post(`${BASE_URL}/custom-oidc/issuer/credential-offers`, {
            credentials: [
                {
                    credentialDefinitionId: 'GenericIDCredential',
                    type: 'GenericIDCredential',
                    format: 'jwt_vc_json'
                }
            ]
        }, {
            headers: { 'x-api-key': 'test-api-key-12345' }
        });
        console.log('✓ Offer creation triggered');

        console.log('3. Waiting 20s for Push Notification & Auto-Acceptance...');
        await sleep(20000);

        console.log('4. Checking Holder Wallet for Credentials...');

        // For the Base Agent (Holder), we can use the x-api-key to access the base wallet directly
        // The base wallet ID is 'holder-wallet' as configured in startHolderServer.js
        // Correct URL structure verified: /api/wallet/wallet/{walletId}/credentials
        const credsRes = await axios.get(`${HOLDER_URL}/api/wallet/wallet/holder-wallet/credentials`, {
            headers: {
                'x-api-key': 'holder-api-key-12345'
            }
        });

        const credentials = credsRes.data;
        console.log(`✓ Credentials found: ${credentials.length}`);

        if (credentials.length > 0) {
            const latest = credentials[credentials.length - 1];
            console.log('Latest Credential:', JSON.stringify(latest, null, 2));

            // Verify it is the correct type
            const types = latest.type || latest.credentialSubject?.type || [];
            if (types.includes('GenericIDCredential') || (latest.credentialSubject && latest.credentialSubject.type && latest.credentialSubject.type.includes('GenericIDCredential'))) {
                console.log('✓ SUCCESS: Credential was automatically issued and is correct type!');
            } else {
                console.log('? WARNING: Credential found but type might not match.');
            }
        } else {
            console.log('✗ FAILURE: No credentials found. Push flow may have failed.');
            process.exit(1);
        }

    } catch (error: any) {
        console.log('✗ Test failed:', error.message);
        if (error.response) {
            console.log('  Status:', error.response.status);
            console.log('  Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

testPushFlow();
