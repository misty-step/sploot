import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignOutButton,
  useAuth,
  useSession,
  useUser,
} from '@clerk/chrome-extension'
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import { EXTENSION_CONFIG_ERROR, CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from '../../shared/env'
import { getSplootAppUrl, getSplootSignInUrl } from '../../shared/app-url'
import './style.css'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY

function App() {
  if (EXTENSION_CONFIG_ERROR) {
    return <ConfigErrorPanel message={EXTENSION_CONFIG_ERROR} />
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      syncHost={CLERK_SYNC_HOST}
      __experimental_syncHostListener
    >
      <AuthStatusReporter />
      <div className="popup-frame">
        <div className="popup-container">
          <header>
            <h1>
              <img
                src={chrome.runtime.getURL('icon-128.png')}
                alt="Sploot"
                className="logo-icon"
              />
              Sploot
            </h1>
          </header>
          <main>
            <SignedOut>
              <SignedOutPanel />
            </SignedOut>
            <SignedIn>
              <SignedInPanel />
            </SignedIn>
          </main>
        </div>
      </div>
    </ClerkProvider>
  )
}

function SignedOutPanel() {
  const handleSignIn = () => {
    chrome.tabs.create({ url: getSplootSignInUrl() })
  }

  return (
    <div className="auth-panel">
      <div className="auth-header">
        <h2>Sign in on Sploot</h2>
        <p>Use the full Sploot sign-in page, then return here to save images from the web.</p>
      </div>
      <div className="actions">
        <button onClick={handleSignIn}>Sign In</button>
      </div>
    </div>
  )
}

function ConfigErrorPanel({ message }: { message: string }) {
  return (
    <div className="popup-frame">
      <div className="popup-container">
        <header>
          <h1>
            <img
              src={chrome.runtime.getURL('icon-128.png')}
              alt="Sploot"
              className="logo-icon"
            />
            Sploot
          </h1>
        </header>
        <main>
          <div className="auth-panel">
            <div className="auth-header">
              <h2>Extension setup required</h2>
              <p>{message}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function SignedInPanel() {
  const { user } = useUser()
  const { session } = useSession()
  const [hasUsedExtension, setHasUsedExtension] = useState(
    localStorage.getItem('sploot-has-used') === 'true'
  )

  const handleViewLibrary = () => {
    // Mark as used when opening library
    localStorage.setItem('sploot-has-used', 'true')
    setHasUsedExtension(true)
    chrome.tabs.create({ url: getSplootAppUrl() })
  }

  const handleDiagnostics = () => {
    chrome.runtime.sendMessage({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS })
  }

  const isDev = import.meta.env.DEV

  // Calculate session expiry time remaining (in seconds)
  const expiresIn = session?.expireAt ? (session.expireAt.getTime() - Date.now()) / 1000 : null
  const hoursLeft = expiresIn ? Math.floor(expiresIn / 3600) : null
  const showExpiryWarning = hoursLeft !== null && hoursLeft < 24

  return (
    <div className="signed-in-panel">
      {!hasUsedExtension && (
        <div className="onboarding-tip">
          <h3>You're all set!</h3>
          <p>Right-click any image and select "Save to Sploot"</p>
        </div>
      )}
      <p>
        Signed in as{' '}
        <strong>
          {user?.primaryEmailAddress?.emailAddress || user?.username || 'Sploot user'}
        </strong>
      </p>
      {showExpiryWarning && (
        <p className="meta warning">
          ⚠ Session expires in {hoursLeft} hour{hoursLeft === 1 ? '' : 's'}
        </p>
      )}
      <div className="actions">
        <button onClick={handleViewLibrary}>View My Library</button>
        {isDev && (
          <button className="debug" onClick={handleDiagnostics}>
            Debug Auth
          </button>
        )}
        <SignOutButton>
          <button className="secondary">Sign Out</button>
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
      expiresAt: session?.expireAt?.getTime() ?? null,
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
