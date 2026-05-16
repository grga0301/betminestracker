// next.config.ts
import type { NextConfig } from 'next';
 
const nextConfig: NextConfig = {
  // Next.js 15: serverExternalPackages replaces the old experimental key
  serverExternalPackages: ['@prisma/client', 'prisma'],
};
 
export default nextConfig;