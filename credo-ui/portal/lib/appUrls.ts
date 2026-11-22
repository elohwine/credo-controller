// Defaults for the backend addresses when the page has no runtime env (see /api/env).
export const appUrls = {
  NEXT_PUBLIC_VC_REPO: process.env.NEXT_PUBLIC_VC_REPO ?? 'http://localhost:3000',
  NEXT_PUBLIC_ISSUER: process.env.NEXT_PUBLIC_ISSUER_API_BASE ?? 'http://localhost:3000/oidc/issuer',
  NEXT_PUBLIC_VERIFIER: process.env.NEXT_PUBLIC_VERIFIER_API_BASE ?? 'http://localhost:3000/oidc/verifier',
  NEXT_PUBLIC_WALLET: process.env.NEXT_PUBLIC_WALLET ?? 'http://localhost:4001',
}
