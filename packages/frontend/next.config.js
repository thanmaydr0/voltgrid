/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["voltgrid-shared", "voltgrid-sim-core"],
};

module.exports = nextConfig;
