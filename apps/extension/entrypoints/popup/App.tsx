import { useEffect, useState } from 'react'
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
import { authNavigation } from '../../shared/auth-navigation'
import './style.css'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY

// Clerk appearance customization to match our theme
const clerkAppearance = {
  variables: {
    colorPrimary: '#7C5CFF',
    colorTextOnPrimaryBackground: '#FFFFFF',
    colorBackground: '#FFFFFF',
    colorInputBackground: '#FAFAFA',
    colorInputText: '#0A0A0A',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    borderRadius: '8px',
  },
  elements: {
    card: 'shadow-md',
    formButtonPrimary: 'bg-accent-primary hover:bg-accent-hover',
    formFieldInput: 'border-border-primary',
    footerActionLink: 'text-accent-primary hover:text-accent-hover',
  },
}

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
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
              <div className="auth-panel">
                <div className="auth-header">
                  <h2>Welcome to Sploot</h2>
                  <p>Sign in to save images from anywhere on the web</p>
                </div>
                <SignIn
                  routing="hash"
                  redirectUrl={authNavigation.redirectUrl}
                  afterSignInUrl={authNavigation.afterSignInUrl}
                  afterSignUpUrl={authNavigation.afterSignUpUrl}
                  appearance={clerkAppearance}
                />
              </div>
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
    chrome.tabs.create({ url: 'https://sploot.app/app' })
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
