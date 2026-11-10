'use client';

import type { ComponentProps } from 'react';

// React clears a form after its action runs, even when the server rejected it, which
// would throw away everything the user typed. Forms that leave the page on success
// use this, so an error never costs them their work.
export function KeepValuesForm(props: ComponentProps<'form'>) {
  return <form {...props} onReset={(event) => event.preventDefault()} />;
}
