import type { NextApiRequest, NextApiResponse } from "next";

type ResponseData = {};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // IMPORTANT: Different API keys for different backends!
  // - CREDO_API_KEY: For Issuer/Verifier API (port 3000)
  // - HOLDER_API_KEY: For Holder/Wallet API (port 7000)
  res.status(200).json({
    // Client-side URLs (for browser) - must use localhost or public URLs
    NEXT_PUBLIC_VC_REPO: process.env.NEXT_PUBLIC_VC_REPO ?? "http://localhost:3000",
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_HOLDER_URL: process.env.NEXT_PUBLIC_HOLDER_URL ?? "http://localhost:7000",
    NEXT_PUBLIC_WALLET_URL: process.env.NEXT_PUBLIC_WALLET_URL ?? "http://localhost:4000",
    NEXT_PUBLIC_ISSUER: process.env.NEXT_PUBLIC_ISSUER ?? "http://localhost:3000/oidc/issuer",
    NEXT_PUBLIC_VERIFIER: process.env.NEXT_PUBLIC_VERIFIER ?? "http://localhost:3000/oidc/verifier",
    NEXT_PUBLIC_WALLET: process.env.NEXT_PUBLIC_WALLET ?? "http://localhost:4000",
    // API Keys - each backend has its own key!
    NEXT_PUBLIC_CREDO_API_KEY: process.env.NEXT_PUBLIC_CREDO_API_KEY ?? "test-api-key-12345",
    NEXT_PUBLIC_HOLDER_API_KEY: process.env.NEXT_PUBLIC_HOLDER_API_KEY ?? "holder-api-key-12345",
    
    // Server-side URLs (for SSR/API routes) - can use Docker IPs
    BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:3000",
  });
}
