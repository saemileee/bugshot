// IMPORTANT: Import chrome mock FIRST before any other imports
import './chrome-mock';

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/content/widget/styles/widget.css';

// Import the actual WidgetRoot component
import { WidgetRoot } from '../src/content/widget/WidgetRoot';

function PreviewApp() {
  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center p-8">
      <div className="text-sm text-gray-500 fixed top-4 left-4">
        Preview Mode - WidgetRoot.tsx
      </div>

      {/* Render the actual WidgetRoot */}
      <WidgetRoot />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>
);
