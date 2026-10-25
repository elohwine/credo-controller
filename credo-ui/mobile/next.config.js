/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '')

const nextConfig = {
  // Only the hosted web copy (scripts/fly-deploy.sh) sets a base path; the APK and dev use none.
  ...(basePath ? { basePath } : {}),
  output: 'export', // Required for Capacitor — produces out/
  trailingSlash: true, // Required for static export routing
  images: { unoptimized: true }, // No Next.js image server in static mode
  reactStrictMode: false,
  // Shared org configuration lives in credo-ui/shared and src/config (one mapping for API and both apps).
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias.react = require('path').dirname(require.resolve('react/package.json'))
    return config
  },
}

module.exports = nextConfig
