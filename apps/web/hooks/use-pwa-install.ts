'use client';

import { useCallback, useEffect, useState } from 'react';
import { error as logError } from '@/lib/logger';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UsePwaInstallPromptResult {
  installable: boolean;
  installed: boolean;
  /**
   * iOS/WebKit never fires beforeinstallprompt — there is no programmatic
   * install. The UI must show share-menu → "Add to Home Screen"
   * instructions instead of an install button.
   */
  requiresManualInstall: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function isIosBrowser(userAgent: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ masquerades as macOS but reports multi-touch.
  const iPadOs = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(userAgent) || iPadOs;
}

export function usePwaInstallPrompt(): UsePwaInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [requiresManualInstall, setRequiresManualInstall] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setRequiresManualInstall(
        isIosBrowser(window.navigator.userAgent, window.navigator.maxTouchPoints ?? 0)
      );
    });

    const alreadyInstalled = window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (alreadyInstalled) {
      queueMicrotask(() => setInstalled(true));
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallable(true);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return 'unavailable';
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setInstallable(false);
      } else if (outcome === 'dismissed') {
        setInstallable(false);
      }
      return outcome;
    } catch (error) {
      logError('Error displaying PWA install prompt:', error);
      return 'unavailable';
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return {
    installable: installable && !installed,
    installed,
    requiresManualInstall: requiresManualInstall && !installed,
    promptInstall,
  };
}
