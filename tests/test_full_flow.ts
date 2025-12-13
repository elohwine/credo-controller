import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function testFullFlow() {
    console.log('\n=== FULL CREDENTIAL ISSUANCE FLOW TEST ===\n');

    try {
        // 1. Register user
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
        console.log('✓ Registered, wallet ID:', walletId);

        // 2. Login
        console.log(`\n2. Logging in...`);
        const loginRes = await axios.post(`${BASE_URL}/api/wallet/auth/login`, {
            username,
            password
        });
        const token = loginRes.data.token;
        const offerUri = loginRes.data.credentialOfferUri;
        console.log('✓ Logged in, received token and offer URI:', offerUri);

        //3. Get DIDs
        console.log(`\n3. Getting DIDs for wallet...`);
        const didsRes = await axios.get(`${BASE_URL}/api/wallet/wallet/${encodeURIComponent(walletId)}/dids`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const did = didsRes.data[0]?.did;
        console.log('✓ Got DID:', did);

        // 4. Resolve offer
        console.log(`\n4. Resolving credential offer...`);
        const resolveRes = await axios.post(
            `${BASE_URL}/api/wallet/wallet/${encodeURIComponent(walletId)}/exchange/resolveCredentialOffer`,
            { credential_offer_uri: offerUri },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('✓ Offer resolved:', resolveRes.data);

        // 5. Accept/Use offer
        console.log(`\n5. Accepting credential (useOfferRequest)...`);
        console.log(`  URL: ${BASE_URL}/api/wallet/wallet/${encodeURIComponent(walletId)}/exchange/useOfferRequest?did=${encodeURIComponent(did)}`);
        console.log(`  Body: ${offerUri}`);

        const acceptRes = await axios.post(
            `${BASE_URL}/api/wallet/wallet/${encodeURIComponent(walletId)}/exchange/useOfferRequest?did=${encodeURIComponent(did)}`,
            offerUri, // The raw offer string as body
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'text/plain' // Send as plain text string
                }
            }
        );
        console.log('✓ Credential accepted!', acceptRes.data);

        console.log('\n✅ FULL FLOW COMPLETED SUCCESSFULLY!\n');
    } catch (error: any) {
        console.error('\n❌ FLOW FAILED:');
        console.error('  Status:', error.response?.status);
        console.error('  Status Text:', error.response?.statusText);
        console.error('  Content-Type:', error.response?.headers['content-type']);
        console.error('  Data:', error.response?.data);
        console.error('  Message:', error.message);
        process.exit(1);
    }
}

testFullFlow();
