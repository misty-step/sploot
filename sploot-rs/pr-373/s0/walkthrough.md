# S0 walkthrough

WebKit, 390×844, device scale 3, iPhone 14 user agent. Local Access stub only.

| Story | Step | Result | Screenshot |
| --- | --- | --- | --- |
| install / sign-in | absent session prompts once | pass | s0-01-signed-out-login.png |
| sign-in | shell shows the demo owner | pass | s0-01-shell.png |
| install | inherited session opens the shell | pass | s0-01-inherited.png |
| install | public icon | pass | s0-02-icon.png |
| relaunch | second page skips login | pass | s0-03-relaunch.png |
| expiry | banner offers sign in | pass | s0-04-expired.png |
| offline | banner says offline | pass | s0-04-offline.png |
| allowlist | 403 page does not return to login | pass | s0-05-forbidden.png |
| csrf | cross-site logout leaves the session | pass | s0-06-still-signed-in.png |
| sign out | login after sign out | pass | s0-06-signed-out.png |
| sign in | signed in again | pass | s0-06-signed-in-again.png |
| health | public healthz | pass | s0-07-healthz.png |
| layout | 375px fits | pass | s0-08-375.png |
| layout | 430px fits | pass | s0-08-430.png |

## Friction

- The login list is the local stub on the app origin, so sign-out can redirect without leaving `form-action`. Port 8789 only hosts the cross-site form.
- An inherited session is a CF_Authorization cookie set before navigation. A real iPhone can copy Safari's cookie into the installed app, so the first standalone launch must not be assumed to prompt.
- Expiry uses a 15 second stub session, then one reload into the login page.
- The allowlist page signs out with the Access logout link. It does not reload into login.
- The other-origin form is on port 8789. That POST is same-site, so the cookie is sent, and the worker rejects it. Returning to the shell still shows the owner.
- Home Screen install, safe areas on a real notch, and a 15 minute Access session are Phaedrus's check.

14 recorded steps.
