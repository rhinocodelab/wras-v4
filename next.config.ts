import type {NextConfig} from 'next';
import { join } from 'path';
require('dotenv').config({ path: './.env.local' });

// Set Google credentials path
process.env.GOOGLE_APPLICATION_CREDENTIALS = join(process.cwd(), 'config', 'isl.json');

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Handle handlebars and other Node.js modules that don't work in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
    };

    // Ignore handlebars and other problematic modules in client-side builds
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: false,
        'dotprompt': false,
      };
    }

    // Handle require.extensions issue
    config.module.rules.push({
      test: /\.js$/,
      include: /node_modules\/handlebars/,
      use: {
        loader: 'null-loader',
      },
    });

    return config;
  },
  serverExternalPackages: ['@genkit-ai/firebase', '@genkit-ai/googleai', 'genkit'],
};

export default nextConfig;
