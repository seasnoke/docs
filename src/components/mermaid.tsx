'use client';
import * as React from 'react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

type Mode = 'light' | 'dark';

const palette = {
  light: {
    background: '#F6F7FB',
    node: '#FFFFFF',
    text: '#0B0D1A',
    muted: '#5B6078',
    line: '#8A8FA8',
    border: '#E3E5EF',
    accent: '#2433C9',
    tint: '#EEF0FF',
  },
  dark: {
    background: '#181818',
    node: '#272727',
    text: '#F5F6FA',
    muted: '#9B9FB4',
    line: '#6B6F85',
    border: '#3A3A3A',
    accent: '#7C88FF',
    tint: '#1F1F1F',
  },
} as const;

function useThemeMode(): Mode | null {
  const [mode, setMode] = React.useState<Mode | null>(null);

  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => setMode(root.classList.contains('dark') ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return mode;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | undefined;
const loadMermaid = () => (mermaidPromise ??= import('mermaid').then((m) => m.default));

let renderQueue: Promise<unknown> = Promise.resolve();

function renderChart(id: string, chart: string, mode: Mode): Promise<string> {
  const c = palette[mode];
  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
      flowchart: { curve: 'basis', padding: 16, useMaxWidth: true },
      themeVariables: {
        darkMode: mode === 'dark',
        fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
        fontSize: '14px',
        background: c.background,
        primaryColor: c.node,
        primaryTextColor: c.text,
        primaryBorderColor: c.border,
        secondaryColor: c.tint,
        secondaryTextColor: c.text,
        secondaryBorderColor: c.border,
        tertiaryColor: c.tint,
        tertiaryTextColor: c.text,
        tertiaryBorderColor: c.border,
        mainBkg: c.node,
        nodeBorder: c.border,
        nodeTextColor: c.text,
        textColor: c.text,
        lineColor: c.line,
        clusterBkg: c.tint,
        clusterBorder: c.border,
        titleColor: c.text,
        edgeLabelBackground: c.background,
        actorBkg: c.node,
        actorBorder: c.border,
        actorTextColor: c.text,
        actorLineColor: c.line,
        signalColor: c.muted,
        signalTextColor: c.text,
        labelBoxBkgColor: c.node,
        labelBoxBorderColor: c.border,
        labelTextColor: c.text,
        loopTextColor: c.muted,
        noteBkgColor: c.tint,
        noteBorderColor: c.border,
        noteTextColor: c.text,
        activationBkgColor: c.tint,
        activationBorderColor: c.accent,
        sequenceNumberColor: c.node,
        stateBkg: c.node,
        stateLabelColor: c.text,
        transitionColor: c.line,
        compositeBackground: c.tint,
        altBackground: c.tint,
      },
      themeCSS: `
        .node rect, .node polygon, .node circle, .node path { rx: 8px; ry: 8px; stroke-width: 1px; }
        .edgeLabel, .edgeLabel p, .edgeLabel span { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; color: ${c.muted}; }
        .cluster-label, .cluster-label span { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; color: ${c.muted}; }
        .flowchart-link { stroke-width: 1.25px; }
        marker path { fill: ${c.line}; stroke: ${c.line}; }
      `,
    });
    const { svg } = await mermaid.render(id, chart.replaceAll('\\n', '\n'));
    return withReadableWidth(svg);
  });
  renderQueue = task.catch(() => undefined);
  return task;
}

/**
 * Mermaid scales wide diagrams down to the container, which makes long
 * left-to-right flowcharts unreadable. Keep them at >= 75% of their natural
 * width and let the container scroll horizontally instead.
 */
function withReadableWidth(svg: string): string {
  const match = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) [\d.]+"/.exec(svg);
  if (!match) return svg;
  const minWidth = Math.round(Number(match[1]) * 0.75);
  return svg.replace(/<svg([^>]*?)style="/, `<svg$1style="min-width: ${minWidth}px; `);
}

export function Mermaid({ chart }: { chart: string }) {
  const baseId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const mode = useThemeMode();
  const [svg, setSvg] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    renderChart(`mermaid-${baseId}-${mode}`, chart, mode)
      .then((result) => {
        if (!cancelled) {
          setSvg(result);
          setFailed(false);
        }
      })
      .catch((error: unknown) => {
        console.warn('Mermaid render failed', error);
        // mermaid leaves an error node in the body on failure
        document.getElementById(`dmermaid-${baseId}-${mode}`)?.remove();
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [baseId, chart, mode]);

  if (failed || !svg) {
    return (
      <CodeBlock title="mermaid" data-mermaid-fallback={failed ? 'error' : 'loading'}>
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }

  return (
    <div
      className="ss-mermaid not-prose"
      role="img"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
