import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/widget/frame",
        headers: [
          // ❌ Do not set X-Frame-Options (invalid ALLOWALL)
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors * https://aoun.cx", // allow embedding everywhere
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
