import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from './manifest-policy.mjs';

const baseManifest = {
  manifest_version: 3,
  version: '1.0.0',
  permissions: ['storage', 'tabs', 'activeTab', 'contextMenus', 'notifications', 'cookies'],
  host_permissions: [
    '*://*/*',
    'https://www.sploot.app/*',
    'https://sploot.app/*',
    'https://clerk.sploot.app/*',
  ],
};

test('accepts the least-privilege production manifest shape', () => {
  assert.deepEqual(validateManifest(baseManifest, { production: true }), []);
});

for (const scheme of ['file:///', 'ftp://', 'chrome://', 'chrome-extension://', 'data:', 'view-source:']) {
  test(`rejects ${scheme} host permissions`, () => {
    const manifest = {
      ...baseManifest,
      host_permissions: [...baseManifest.host_permissions, `${scheme}example.com/*`],
    };
    assert.match(validateManifest(manifest, { production: true }).join('\n'), /unsupported scheme|not a valid/);
  });
}

test('rejects all_urls and development hosts in production', () => {
  const manifest = {
    ...baseManifest,
    host_permissions: [...baseManifest.host_permissions, '<all_urls>', 'http://localhost:3001/*'],
  };
  const errors = validateManifest(manifest, { production: true }).join('\n');
  assert.match(errors, /<all_urls>/);
  assert.match(errors, /localhost/);
});

for (const permission of ['downloads', 'webRequest', 'declarativeNetRequest', 'management']) {
  test(`rejects undeclared privileged permission ${permission}`, () => {
    const manifest = {
      ...baseManifest,
      permissions: [...baseManifest.permissions, permission],
    };
    assert.match(
      validateManifest(manifest, { production: true }).join('\n'),
      new RegExp(`undeclared permission ${permission}`),
    );
  });
}

test('rejects undeclared production host permissions', () => {
  const manifest = {
    ...baseManifest,
    host_permissions: [...baseManifest.host_permissions, 'https://example.com/*'],
  };
  assert.match(
    validateManifest(manifest, { production: true }).join('\n'),
    /undeclared production host permission https:\/\/example\.com\/\*/,
  );
});
