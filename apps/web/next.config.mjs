/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo-necromancer/core'],
  webpack: (config) => {
    // packages/core uses NodeNext-style ".js" import specifiers for .ts sources
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};
export default nextConfig;
