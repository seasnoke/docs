import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function getMdxSlugs(dir: string, prefix: string[] = []): Promise<string[][]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const slugs: string[][] = [];

  for (const entry of entries) {
    const name = entry.name;
    const path = join(dir, name);

    if (entry.isDirectory()) {
      slugs.push(...(await getMdxSlugs(path, [...prefix, name])));
      continue;
    }

    if (!name.endsWith('.mdx')) continue;

    const basename = name.slice(0, -'.mdx'.length);
    slugs.push(basename === 'index' ? prefix : [...prefix, basename]);
  }

  return slugs;
}

const ogPages = (await getMdxSlugs('content/docs')).map((slugs) => ({
  path: `/og/docs/${[...slugs, 'image.webp'].join('/')}`,
}));

export default defineConfig({
  server: {
    port: 3000,
  },
  ssr: {
    external: ['@takumi-rs/image-response'],
  },
  optimizeDeps: {
    include: [
      'fumadocs-core/search/client',
      'fumadocs-core/source/client',
      'fumadocs-ui/components/dialog/search',
      'fumadocs-ui/layouts/docs',
      'fumadocs-ui/layouts/docs/page',
      'fumadocs-ui/layouts/home',
      'fumadocs-ui/provider/tanstack',
      'mermaid',
      'tailwind-merge',
    ],
    exclude: ['lucide-react'],
  },
  plugins: [
    mdx(await import('./source.config')),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        {
          path: '/docs',
        },
        {
          path: '/api/search',
        },
        {
          path: 'llms-full.txt',
        },
        {
          path: 'llms.txt',
        },
        ...ogPages,
      ],
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
