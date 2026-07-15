# public truth browser evidence

Local-only Playwright proof against `http://localhost:3128` with
`SPLOOT_DEPLOYMENT_ENV=development` and `SPLOOT_ENROLLMENT_MODE=closed`:

```text
6 passed (31.6s)
light/dark × phone 390x844, tablet 768x1024, desktop 1440x900
```

Each screenshot covers the signed-out home after the interaction walk. The
walk also opened `/help`, `/support`, and `/sign-up`; asserted paused copy,
keyboard focus, live search announcements, both shuffle controls, horizontal
overflow, underlined links, and AA token contrast.
