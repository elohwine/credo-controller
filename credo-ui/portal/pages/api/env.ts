import type { NextApiRequest, NextApiResponse } from "next";

type ResponseData = {};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  res.status(200).json({
    NEXT_PUBLIC_VC_REPO: process.env.NEXT_PUBLIC_VC_REPO ?? "http://localhost:3000",
    NEXT_PUBLIC_ISSUER: process.env.NEXT_PUBLIC_ISSUER_API_BASE ?? "http://localhost:3000/oidc/issuer",
    NEXT_PUBLIC_VERIFIER: process.env.NEXT_PUBLIC_VERIFIER_API_BASE ?? "http://localhost:3000/oidc/verifier",
    NEXT_PUBLIC_WALLET: process.env.NEXT_PUBLIC_WALLET ?? "http://localhost:4000",
  });
}
