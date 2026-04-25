/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  productionBrowserSourceMaps: false,
  experimental: {
    optimizePackageImports: [
      'chart.js',
      'react-chartjs-2',
      'firebase',
      'firebase/auth',
    ],
  },
};

export default nextConfig;
