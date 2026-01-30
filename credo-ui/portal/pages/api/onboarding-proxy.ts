import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const backendUrl = process.env.VC_REPO_INTERNAL || process.env.NEXT_PUBLIC_VC_REPO || "http://localhost:3000";

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method not allowed" });
    }

    try {
        const response = await axios.post(`${backendUrl}/api/onboarding/cases`, req.body, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return res.status(response.status).json(response.data);
    } catch (error: any) {
        console.error('[Portal Proxy Error]:', error.message);
        return res.status(error.response?.status || 500).json(error.response?.data || { message: error.message });
    }
}
