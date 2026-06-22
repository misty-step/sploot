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
import { showSuccessNotification, showErrorNotification } from './notifications';

export interface ProducedImage {
  blob: Blob;
  filename: string;
}

/**
 * @param produce    yields the image to upload (fetch from a URL, capture a tab, …)
 * @param retryLabel verb phrase for the sign-in prompts, e.g. "saving" or
 *                   "the screenshot" — "Try {retryLabel} again after signing in."
 */
export async function saveToSploot(
  produce: () => Promise<ProducedImage>,
  retryLabel: string
): Promise<void> {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showErrorNotification(`Opening Sploot sign-in. Try ${retryLabel} again after signing in.`);
      const signedIn = await promptUserSignIn();
      if (!signedIn) {
        showErrorNotification(`Sign in on Sploot, then try ${retryLabel} again.`);
        return;
      }
    }

    const { blob, filename } = await produce();
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
