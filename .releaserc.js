/** @type {import('semantic-release').Options} */
module.exports = {
  branches: ['main', 'master'],
  plugins: [
    // Analyze commits to determine version bump
    '@semantic-release/commit-analyzer',
    // Generate release notes from commits
    '@semantic-release/release-notes-generator',
    // Update CHANGELOG.md
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog\n\nAll notable changes to this project will be documented in this file.',
      },
    ],
    // Commit CHANGELOG.md and package.json updates
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    // Create GitHub Release
    '@semantic-release/github',
  ],
};
