import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { BRAND } from '@/lib/theme'
import { 
  IconReceipt, 
  IconSearch,
  IconCamera,
  IconShieldCheck,
  IconTruck
} from '@tabler/icons-react'

export default function ReceiptVerificationIndex() {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const [recentVerifications, setRecentVerifications] = useState<string[]>([])

  // Load recent verifications from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recentVerifications')
    if (stored) {
      try {
        setRecentVerifications(JSON.parse(stored).slice(0, 5))
      } catch (e) {}
    }
  }, [])

  const handleSearch = () => {
    if (searchInput.trim()) {
      // Save to recent
      const updated = [searchInput.trim(), ...recentVerifications.filter(r => r !== searchInput.trim())].slice(0, 5)
      setRecentVerifications(updated)
      localStorage.setItem('recentVerifications', JSON.stringify(updated))
      
      router.push(`/verify/receipt/${encodeURIComponent(searchInput.trim())}`)
    }
  }

  const handleRecent = (ref: string) => {
    router.push(`/verify/receipt/${encodeURIComponent(ref)}`)
  }

  return (
    <Layout>
      <div className="min-h-screen flex flex-col items-center justify-center p-4 -mt-16">
        
        {/* Hero */}
        <div className="text-center mb-8">
          <div 
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.curious} 100%)` }}
          >
            <IconTruck size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>Delivery Verification</h1>
          <p className="mt-2" style={{ color: BRAND.viking }}>Verify payment before releasing goods</p>
        </div>

        {/* Main Search */}
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction ID / Reference
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="INV-XXXXXXXX"
              className="w-full px-4 py-4 text-xl font-mono text-center border-2 rounded-xl transition-all"
              style={{ borderColor: BRAND.linkWater }}
              onFocus={(e) => e.target.style.borderColor = BRAND.curious}
              onBlur={(e) => e.target.style.borderColor = BRAND.linkWater}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={!searchInput.trim()}
              className="w-full mt-4 py-4 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              style={{ backgroundColor: BRAND.curious }}
            >
              <IconSearch size={24} />
              VERIFY PAYMENT
            </button>
          </div>

          {/* QR Scan Option - Coming Soon */}
          {/* 
          <button
            onClick={() => router.push('/verify/scan')}
            className="w-full py-4 bg-white border-2 border-gray-200 text-gray-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-all mb-6"
          >
            <IconCamera size={24} />
            Scan QR Code Instead
          </button>
           */}

          {/* Recent Verifications */}
          {recentVerifications.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-500 mb-3">Recent</p>
              <div className="space-y-2">
                {recentVerifications.map((ref, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRecent(ref)}
                    className="w-full text-left px-4 py-3 bg-white rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all font-mono text-sm"
                  >
                    {ref}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trust Badge */}
        <div className="mt-10 flex items-center gap-2 text-sm" style={{ color: BRAND.viking }}>
          <IconShieldCheck size={18} style={{ color: BRAND.curious }} />
          <span>Secured by <span className="font-semibold" style={{ color: BRAND.curious }}>Credentis</span></span>
        </div>
      </div>
    </Layout>
  )
}
