export const REQUIRED_PERMISSIONS = [
  'storage',
  'tabs',
  'activeTab',
  'contextMenus',
  'notifications',
  'cookies',
];

export const REQUIRED_PRODUCTION_HOSTS = [
  '*://*/*',
  'https://www.sploot.app/*',
  'https://sploot.app/*',
  'https://clerk.sploot.app/*',
];

/**
 * Validate the manifest policy shared by CI's secret-free build and release
 * zip validation. This intentionally accepts only web host patterns.
 */
export function validateManifest(manifest, { production = false } = {}) {
  const errors = [];
  const permissions = new Set(manifest?.permissions ?? []);
  const hosts = new Set(manifest?.host_permissions ?? []);

  if (manifest?.manifest_version !== 3) {
    errors.push(`manifest_version must be 3, got ${manifest?.manifest_version ?? '<missing>'}`);
  }

  if (manifest?.version !== '1.0.0') {
    errors.push(`version must be 1.0.0, got ${manifest?.version ?? '<missing>'}`);
  }

  for (const permission of REQUIRED_PERMISSIONS) {
    if (!permissions.has(permission)) {
      errors.push(`missing permission ${permission}`);
    }
  }

  if (!hosts.has('*://*/*')) {
    errors.push('missing narrow web host permission *://*/*');
  }

  if (hosts.has('<all_urls>')) {
    errors.push('must not request broad <all_urls>; use activeTab with *://*/*');
  }

  for (const host of hosts) {
    if (host === '*://*/*') {
      continue;
    }

    let url;
    try {
      url = new URL(host);
    } catch {
      errors.push(`host permission is not a valid HTTP(S) pattern: ${host}`);
      continue;
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`host permission uses unsupported scheme ${url.protocol}: ${host}`);
    }

    if (!host.endsWith('/*')) {
      errors.push(`host permission must cover a path with /*: ${host}`);
    }
  }

  if (production) {
    for (const host of REQUIRED_PRODUCTION_HOSTS) {
      if (!hosts.has(host)) {
        errors.push(`missing production host permission ${host}`);
      }
    }

    for (const host of hosts) {
      if (host.includes('localhost') || host.includes('clerk.accounts.dev')) {
        errors.push(`production manifest contains development host ${host}`);
      }
    }
  }

  return errors;
}
