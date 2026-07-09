# Evidence Packet: sploot-032-upload-proof

- Date: 2026-07-09
- Branch: `feat/sploot-032-feedback`
- Commit: `adcd61a`

## Intent

prove drop-zone upload intake and the centered auth door at desktop and mobile widths

## Checks

### PASS — qa seed (1.9s)

```
pnpm --filter web qa:seed
```

Transcript: [transcripts/qa-seed.txt](transcripts/qa-seed.txt)

## Browser Evidence

### /app/upload @ 1440x900

![/app/upload @ 1440x900](app-upload-1440x900.png)

No page or console errors.

### /app/upload @ 390x844

![/app/upload @ 390x844](app-upload-390x844.png)

No page or console errors.

### /sign-in @ 1440x900

![/sign-in @ 1440x900](sign-in-1440x900.png)

No page errors. The centered auth console stays compact and readable.

### /sign-in @ 390x844

![/sign-in @ 390x844](sign-in-390x844.png)

No page errors or horizontal overflow.

## Verdict: PASS

## Residual Risk

- Clerk rendered with local development keys; no credential submission was attempted.
