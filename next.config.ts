import type { NextConfig } from "next";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/widget/frame",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors * https://www.aoun.cx",
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

  webpack: (config: Configuration, { isServer }) => {
    if (isServer) {
      const origExternals = config.externals || [];

      config.externals = [
        function externalCanvas(
          context: { request?: string },
          callback: (err?: Error | null, result?: string) => void,
        ) {
          if (
            context.request &&
            context.request.startsWith("@napi-rs/canvas")
          ) {
            return callback(null, "commonjs " + context.request);
          }
          callback();
        },
        ...(Array.isArray(origExternals) ? origExternals : [origExternals]),
      ];
    }

    return config;
  },
};

export default nextConfig;
