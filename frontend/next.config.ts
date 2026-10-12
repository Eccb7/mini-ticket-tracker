import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  // The browser calls /api/* on the Next origin and Next proxies to Express, so no CORS is needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
