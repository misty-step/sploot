import { useEffect, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignOutButton,
  useAuth,
  useClerk,
  useSession,
  useUser,
} from '@clerk/chrome-extension'
import type { SplootEnrollmentPublicState } from '@sploot/common'
import { installPopupAuthSync } from '../../shared/auth-sync'
import { AUTH_MESSAGES, type AuthState } from '../../shared/auth-messages'
import { IS_DEV_BUILD } from '../../shared/build-mode'
import { requestVisibleTabCapture } from '../../shared/capture-messages'
import { CONTEXT_MENU_SAVE_MESSAGES, type ContextMenuSaveJobSummary } from '../../shared/context-menu-save-messages'
import { getSaveStatus, onSaveStatusChanged, type SaveStatus } from '../../shared/save-status'
import { E2E_AUTH_MODE, EXTENSION_CONFIG_ERROR, CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST } from '../../shared/env'
import { getSplootAppUrl, getSplootEnrollmentUrl, getSplootSignInUrl } from '../../shared/app-url'
import { runBestEffort } from '../../shared/best-effort'
import { requestDismissUpdate, requestUpdateNotice, onUpdateStatusChanged, openUpdatePage, type UpdateNotice } from '../../shared/update-status'
import { performContextMenuSaveAction, requestContextMenuSaveQueue } from './queue-recovery'
import { loadPublicEnrollmentState } from '../../shared/enrollment-state'
import './style.css'

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY
const E2E_AUTH_KEY = 'sploot:e2e-auth-authority'

type E2EAuthority = {
  userId: string
  accountId: string
  sessionId: string
}

function App() {
  if (EXTENSION_CONFIG_ERROR) {
    return <ConfigErrorPanel message={EXTENSION_CONFIG_ERROR} />
  }

  if (E2E_AUTH_MODE) {
    return <PopupContent><E2EAuthPanel /></PopupContent>
  }

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      syncHost={CLERK_SYNC_HOST}
      telemetry={{ disabled: true }}
      __experimental_syncHostListener
    >
      <AuthStatusReporter />
      <AuthStateSync />
      <PopupContent>
        <SignedOut>
          <SignedOutPanel />
        </SignedOut>
        <SignedIn>
          <SignedInPanel />
        </SignedIn>
      </PopupContent>
    </ClerkProvider>
  )
}

/**
 * Test-only auth state. The E2E build uses this durable authority instead of
 * Clerk, but it still renders the exact PopupContent used by production,
 * including the update notice and message-driven actions.
 */
function E2EAuthPanel() {
  const [authority, setAuthority] = useState<E2EAuthority | null>(null)

  useEffect(() => {
    const readAuthority = () => {
      void chrome.storage.local.get(E2E_AUTH_KEY).then(stored => {
        const value = stored[E2E_AUTH_KEY]
        if (!value || typeof value !== 'object') {
          setAuthority(null)
          return
        }
        const candidate = value as Partial<E2EAuthority>
        setAuthority(
          typeof candidate.userId === 'string' && typeof candidate.sessionId === 'string'
            ? {
                userId: candidate.userId,
                accountId: typeof candidate.accountId === 'string' ? candidate.accountId : candidate.userId,
                sessionId: candidate.sessionId,
              }
            : null,
        )
      })
    }
    readAuthority()
    chrome.storage.onChanged.addListener(readAuthority)
    return () => chrome.storage.onChanged.removeListener(readAuthority)
  }, [])

  return authority ? (
    <div className="signed-in-panel">
      <p>Signed in as <strong>{authority.userId}</strong></p>
      <div className="actions">
        <button onClick={() => void requestVisibleTabCapture()}>Screenshot this tab</button>
      </div>
    </div>
  ) : <SignedOutPanel />
}

function PopupContent({ children }: { children: ReactNode }) {
  return (
    <PopupShell>
      {children}
      <LastSaveStrip />
    </PopupShell>
  )
}

