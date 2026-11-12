import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const apiTarget = 'http://localhost:4000';

export default defineConfig(({ command }) => {
  // Open Graph tags need absolute URLs. On a static host (Vercel) they are
  // baked in at build time; when Express serves the build it fills the token
  // at runtime instead, so leave the placeholder untouched here.
  const appUrl = (
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (command === 'serve' ? 'http://localhost:5173' : '')
  ).replace(/\/+$/, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'resolve-app-url',
        transformIndexHtml(html) {
          return appUrl ? html.replaceAll('%APP_URL%', appUrl) : html;
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rolldownOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('recharts') || id.includes('react-is') || id.includes('d3-')) {
              return 'vendor-charts';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/')) {
              return 'vendor-forms';
            }
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@tanstack') || id.includes('zustand')) return 'vendor-state';
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('scheduler') ||
              id.includes('react-router')
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
        '/robots.txt': { target: apiTarget, changeOrigin: true },
        '/sitemap.xml': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
