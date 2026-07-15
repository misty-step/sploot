/**
 * The shared save pipeline.
 *
 * Both save flows — right-click "Save to Sploot" and screenshot-this-tab —
 * funnel through here: ensure auth (prompting web sign-in if needed), produce
 * the image, upload it, and report the outcome (notification + badge). Only the
 * "produce the image" step differs between them, so it is passed in.
 */

import { isAuthenticated, promptUserSignIn } from './auth-manager';
import { uploadImage } from '../../shared/api-client';
import { setSaveStatus } from '../../shared/save-status';
import { showSuccessNotification, showErrorNotification } from './notifications';

export interface ProducedImage {
  blob: Blob;
  filename: string;
}

export interface SaveOptions {
  /** Produce bytes before auth can open or focus another browser tab. */
  prepareBeforeAuth?: boolean;
}

/**
 * @param produce yields the image to upload (fetch from a URL, capture a tab, …)
 * @param subject noun for user-facing copy, e.g. "image" or "screenshot" —
 *                "Saving {subject}…", "try saving the {subject} again".
 */
export async function saveToSploot(
  produce: () => Promise<ProducedImage>,
  subject: string,
  options: SaveOptions = {}
): Promise<void> {
  try {
    // Live progress for the popup's persistent status strip.
    setSaveStatus({ state: 'saving', label: `Saving ${subject}…`, at: Date.now() });
    const preparedImage = options.prepareBeforeAuth ? await produce() : undefined;

    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showErrorNotification(`Opening Sploot sign-in. Try saving the ${subject} again after signing in.`);
      const signedIn = await promptUserSignIn();
      if (!signedIn) {
        showErrorNotification(`Sign in on Sploot, then try saving the ${subject} again.`);
        return;
      }
    }

    const { blob, filename } = preparedImage ?? await produce();
    const result = await uploadImage(blob, filename);
    showSuccessNotification(filename, result.thumbnailUrl, { isDuplicate: result.isDuplicate });
  } catch (error) {
    if (error instanceof Error && 'actionHref' in error && typeof error.actionHref === 'string') {
      showErrorNotification({ message: error.message, actionHref: error.actionHref });
      return;
    }
    showErrorNotification(error instanceof Error ? error.message : 'Could not save to Sploot.');
  }
}
