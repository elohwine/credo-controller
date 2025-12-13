
import axios from 'axios';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';

async function run() {
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
        console.log('Register response:', registerRes.data);
        const walletId = registerRes.data.walletId;

        console.log(`2. Logging in user: ${username}`);
        const loginRes = await axios.post(`${BASE_URL}/api/wallet/auth/login`, {
            username,
            password
        });
        console.log('Login response token:', loginRes.data.token ? 'PRESENT' : 'MISSING');
        console.log('Login response offer URI:', loginRes.data.credentialOfferUri);

        const offerUri = loginRes.data.credentialOfferUri;
        if (!offerUri) {
            console.log('No offer URI returned (maybe user already has GenericID?). Exiting.');
            return;
        }

        console.log(`3. Resolving offer URI: ${offerUri}`);
        // The wallet UI sends the offer URI in the body
        const resolveRes = await axios.post(`${BASE_URL}/api/wallet/wallet/${walletId}/exchange/resolveCredentialOffer`, {
            credential_offer_uri: offerUri
        }, {
            headers: {
                Authorization: `Bearer ${loginRes.data.token}`
            }
        });

        console.log('Resolve response:', resolveRes.data);

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

run();
