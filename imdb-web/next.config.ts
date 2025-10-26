// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Example: calling /api/movies?q=... on Next -> forwards to FastAPI /movies?q=...
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
        // destination: "http://localhost:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
