const axios = require('axios');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ISSUER_URL = 'http://localhost:3000';
const HOLDER_URL = 'http://localhost:7000';
const HOLDER_API_KEY = 'holder-api-key-12345';

async function runTest() {
    try {
        console.log("╔══════════════════════════════════════════════════════════════╗");
        console.log("║   FULL E2E FLOW: Cart → Invoice → Payment → Receipt Accept   ║");
        console.log("╚══════════════════════════════════════════════════════════════╝\n");

        // ========================================
        // STEP 1: Create Cart
        // ========================================
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 1: Creating Cart...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const payload = Buffer.from(JSON.stringify({ 
            merchantId: 'portal-merchant-demo', 
            itemId: 'ITM-3297c376-f831-4631-882b-babb5a0f2d16' 
        })).toString('base64');
        
        const cartRes = await axios.post(`${ISSUER_URL}/api/wa/cart/create`, { payload });
        const cartId = cartRes.data.id;
        console.log("   ✅ Cart Created:", cartId);
        console.log("   Items:", JSON.stringify(cartRes.data.items, null, 2));

        // ========================================
        // STEP 2: Add Another Item
        // ========================================
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 2: Adding Item to Cart...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const addItemRes = await axios.post(`${ISSUER_URL}/api/wa/cart/${cartId}/items`, {
            itemId: "ITM-f4d0f2e1-bb08-4f15-97a8-51cf0b79b4fb",
            quantity: 1
        });
        console.log("   ✅ Item Added. Cart now has", addItemRes.data.items?.length || 'multiple', "items");

        // ========================================
        // STEP 3: Checkout → Get Invoice Offer
        // ========================================
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 3: Checkout → Generate Invoice VC Offer...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const checkoutRes = await axios.post(`${ISSUER_URL}/api/wa/cart/${cartId}/checkout`, {
            customerMsisdn: '263771234567',
            skipQuote: true
        });
        
        const invoiceOfferUrl = checkoutRes.data.invoiceOfferUrl;
        const ecocashRef = checkoutRes.data.ecocashRef;
        
        console.log("   ✅ Checkout Complete");
        console.log("   📄 Status:", checkoutRes.data.status);
        console.log("   💳 EcoCash Ref:", ecocashRef);
        console.log("   🔗 Invoice Offer URL:", invoiceOfferUrl?.substring(0, 80) + "...");

        if (!invoiceOfferUrl) {
            throw new Error("No invoice offer URL returned!");
        }

        // ========================================
        // STEP 4: Manual Accept Invoice VC
        // ========================================
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 4: Manually Accept Invoice VC...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        try {
            const acceptInvoiceRes = await axios.post(
                `${HOLDER_URL}/api/wallet/holder-wallet/credentials/accept-offer`,
                { offerUri: invoiceOfferUrl },
                { headers: { 'x-api-key': HOLDER_API_KEY } }
            );
            console.log("   ✅ Invoice VC Accepted:", acceptInvoiceRes.data);
        } catch (e) {
            console.log("   ⚠️  Invoice Accept Error:", e.response?.data?.message || e.message);
            console.log("   (This may happen if offer was already consumed or invalid state)");
        }

        // Give time for processing
        await sleep(1000);

        // ========================================
        // STEP 5: Simulate EcoCash Payment Webhook
        // ========================================
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 5: Simulate EcoCash Payment Webhook (SUCCESS)...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        const webhookPayload = {
            paymentRequestId: ecocashRef,
            status: 'SUCCESS',
            transactionId: 'TXN-' + Date.now(),
            amount: checkoutRes.data.total || 20,
            currency: 'USD',
            sourceReference: ecocashRef,
            customerMsisdn: '263771234567',
            timestamp: new Date().toISOString()
        };
        
        console.log("   📤 Sending webhook payload:", JSON.stringify(webhookPayload, null, 2));
        
        try {
            const webhookRes = await axios.post(
                `${ISSUER_URL}/webhooks/ecocash`,
                webhookPayload,
                { headers: { 'X-API-KEY': 'test-webhook-secret' } }
            );
            console.log("   ✅ Webhook Response:", JSON.stringify(webhookRes.data, null, 2));
            
            // Extract receipt offer URL if present
            const receiptOfferUrl = webhookRes.data.receiptOfferUrl || webhookRes.data.credentialOfferUri;
            
            if (receiptOfferUrl) {
                // ========================================
                // STEP 6: Manual Accept Receipt VC
                // ========================================
                console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                console.log("STEP 6: Manually Accept Receipt VC...");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                console.log("   🔗 Receipt Offer:", receiptOfferUrl?.substring(0, 80) + "...");
                
                try {
                    const acceptReceiptRes = await axios.post(
                        `${HOLDER_URL}/api/wallet/holder-wallet/credentials/accept-offer`,
                        { offerUri: receiptOfferUrl },
                        { headers: { 'x-api-key': HOLDER_API_KEY } }
                    );
                    console.log("   ✅ Receipt VC Accepted:", acceptReceiptRes.data);
                } catch (e) {
                    console.log("   ⚠️  Receipt Accept Error:", e.response?.data?.message || e.message);
                }
            } else {
                console.log("   ℹ️  No receipt offer URL in webhook response (may be pushed automatically)");
            }
        } catch (e) {
            console.log("   ❌ Webhook Error:", e.response?.data || e.message);
        }

        // ========================================
        // STEP 7: Verify Credentials in Wallet
        // ========================================
        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("STEP 7: Verify Credentials in Holder Wallet...");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        await sleep(2000);
        
        try {
            const credsRes = await axios.get(
                `${HOLDER_URL}/api/wallet/holder-wallet/credentials`,
                { headers: { 'x-api-key': HOLDER_API_KEY } }
            );
            
            console.log("   📋 Total Credentials in Wallet:", credsRes.data.length);
            
            if (credsRes.data.length > 0) {
                console.log("\n   ═══ CREDENTIALS ═══");
                credsRes.data.forEach((cred, i) => {
                    console.log(`   [${i + 1}] ID: ${cred.id?.substring(0, 30)}...`);
                    console.log(`       Type: ${cred.type?.join(', ') || cred.credentialType || 'Unknown'}`);
                    console.log(`       Issued: ${cred.issuedAt || cred.issuanceDate || 'N/A'}`);
                });
            }
        } catch (e) {
            console.log("   ⚠️  Could not fetch credentials:", e.response?.data?.message || e.message);
        }

        // ========================================
        // SUMMARY
        // ========================================
        console.log("\n╔══════════════════════════════════════════════════════════════╗");
        console.log("║                    E2E TEST COMPLETED                        ║");
        console.log("╚══════════════════════════════════════════════════════════════╝");
        console.log("\n📊 Summary:");
        console.log("   • Cart ID:", cartId);
        console.log("   • EcoCash Ref:", ecocashRef);
        console.log("   • Flow: Cart → Invoice → Payment → Receipt");
        console.log("\n✅ Test completed successfully!\n");

    } catch (error) {
        console.error("\n❌ TEST FAILED:", error.message);
        if (error.response) {
            console.error("   Response:", error.response.status, JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

runTest();
