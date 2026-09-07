import axios from 'axios'
import { gunzipSync, gzipSync } from 'zlib'

const BASE_URL = 'http://localhost:3000/api/revocation'

async function main() {
  console.log('🔍 Starting Revocation API Verification...')

  // 1. Create a List
  console.log('1. Creating Status List (Size: 1000)...')
  const createResp = await axios.post(`${BASE_URL}/list`, {
    size: 1000,
    tenantId: 'default',
  })

  const { encodedList, size } = createResp.data
  console.log(`   ✅ Created list. Size: ${size}`)

  // Verify it's all zeros
  const initialBits = decode(encodedList)
  if (initialBits.includes('1')) {
    throw new Error('❌ Initial list contains revoked bits!')
  }
  console.log('   ✅ Initial list is clean (all zeros).')

  // 2. Revoke Index 42
  console.log('2. Revoking Index 42...')
  const updateResp = await axios.post(`${BASE_URL}/update`, {
    listData: encodedList,
    index: 42,
    revoked: true,
    tenantId: 'default',
  })

  const updatedEncoded = updateResp.data.encodedList
  const updatedBits = decode(updatedEncoded)

  if (updatedBits[42] !== '1') {
    throw new Error('❌ Index 42 was NOT revoked!')
  }
  console.log('   ✅ Index 42 is now revoked (1).')

  // Verify index 43 is still 0
  if (updatedBits[43] !== '0') {
    throw new Error('❌ Index 43 was incorrectly affected!')
  }
  console.log('   ✅ Index 43 is still valid (0).')

  // 3. Un-revoke Index 42
  console.log('3. Un-revoking Index 42...')
  const restoreResp = await axios.post(`${BASE_URL}/update`, {
    listData: updatedEncoded,
    index: 42,
    revoked: false,
    tenantId: 'default',
  })

  const finalBits = decode(restoreResp.data.encodedList)
  if (finalBits[42] !== '0') {
    throw new Error('❌ Index 42 was NOT restored!')
  }
  console.log('   ✅ Index 42 restored to valid (0).')

  console.log('🎉 Revocation Flow Verified Successfully!')
}

function decode(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64')
  return gunzipSync(buf).toString()
}

main().catch((err) => {
  console.error('❌ Verification Failed:', err.message)
  if (err.response) {
    console.error('   API Error:', err.response.data)
  }
  process.exit(1)
})
