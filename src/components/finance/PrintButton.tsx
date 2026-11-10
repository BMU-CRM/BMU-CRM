'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Opens the browser's print window, which can also save the page as a PDF.
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" />
      Print or save as PDF
    </Button>
  );
}
