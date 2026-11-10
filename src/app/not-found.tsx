import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="This page does not exist, or you do not have access to it."
      action={<ButtonLink href="/overview">Go to overview</ButtonLink>}
    />
  );
}
