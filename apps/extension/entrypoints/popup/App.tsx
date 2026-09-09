import { useEffect, useState, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { AUTH_MESSAGES, type AuthState, type AuthResponse } from '../../shared/auth-messages'
import { requestVisibleTabCapture } from '../../shared/capture-messages'
import { CONTEXT_MENU_SAVE_MESSAGES, type ContextMenuSaveJobSummary } from '../../shared/context-menu-save-messages'
import { getSaveStatus, onSaveStatusChanged, type SaveStatus } from '../../shared/save-status'
import { EXTENSION_CONFIG_ERROR, SPLOOT_API_BASE_URL } from '../../shared/env'
import { getSplootAppUrl } from '../../shared/app-url'
import { runBestEffort } from '../../shared/best-effort'
import { requestDismissUpdate, requestUpdateNotice, onUpdateStatusChanged, openUpdatePage, type UpdateNotice } from '../../shared/update-status'
import { performContextMenuSaveAction, requestContextMenuSaveQueue } from './queue-recovery'
import './style.css'


function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'unknown', instanceUrl: SPLOOT_API_BASE_URL })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const listener = (message: { type?: string; payload?: AuthState }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.type === AUTH_MESSAGES.STATE_CHANGED && message.payload && active) {
        setAuth(message.payload)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    void chrome.runtime.sendMessage({ type: AUTH_MESSAGES.REQUEST_STATE }).then((response: AuthResponse) => {
      if (active && response?.state) setAuth(response.state)
    }).catch(() => { if (active) setError('Cannot reach the extension worker. Close and reopen the popup.') })
    return () => { active = false; chrome.runtime.onMessage.removeListener(listener) }
  }, [])

  const requestAuth = async (type: string, instanceUrl?: string) => {
    setBusy(true)
    setError(null)
    try {
      const response: AuthResponse = await chrome.runtime.sendMessage({ type, instanceUrl })
      if (response?.state) setAuth(response.state)
      if (response?.error) setError(response.error)
    } catch { setError('Connection request failed. Check your instance and try again.') }
    finally { setBusy(false) }
  }

  if (EXTENSION_CONFIG_ERROR) return <ConfigErrorPanel message={EXTENSION_CONFIG_ERROR} />
  return (
    <PopupShell>
      <ConnectionPanel auth={auth} busy={busy} request={requestAuth} />
      {(error || auth.error) && <p className="connection-error" role="alert">{error || auth.error}</p>}
      {auth.status === 'signed-in' && <LastSaveStrip key={auth.instanceUrl + '/' + auth.userId} />}
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


function ConnectionPanel({ auth, busy, request }: {
  auth: AuthState
  busy: boolean
  request: (type: string, instanceUrl?: string) => Promise<void>
}) {
  const [instanceUrl, setInstanceUrl] = useState(auth.instanceUrl)
  useEffect(() => { setInstanceUrl(auth.instanceUrl) }, [auth.instanceUrl])
  const changed = instanceUrl.trim().replace(/\/$/, '') !== auth.instanceUrl

  if (auth.status === 'unknown') return <p role="status">Checking device connection…</p>
  if (auth.status === 'signed-in') return (
    <div className="signed-in-panel">
      <p>Connected as <strong>{auth.email}</strong></p>
      <p className="meta">{auth.instanceUrl}</p>
      <p>Right-click an image or direct video and choose “Save to Sploot”.</p>
      <div className="actions">
        <button onClick={() => runBestEffort('tabs.create library', () => chrome.tabs.create({ url: getSplootAppUrl('/app', auth.instanceUrl) }))}>View My Library</button>
        <button className="secondary" onClick={() => void requestVisibleTabCapture()}>Screenshot this tab</button>
        <button className="secondary" disabled={busy} onClick={() => void request(AUTH_MESSAGES.DISCONNECT)}>Disconnect</button>
      </div>
      <p className="meta">Disconnect revokes this device. Retained captures stay private to this account and instance.</p>
    </div>
  )

  return (
    <div className="auth-panel">
      <div className="auth-header">
        <h2>Connect to Sploot</h2>
        <p>Approve this device in your instance. Your password stays in the browser sign-in page.</p>
      </div>
      <form className="instance-form" onSubmit={event => { event.preventDefault(); void request(AUTH_MESSAGES.SET_INSTANCE, instanceUrl) }}>
        <label htmlFor="instance-url">Instance URL</label>
        <input id="instance-url" type="url" value={instanceUrl} spellCheck={false} autoComplete="url"
          disabled={busy || Boolean(auth.pending)} onChange={event => setInstanceUrl(event.target.value)} />
        {changed && <button className="secondary" disabled={busy} type="submit">Use instance</button>}
      </form>
      {auth.pending ? (
        <div className="pairing-panel">
          <p>Confirm this code on Sploot:</p>
          <output className="pairing-code" aria-label="Connection code">{auth.pending.userCode}</output>
          <p className="meta" role="status">Waiting for approval. Expires at {new Date(auth.pending.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can close this popup.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => void request(AUTH_MESSAGES.OPEN_VERIFICATION)}>Open approval page</button>
            <button className="secondary" disabled={busy} onClick={() => void request(AUTH_MESSAGES.CANCEL)}>Cancel connection</button>
          </div>
        </div>
      ) : (
        <button disabled={busy || changed} onClick={() => void request(AUTH_MESSAGES.CONNECT)}>{busy ? 'Connecting…' : 'Connect device'}</button>
      )}
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


// Render app
const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(<App />)
}
