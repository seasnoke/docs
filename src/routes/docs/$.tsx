import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { createServerFn } from '@tanstack/react-start';
import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import browserCollections from 'collections/browser';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { baseOptions, SidebarFooterControls } from '@/lib/layout.shared';
import { gitConfig } from '@/lib/shared';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { Suspense } from 'react';
import { useMDXComponents } from '@/components/mdx';

type PageData = {
  path: string;
  title: string;
  description: string;
  imageUrl: string;
  markdownUrl: string;
  pageTree: Awaited<ReturnType<typeof source.serializePageTree>>;
};

export const Route = createFileRoute('/docs/$')({
  component: Page,
  head: ({ loaderData }) => {
    const data = loaderData as PageData | undefined;

    return {
      meta: data
        ? [
          { title: `${data.title} | SeaSnoke Docs` },
          { name: 'description', content: data.description },
          { property: 'og:title', content: `${data.title} | SeaSnoke Docs` },
          { property: 'og:description', content: data.description },
          { property: 'og:image', content: data.imageUrl },
          { property: 'og:type', content: 'website' },
          { name: 'twitter:card', content: 'summary_large_image' },
          { name: 'twitter:title', content: `${data.title} | SeaSnoke Docs` },
          { name: 'twitter:description', content: data.description },
          { name: 'twitter:image', content: data.imageUrl },
          ]
        : [],
    };
  },
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
});

const loader = createServerFn({
  method: 'GET',
})
  .inputValidator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description ?? 'SeaSnoke documentation.',
      imageUrl: getPageImage(page).url,
      markdownUrl: getPageMarkdownUrl(page).url,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    // you can define props for the component
    {
      markdownUrl,
      path,
    }: {
      markdownUrl: string;
      path: string;
    },
  ) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/edit/${gitConfig.branch}/content/docs/${path}`}
          />
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}/edit/${gitConfig.branch}/content/docs/${path}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-fd-border px-3 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            Edit this page
          </a>
        </div>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { pageTree, path, markdownUrl } = useFumadocsLoader(Route.useLoaderData() as PageData);

  return (
    <DocsLayout
      {...baseOptions()}
      tree={pageTree}
      tabMode="top"
      tabs={[
        {
          title: 'Guides',
          description: 'Install, run, and review work in SeaSnoke.',
          url: '/docs',
          urls: new Set([
            '/docs',
            '/docs/getting-started/installation',
            '/docs/getting-started/quickstart',
            '/docs/getting-started/start-a-run',
            '/docs/cli',
            '/docs/cli/install',
            '/docs/cli/commands',
            '/docs/core-concepts',
            '/docs/core-concepts/agents',
            '/docs/core-concepts/review-graph',
            '/docs/core-concepts/workflows',
            '/docs/core-concepts/protected-workspaces',
          ]),
        },
        {
          title: 'API',
          description: 'Reference for SeaSnoke API authentication, tasks, and runs.',
          url: '/docs/api',
          urls: new Set([
            '/docs/api',
            '/docs/api/authentication',
            '/docs/api/tasks',
            '/docs/api/runs',
          ]),
        },
      ]}
      sidebar={{ footer: <SidebarFooterControls /> }}
    >
      <Link to={markdownUrl} hidden />
      <Suspense>{clientLoader.useContent(path, { markdownUrl, path })}</Suspense>
    </DocsLayout>
  );
}
