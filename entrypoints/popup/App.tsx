import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div className="popup-container">
      <header>
        <h1>Add to Sploot</h1>
      </header>
      <main>
        {isAuthenticated ? (
          <div>
            <p>Ready to save memes!</p>
            <button>View Library</button>
          </div>
        ) : (
          <div>
            <p>Please login to continue</p>
            <button>Login</button>
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
