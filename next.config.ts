import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // better-sqlite3 是原生模块，必须外部化，否则 Next 会试图把它打进 bundle 并报错
  serverExternalPackages: ['better-sqlite3'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
