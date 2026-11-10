'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function CrmError({ reset }: { reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="This page could not be loaded"
      description="Something went wrong on our side. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
