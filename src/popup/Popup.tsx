import { createRoot } from 'react-dom/client';
import { ConnectionStatus } from './components/ConnectionStatus';
import { LoginButton } from './components/LoginButton';
import { EpicSettings } from './components/EpicSettings';
import { RecentSubmissions } from './components/RecentSubmissions';
import './popup.css';

function App() {
  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Design QA Helper</h1>
      </header>

      <ConnectionStatus />
      <LoginButton />
      <EpicSettings />
      <RecentSubmissions />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
