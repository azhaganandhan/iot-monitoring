import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "auroorchard.auroville.org",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
};

export default nextConfig;
