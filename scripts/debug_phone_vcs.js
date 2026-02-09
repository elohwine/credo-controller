
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data/persistence.db');
const db = new Database(dbPath, { readonly: true });

const PHONE_INPUT = '0774183277';
const ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY || 'default-dev-key-32-chars-long!!';

function normalizePhone(phone) {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0') && clean.length === 10) {
      clean = '263' + clean.slice(1);
    }
    return clean;
}

function hashData(data) {
    return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

function decryptPII(encryptedData) {
    try {
        const key = ENCRYPTION_KEY;
        const [ivHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32).slice(0, 32)), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null; // Decryption failed
    }
}

const normalizedPhone = normalizePhone(PHONE_INPUT);
const phoneHash = hashData(normalizedPhone);

console.log(`Analyzing Phone: ${PHONE_INPUT}`);
console.log(`Normalized: ${normalizedPhone}`);
console.log(`Hash: ${phoneHash}`);

// 1. Check ssi_users (Registered Users)
console.log('\n--- Checking Registered Users (ssi_users) ---');
const user = db.prepare('SELECT * FROM ssi_users WHERE phone_hash = ?').get(phoneHash);
let userTenantId = null;

if (user) {
    console.log('✅ Found registered user:');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Tenant ID: ${user.tenant_id}`);
    console.log(`   Created At: ${user.created_at}`);
    userTenantId = user.tenant_id;
} else {
    console.log('❌ No registered user found with this phone number.');
}

// 2. Check temp_phone_links (Fastlane/Checkout Links)
console.log('\n--- Checking Temporary Links (temp_phone_links) ---');
const links = db.prepare('SELECT * FROM temp_phone_links').all();
let foundTempLink = false;
let tempTenantId = null;

for (const link of links) {
    const decrypted = decryptPII(link.encrypted_phone);
    if (decrypted && normalizePhone(decrypted) === normalizedPhone) {
        console.log('✅ Found temporary link:');
        console.log(`   Tenant ID: ${link.tenant_id}`);
        console.log(`   Expires At: ${link.expires_at}`);
        console.log(`   Created At: ${link.created_at}`);
        tempTenantId = link.tenant_id;
        foundTempLink = true;
    }
}

if (!foundTempLink) {
    console.log('❌ No temporary link found for this phone number.');
}

// 3. Check Issued Credentials for found tenants
const tenantIds = [userTenantId, tempTenantId].filter(Boolean);

if (tenantIds.length > 0) {
    console.log('\n--- Checking Issued Credentials ---');
    // Note: This checks the Issuer's record of what was issued to a connection/tenant
    // We might need to check 'w3c_credentials' if they are stored in the shared DB, 
    // but usually they are in the tenant's wallet. 
    // For now, let's check 'issued_credentials' if it exists in persistence.db (from migrations).
    
    // Let's verify table existence first
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    
    if (tables.includes('issued_credentials')) {
         // Query issued_credentials.
         // Note: ssi_users.tenant_id usually maps to the connection or the wallet. 
         // In this codebase, the issuer issues TO a tenant.
         // Let's look for credentials where the connection or metadata might link to the tenant.
         // However, Credo's standard table structure for issued credentials might link via connection_id.
         // But since we are looking for "Credentials in the tenant's wallet", that's in the Tenant's Askar DB, which is huge/encrypted.
         
         // BUT, we might have `w3c_credentials` or similar in the main DB if using a shared store, OR
         // we can check if the Issuer has a record of issuing to this tenant.
         
         // Just listing counts for now based on common columns.
         console.log(' (Inspecting issued_credentials table for context...)');
         // We'll dump a few rows to understand the schema/linkage if we can't match directly.
         
         // Assuming 'connection_id' or 'metadata' helps. 
         // Actually, let's just dump ALL credentials and see if any match the tenantIds in their metadata (often stored in JSON).
         
         const creds = db.prepare('SELECT * FROM issued_credentials').all();
         let matches = 0;
         for (const cred of creds) {
             // Heuristic check: does the stringified record contain the tenantId?
             const str = JSON.stringify(cred);
             for(const tid of tenantIds) {
                 if (str.includes(tid)) {
                     console.log(`✅ Found Credential for Tenant ${tid}:`);
                     console.log(`   Type: ${cred.credential_definition_id || 'Unknown'}`); // Adjust column name if needed
                     console.log(`   State: ${cred.state}`);
                     matches++;
                 }
             }
         }
         
         if (matches === 0) {
             console.log(`❌ No credentials explicitly linked to tenant IDs found in issued_credentials (checked ${creds.length} records).`);
             console.log("   (Note: Credentials inside the Tenant's Wallet are encrypted and not visible here.)");
         }
    } else {
        console.log('⚠️ table issued_credentials not found in persistence.db');
    }

    if (tables.includes('w3c_credentials')) {
         console.log('\n--- Checking W3C Credentials (if shared) ---');
          const w3c = db.prepare('SELECT * FROM w3c_credentials').all();
           // Similar heuristic
           for (const cred of w3c) {
             const str = JSON.stringify(cred);
             for(const tid of tenantIds) {
                 if (str.includes(tid)) {
                     console.log(`✅ Found W3C Credential for Tenant ${tid} in shared store`);
                 }
             }
         }
    }
} else {
    console.log('\n❌ No Tenant IDs found for this phone number.');
}

