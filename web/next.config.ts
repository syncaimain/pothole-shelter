import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  // Cache Components: data functions opt in with 'use cache' + cacheLife (Next 16 model).
  cacheComponents: true,
  // Shared outcome vocabulary lives in the workspace sync package as TypeScript source.
  transpilePackages: ['@pothole/sync'],
}

export default nextConfig
