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
import { IS_DEV_BUILD } from '../../shared/build-mode'
import { requestVisibleTabCapture } from '../../shared/capture-messages'
import { getSaveStatus, onSaveStatusChanged, type SaveStatus } from '../../shared/save-status'
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
            <LastSaveStrip />
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

  const handleScreenshot = () => {
    // The capture + upload runs in the background worker (the popup closes the
    // moment it loses focus). Outcome is confirmed via badge + notification.
    void requestVisibleTabCapture()
  }

  const handleDiagnostics = () => {
    chrome.runtime.sendMessage({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS })
  }

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
        <button className="secondary" onClick={handleScreenshot}>
          Screenshot this tab
        </button>
        {IS_DEV_BUILD && (
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

/**
 * Persistent last-save outcome. OS notifications get suppressed and the badge
 * auto-clears; this strip always shows what happened to the most recent save,
 * updating live while a capture is in flight.
 */
function LastSaveStrip() {
  const [status, setStatus] = useState<SaveStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    getSaveStatus().then(stored => {
      if (!cancelled && stored) {
        setStatus(current => current ?? stored)
      }
    })
    const unsubscribe = onSaveStatusChanged(setStatus)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!status) return null

  const at = new Date(status.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`save-strip ${status.state}`} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      {status.state === 'saving' && <span className="save-copy">{status.label}</span>}
      {status.state === 'success' && (
        <>
          <span className="save-copy">
            <strong>{status.isDuplicate ? 'Already in Sploot' : 'Saved'}</strong> {status.filename}
          </span>
          <span className="save-time">{at}</span>
        </>
      )}
      {status.state === 'error' && (
        <>
          <span className="save-copy">
            <strong>Save failed.</strong> {status.message}
          </span>
          <span className="save-time">{at}</span>
        </>
      )}
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
