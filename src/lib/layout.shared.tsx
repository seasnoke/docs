import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="seasnoke-logo" aria-label={appName}>
          SeaSnoke
        </span>
      ),
    },
    themeSwitch: {
      enabled: false,
    },
  };
}
