import * as React from 'react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <CodeBlock title="Mermaid">
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }

  return (
    <React.Suspense
      fallback={
        <CodeBlock title="Mermaid">
          <Pre>{chart}</Pre>
        </CodeBlock>
      }
    >
      <MermaidContent chart={chart} />
    </React.Suspense>
  );
}

function MermaidContent({ chart }: { chart: string }) {
  const id = React.useId().replaceAll(':', '');
  const { default: mermaid } = React.use(
    cachePromise('mermaid', () => import('mermaid')),
  ) as typeof import('mermaid');

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'Lexend, sans-serif',
    theme: 'dark',
    themeCSS: 'margin: 1.5rem auto 0; max-width: 100%;',
  });

  const { svg, bindFunctions } = React.use(
    cachePromise(`dark-${id}-${chart}`, () => mermaid.render(id, chart.replaceAll('\\n', '\n'))),
  );

  return (
    <div
      className="not-prose overflow-x-auto rounded-lg border bg-fd-card p-4"
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
