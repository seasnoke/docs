'use client';
import Link from 'fumadocs-core/link';
import { usePathname } from 'fumadocs-core/framework';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import type * as PageTree from 'fumadocs-core/page-tree';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

function flatten(root: PageTree.Root | PageTree.Folder): PageTree.Item[] {
  const list: PageTree.Item[] = [];
  const visit = (node: PageTree.Node) => {
    if (node.type === 'folder') {
      if (node.index) visit(node.index);
      node.children.forEach(visit);
    } else if (node.type === 'page' && !node.external) {
      list.push(node);
    }
  };
  root.children.forEach(visit);
  return list;
}

const normalize = (url: string) => (url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url);

export function PageNav() {
  const { root } = useTreeContext();
  const pathname = normalize(usePathname());

  const { previous, next } = useMemo(() => {
    const items = flatten(root);
    const idx = items.findIndex((item) => normalize(item.url) === pathname);
    if (idx === -1) return {};
    return { previous: items[idx - 1], next: items[idx + 1] };
  }, [root, pathname]);

  if (!previous && !next) return null;

  return (
    <nav className="ss-page-nav" aria-label="Pagination">
      {previous && <PageNavCard item={previous} dir="previous" />}
      {next && <PageNavCard item={next} dir="next" />}
    </nav>
  );
}

function PageNavCard({ item, dir }: { item: PageTree.Item; dir: 'previous' | 'next' }) {
  return (
    <Link href={item.url} className="ss-page-nav-card" data-dir={dir}>
      <span className="ss-page-nav-label">
        {dir === 'previous' && <ArrowLeft className="size-3" aria-hidden />}
        {dir === 'previous' ? 'Previous' : 'Next'}
        {dir === 'next' && <ArrowRight className="size-3" aria-hidden />}
      </span>
      <span className="ss-page-nav-title">{item.name}</span>
      {item.description && <span className="ss-page-nav-desc">{item.description}</span>}
    </Link>
  );
}
