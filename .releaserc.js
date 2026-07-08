/** @type {import('semantic-release').Options} */
module.exports = {
  branches: ['main', 'master'],
  plugins: [
    // Pre-stable 0.x semantics (Powder landmark-016/017): sploot runs
    // semantic-release directly with no landmark action in front of it, so it
    // gets no automatic pre-stable detection. These releaseRules mirror
    // landmark's configs/.releaserc.prestable.json — Cargo-style bumps
    // (breaking→minor, feat/fix→patch) that never cross 1.0.0 automatically.
    [
      '@semantic-release/commit-analyzer',
      {
        releaseRules: [
          { breaking: true, release: 'minor' },
          { type: 'feat', release: 'patch' },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/github',
  ],
};
