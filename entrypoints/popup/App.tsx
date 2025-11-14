import { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  SignOutButton,
  useAuth,
  useSession,
  useUser,
} from '@clerk/chrome-extension'
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import { CLERK_PUBLISHABLE_KEY } from '../../shared/env'
import './style.css'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY
function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <AuthStatusReporter />
      <div className="popup-container">
        <header>
          <h1>Add to Sploot</h1>
        </header>
        <main>
          <SignedOut>
            <div className="auth-panel">
              <p>Sign in to start saving memes.</p>
              <SignIn routing="hash" />
            </div>
          </SignedOut>
          <SignedIn>
            <SignedInPanel />
          </SignedIn>
        </main>
      </div>
    </ClerkProvider>
  )
}

function SignedInPanel() {
  const { user } = useUser()
  const { session } = useSession()

  const handleViewLibrary = () => {
    chrome.tabs.create({ url: 'https://sploot.app/app' })
  }

  const handleDiagnostics = () => {
    chrome.runtime.sendMessage({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS })
  }

  return (
    <div className="signed-in-panel">
      <p>
        Signed in as <strong>{user?.primaryEmailAddress?.emailAddress || user?.username || 'Sploot user'}</strong>
      </p>
      {session?.expireAt && (
        <p className="meta">Session expires at {new Date(session.expireAt * 1000).toLocaleString()}</p>
      )}
      <div className="actions">
        <button onClick={handleViewLibrary}>Open Sploot</button>
        <button onClick={handleDiagnostics}>Dump Auth Diagnostics</button>
        <SignOutButton signOutCallback={() => chrome.runtime.sendMessage({
          type: AUTH_MESSAGES.STATE_UPDATE,
          payload: { status: 'signed-out' },
        })}>
          <span>Sign out</span>
        </SignOutButton>
      </div>
    </div>
  )
}

function AuthStatusReporter() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { session } = useSession()

  useEffect(() => {
    const payload: AuthState = {
      status: isSignedIn ? 'signed-in' : 'signed-out',
      userId: user?.id ?? null,
      sessionId: session?.id ?? null,
      expiresAt: session?.expireAt ?? null,
    }

    chrome.runtime
      .sendMessage({ type: AUTH_MESSAGES.STATE_UPDATE, payload })
      .catch(error => console.error('[Popup] Failed to publish auth state', error))
  }, [isSignedIn, user?.id, session?.id, session?.expireAt])

  return null
}

// Render app
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(<App />)
}
