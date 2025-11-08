import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { isAuthenticated } from '../../shared/auth-client';
import './style.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on mount
    isAuthenticated()
      .then(setAuthenticated)
      .finally(() => setLoading(false));
  }, []);

  const handleViewLibrary = () => {
    chrome.tabs.create({ url: 'https://sploot.app/app' });
  };

  const handleLogin = () => {
    chrome.tabs.create({ url: 'https://sploot.app' });
  };

  if (loading) {
    return (
      <div className="popup-container">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <header>
        <h1>Add to Sploot</h1>
      </header>
      <main>
        {authenticated ? (
          <div>
            <p>Ready to save memes!</p>
            <button onClick={handleViewLibrary}>View Library</button>
          </div>
        ) : (
          <div>
            <p>Please login to sploot.app to continue</p>
            <button onClick={handleLogin}>Open Sploot</button>
          </div>
        )}
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
