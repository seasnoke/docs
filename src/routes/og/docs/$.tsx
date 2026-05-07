import { createFileRoute, notFound } from '@tanstack/react-router';
import { ImageResponse } from '@takumi-rs/image-response';
import { generate as DefaultImage } from 'fumadocs-ui/og/takumi';
import { source } from '@/lib/source';

export const Route = createFileRoute('/og/docs/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = (params._splat ?? '').split('/').filter(Boolean);
        slugs.pop();

        const page = source.getPage(slugs);
        if (!page) throw notFound();

        return new ImageResponse(
          (
            <DefaultImage
              title={page.data.title}
              description={page.data.description}
              site="SeaSnoke"
              primaryColor="rgba(59, 130, 246, 0.35)"
              primaryTextColor="rgb(147, 197, 253)"
            />
          ),
          {
            width: 1200,
            height: 630,
            format: 'webp',
          },
        );
      },
    },
  },
});
