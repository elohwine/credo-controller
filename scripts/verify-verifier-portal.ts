
import axios from 'axios'

const BASE_URL = 'http://localhost:3000/api'

async function main() {
    console.log('🔍 Starting Verifier Portal Verification...')

    // 1. Setup: Create a Status List
    console.log('1. Creating Status List...')
    const listResp = await axios.post(`${BASE_URL}/revocation/list`, {
        size: 1000,
        tenantId: 'default'
    })
    const encodedList = listResp.data.encodedList
    console.log('   ✅ List created.')

    // 2. Setup: Mock a VC
    const mockVc = {
        id: 'urn:uuid:' + Math.random().toString(36).substring(7),
        type: ['VerifiableCredential', 'TestCredential'],
        credentialSubject: {
            id: 'did:key:123',
            name: 'Alice',
            credentialStatus: {
                id: 'https://example.com/status/1',
                type: 'StatusList2021Entry',
                statusPurpose: 'revocation',
                statusListIndex: '42',
                statusListCredential: 'https://example.com/status/list/1'
            }
        },
        proof: { type: 'Ed25519Signature2018' } // Dummy proof to skip sig check logic
    }

    // 3. Verify valid VC
    console.log('2. Verifying valid VC (Index 42)...')
    const verify1 = await axios.post(`${BASE_URL}/verifier/verify`, {
        vc: mockVc,
        statusListEncoded: encodedList,
        policy: { checkRevocation: true, requiredClaims: { name: 'Alice' } },
        tenantId: 'default'
    })

    console.log('   Result:', verify1.data.verified ? '✅ Verified' : '❌ Failed')
    if (!verify1.data.verified) throw new Error('Verification should have passed')

    // 4. Revoke Index 42
    console.log('3. Revoking Index 42...')
    const updateResp = await axios.post(`${BASE_URL}/revocation/update`, {
        listData: encodedList,
        index: 42,
        revoked: true,
        tenantId: 'default'
    })
    const updatedEncoded = updateResp.data.encodedList

    // 5. Verify revoked VC
    console.log('4. Verifying revoked VC (Index 42)...')
    const verify2 = await axios.post(`${BASE_URL}/verifier/verify`, {
        vc: mockVc,
        statusListEncoded: updatedEncoded,
        policy: { checkRevocation: true },
        tenantId: 'default'
    })

    console.log('   Result:', verify2.data.verified ? '❌ Verified (Wait, should be revoked!)' : '✅ Correctly Rejected')
    if (verify2.data.verified) throw new Error('Verification should have failed due to revocation')
    console.log('   Reason:', verify2.data.error)

    // 6. Verify claim mismatch
    console.log('5. Verifying claim mismatch (Expecting Bob)...')
    const verify3 = await axios.post(`${BASE_URL}/verifier/verify`, {
        vc: mockVc,
        statusListEncoded: updatedEncoded,
        policy: { checkRevocation: false, requiredClaims: { name: 'Bob' } },
        tenantId: 'default'
    })
    console.log('   Result:', verify3.data.verified ? '❌ Verified' : '✅ Correctly Rejected')
    if (verify3.data.verified) throw new Error('Verification should have failed due to claim mismatch')

    // 7. Check History
    console.log('6. Checking Verification History...')
    const historyResp = await axios.get(`${BASE_URL}/verifier/history`)
    console.log(`   ✅ Found ${historyResp.data.length} verification attempts in history.`)

    if (historyResp.data.length < 3) throw new Error('History missing entries')

    console.log('🎉 Verifier Portal Verification Successful!')
}

main().catch(err => {
    console.error('❌ Verification Failed:', err.message)
    if (err.response) {
        console.error('   API Error:', err.response.data)
    }
    process.exit(1)
})
