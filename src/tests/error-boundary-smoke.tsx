import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../components/common/ErrorBoundary.js';

function Boom(): React.JSX.Element {
  throw new Error('boom');
}

function run() {
  const el = document.createElement('div');
  const root = createRoot(el);
  root.render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>
  );
  console.log('T27_ERROR_BOUNDARY_SMOKE_PASS');
}

run();
