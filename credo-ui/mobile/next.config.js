/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // Required for Capacitor — produces out/
  trailingSlash: true, // Required for static export routing
  images: { unoptimized: true }, // No Next.js image server in static mode
  reactStrictMode: false,
  // Shared org configuration lives in credo-ui/shared and src/config (one mapping for API and both apps).
  experimental: { externalDir: true },
  eslint: { ignoreDuringBuilds: true },
}

module.exports = nextConfig
