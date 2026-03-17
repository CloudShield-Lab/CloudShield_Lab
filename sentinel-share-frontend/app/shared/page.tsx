import { Suspense } from 'react';
import SharedClient from './SharedClient';

export default function SharedFilePage() {
  return (
    <Suspense>
      <SharedClient />
    </Suspense>
  );
}
