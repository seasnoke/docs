import { SiteFooter } from '@/components/site-footer';
import { baseOptions } from '@/lib/layout.shared';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DefaultNotFound } from 'fumadocs-ui/layouts/home/not-found';

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <DefaultNotFound />
      <SiteFooter />
    </HomeLayout>
  );
}
