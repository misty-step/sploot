# Save to Sploot Shortcut

Use this recipe when you want Sploot in the iPhone share sheet. iOS does not
expose Web Share Target entries for PWAs, so the supported path is an Apple
Shortcut that posts the shared image to Sploot with an upload-only token.

## Create the token

1. Open Sploot settings.
2. In **Save to Sploot Shortcut**, choose **Create upload token**.
3. Copy the token immediately. Sploot stores only a hash and will not show it
   again.

The token can only authenticate upload calls. It cannot list, read, edit, or
delete assets.

## Build the Shortcut

1. Open Shortcuts on iPhone.
2. Create a new shortcut named `Save to Sploot`.
3. Open shortcut details and enable **Show in Share Sheet**.
4. Set accepted input to images.
5. Add **Get Contents of URL**.
6. Set the URL to `https://www.sploot.app/api/upload`.
7. Set method to `POST`.
8. Add headers:
   - `Authorization`: `Bearer <your copied upload token>`
9. Set request body to form data.
10. Add a form field named `file`; set its value to the Shortcut input.
11. Save the shortcut.

## Use it

1. Share an image from Photos, Reddit, Safari, or any app that exposes image
   sharing.
2. Pick **Save to Sploot**.
3. Wait for the request to finish.
4. Open Sploot and confirm the image appears in your library.

## Revoke access

Return to Sploot settings and revoke the token. The same Shortcut will start
receiving the stable Sploot API auth response:

```json
{
  "error": "Unauthorized"
}
```

Create a new token and replace the Authorization header if you want the
Shortcut to work again.