function PopupShell({ children }: { children: ReactNode }) {
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
          <UpdateNoticePanel />
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * The truthful signed-out states, kept distinct: before the readback resolves
 * the popup only claims it is checking; a failed or database-unavailable
 * readback is reported as unknown, never mislabeled as an ordinary policy
 * pause. Every state keeps existing-user sign-in available and none promises
 * immediate account creation.
 */
type SignedOutEnrollment = SplootEnrollmentPublicState | { status: 'checking' } | { status: 'unreachable' }

const SIGNED_OUT_COPY: Record<'checking' | 'unreachable' | 'unknown' | 'paused' | 'open', { heading: string; body: string }> = {
  checking: {
    heading: 'sign in on sploot',
    body: 'Checking new-account availability… Existing users can sign in now, then return here to save images from the web.',
  },
  unreachable: {
    heading: 'enrollment status unavailable',
    body: 'Sploot could not confirm new-account availability. Existing users can still sign in, then return here to save images from the web.',
  },
  unknown: {
    heading: 'enrollment status unavailable',
    body: 'Sploot cannot confirm new-account availability right now, so sign-up stays closed until it can. Existing users can still sign in, then return here to save images from the web.',
  },
  paused: {
    heading: 'new enrollment is paused',
    body: 'New accounts are not being accepted right now. Existing users can still sign in, then return here to save images from the web.',
  },
  open: {
    heading: 'sign in on sploot',
    body: 'Use the full Sploot sign-in page, then return here to save images from the web.',
  },
}

function UpdateNoticePanel() {
  const [notice, setNotice] = useState<UpdateNotice | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void requestUpdateNotice().then(next => {
        if (!cancelled) setNotice(next && !next.dismissed ? next : null)
      })
    }
    refresh()
    const unsubscribe = onUpdateStatusChanged(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (!notice) return null

  const handleDismiss = () => {
    void requestDismissUpdate(notice.version).then(() => setNotice(null))
  }

  const handleUpdate = () => {
    void openUpdatePage()
  }

  return (
    <section className="update-notice" role="status" aria-live="polite">
      <div className="update-notice-copy">
        <strong>Update available</strong>
        <span>Sploot {notice.version} is ready.</span>
      </div>
      <div className="update-notice-actions">
        <button onClick={handleUpdate}>Update</button>
        <button className="secondary" onClick={handleDismiss} aria-label={'Dismiss Sploot update ' + notice.version}>Dismiss</button>
      </div>
    </section>
  )
}


function SignedOutPanel() {
  const [enrollmentState, setEnrollmentState] = useState<SignedOutEnrollment>({ status: 'checking' })

  useEffect(() => {
    loadPublicEnrollmentState(getSplootEnrollmentUrl())
      .then(state => {
        setEnrollmentState(state ?? { status: 'unreachable' })
      })
      .catch(() => {
        setEnrollmentState({ status: 'unreachable' })
      })
  }, [])

  const handleSignIn = () => {
    runBestEffort('tabs.create sign-in', () => chrome.tabs.create({ url: getSplootSignInUrl() }))
  }

  const copy = SIGNED_OUT_COPY[enrollmentState.status]

  return (
    <div className="auth-panel">
      <div className="auth-header">
        <h2>{copy.heading}</h2>
        <p>{copy.body}</p>
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
    runBestEffort('tabs.create library', () => chrome.tabs.create({ url: getSplootAppUrl() }))
  }

  const handleScreenshot = () => {
    // The capture + upload runs in the background worker (the popup closes the
    // moment it loses focus). Outcome is confirmed via badge + notification.
    void requestVisibleTabCapture().catch(error => {
      console.error('[Popup] Screenshot dispatch failed', error)
    })
  }

  const handleDiagnostics = () => {
    runBestEffort('runtime.sendMessage diagnostics', () => chrome.runtime.sendMessage({ type: AUTH_MESSAGES.RUN_DIAGNOSTICS }))
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
  const [queueJobs, setQueueJobs] = useState<ContextMenuSaveJobSummary[]>([])
  const [queueError, setQueueError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<{ jobId: string; type: typeof CONTEXT_MENU_SAVE_MESSAGES.RETRY | typeof CONTEXT_MENU_SAVE_MESSAGES.DISCARD } | null>(null)

  const refreshQueue = async () => {
    const result = await requestContextMenuSaveQueue()
    if (result.ok) {
      setQueueJobs(result.jobs)
      setQueueError(null)
    } else {
      setQueueError(result.error)
    }
  }

  useEffect(() => {
    let cancelled = false
    getSaveStatus().then(stored => {
      if (!cancelled && stored) {
        setStatus(current => current ?? stored)
      }
    })
    void refreshQueue()
    const unsubscribe = onSaveStatusChanged(nextStatus => {
      setStatus(nextStatus)
      void refreshQueue()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const handleQueueAction = async (
    jobId: string,
    type: typeof CONTEXT_MENU_SAVE_MESSAGES.RETRY | typeof CONTEXT_MENU_SAVE_MESSAGES.DISCARD,
  ) => {
    setActiveAction({ jobId, type })
    setQueueError(null)
    const result = await performContextMenuSaveAction(jobId, type)
    if (!result.ok) {
      setActiveAction(null)
      setQueueError(result.error)
      return
    }
    await refreshQueue()
    setActiveAction(null)
  }

  return (
    <>
      {queueError && (
        <div className="save-strip error queue-error" role="alert" aria-live="assertive">
          <span className="save-dot" aria-hidden="true" />
          <span className="save-copy"><strong>Queue action failed.</strong> {queueError}</span>
        </div>
      )}
      {queueJobs.map(job => (
        <div className={`save-strip queue-failure ${job.state === 'failed' || job.state === 'paused' ? 'error' : 'queued'}`} role={job.state === 'failed' || job.state === 'paused' ? 'alert' : 'status'} aria-live="polite" key={job.id}>
          <span className="save-dot" aria-hidden="true" />
          <span className="save-copy">
            <strong>{queueStateTitle(job)}</strong> {job.filename}. {queueStateCopy(job)}
          </span>
          {(job.state === 'failed' || job.state === 'paused') && (
            <div className="queue-actions">
              <button
                disabled={activeAction !== null}
                onClick={() => void handleQueueAction(job.id, CONTEXT_MENU_SAVE_MESSAGES.RETRY)}
              >
                {activeAction?.jobId === job.id && activeAction.type === CONTEXT_MENU_SAVE_MESSAGES.RETRY ? 'Retrying…' : job.state === 'paused' ? 'Resume' : 'Retry'}
              </button>
              <button
                className="secondary"
                disabled={activeAction !== null}
                onClick={() => void handleQueueAction(job.id, CONTEXT_MENU_SAVE_MESSAGES.DISCARD)}
              >
                {activeAction?.jobId === job.id && activeAction.type === CONTEXT_MENU_SAVE_MESSAGES.DISCARD ? 'Discarding…' : 'Discard'}
              </button>
            </div>
          )}
        </div>
      ))}
      {status && <SaveStatusStrip status={status} />}
    </>
  )
}

function queueStateTitle(job: ContextMenuSaveJobSummary): string {
  if (job.state === 'failed') return 'Save needs attention.'
  if (job.state === 'paused') return 'Save paused.'
  if (job.state === 'processing') return 'Saving.'
  return job.nextAttemptAt > Date.now() ? 'Retry scheduled.' : 'Queued for retry.'
}

function queueStateCopy(job: ContextMenuSaveJobSummary): string {
  if (job.state === 'failed' || job.state === 'paused') return job.lastError ?? 'The original account is required; choose Resume or Discard.'
  if (job.state === 'processing') return 'The background worker is uploading it.'
  return job.nextAttemptAt > Date.now()
    ? `Next attempt ${new Date(job.nextAttemptAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : 'The background worker will try it now.'
}

function SaveStatusStrip({ status }: { status: SaveStatus }) {
  const at = new Date(status.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className={`save-strip ${status.state}`} role="status" aria-live="polite">
      <span className="save-dot" aria-hidden="true" />
      {status.state === 'queued' && <span className="save-copy">{status.label}</span>}
      {status.state === 'saving' && <span className="save-copy">{status.label}</span>}
      {status.state === 'retrying' && (
        <>
          <span className="save-copy">{status.label}</span>
          <span className="save-time">{new Date(status.nextAttemptAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </>
      )}
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

function AuthStateSync() {
  const { isLoaded } = useAuth()
  const clerk = useClerk()

  useEffect(() => {
    if (!isLoaded) {
      return
    }
    return installPopupAuthSync(clerk)
  }, [clerk, isLoaded])

  return null
}

// Render app
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(<App />)
}
