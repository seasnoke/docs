import { LogoMark } from '@/components/logo';
import { appName, gitConfig } from '@/lib/shared';

const links = [
  { label: 'Product', href: 'https://seasnoke.com' },
  { label: 'App', href: 'https://app.seasnoke.com' },
  {
    label: 'GitHub',
    href: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  },
  { label: 'Contact', href: 'mailto:hello@seasnoke.com' },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-inner">
        <div className="site-footer-row">
          <a href="https://seasnoke.com" className="site-footer-logo">
            <LogoMark />
            {appName}
          </a>
          <nav className="site-footer-nav" aria-label="Footer">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="site-footer-link"
                target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer noopener'}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="site-footer-copy">
          © {year} {appName}
        </p>
      </div>
    </footer>
  );
}
