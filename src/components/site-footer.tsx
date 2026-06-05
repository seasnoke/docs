import { appName, gitConfig } from '@/lib/shared';

const links = [
  { label: 'product', href: 'https://seasnoke.com' },
  { label: 'app', href: 'https://app.seasnoke.com' },
  {
    label: 'github',
    href: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  },
  { label: 'contact', href: 'mailto:hello@seasnoke.com' },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" aria-label="site footer">
      <div className="site-footer-inner">
        <a href="https://seasnoke.com" className="site-footer-logo">
          {appName}
        </a>
        <nav className="site-footer-nav" aria-label="footer">
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
        <p className="site-footer-copy">© {year} {appName}. all rights reserved.</p>
      </div>
    </footer>
  );
}
