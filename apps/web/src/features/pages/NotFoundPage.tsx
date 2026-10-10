import { Library, SearchX } from 'lucide-react';
import { HOME_PATH } from '../../app/navigation';
import { ButtonLink, EmptyState } from '../../components/ui';
import { usePageTitle } from '../../lib/hooks';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <EmptyState
      icon={<SearchX aria-hidden="true" />}
      title="This page isn't on any shelf"
      action={
        <ButtonLink to={HOME_PATH} variant="primary" icon={<Library aria-hidden="true" />}>
          Back to My Library
        </ButtonLink>
      }
    >
      <p>The address may be mistyped, or the page may have moved.</p>
    </EmptyState>
  );
}
