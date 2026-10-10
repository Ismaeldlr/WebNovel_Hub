import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, EmptyState } from '../../components/ui';
import { PageHeader } from './PageHeader';

export interface ComingSoonProps {
  title: string;
  /** What the page will do, in one sentence. */
  lead: string;
  icon: LucideIcon;
  action?: ReactNode;
}

/** A page from the navigation that is still being built. */
export function ComingSoonPage({ title, lead, icon: Icon, action }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <EmptyState
        icon={<Icon aria-hidden="true" />}
        title="This room is still being shelved"
        action={action}
      >
        <p>
          <Badge tone="accent">Coming soon</Badge>
        </p>
        <p>This part of Webnovel Hub is still being built. Check back after the next update.</p>
      </EmptyState>
    </>
  );
}
