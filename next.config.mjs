/** @type {import('next').NextConfig} */
const nextConfig = {
  // transformers.js is an ESM browser library — transpile it for the client bundle
  transpilePackages: ['@huggingface/transformers'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
