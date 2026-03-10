import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanelRoot } from './SidePanelRoot';
import './sidepanel.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SidePanelRoot />
    </StrictMode>
  );
}
