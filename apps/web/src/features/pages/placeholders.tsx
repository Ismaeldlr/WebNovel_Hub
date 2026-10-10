import { BookOpen } from 'lucide-react';
import { ComingSoonPage } from './ComingSoonPage';

// Every page in the navigation, until its phase replaces it with the real one.

export function ReaderEntryPage() {
  return (
    <ComingSoonPage
      title="Continue Reading"
      lead="Pick up the chapter you left off, in a quiet reader with nothing else on the page."
      icon={BookOpen}
    />
  );
}
