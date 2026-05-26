/** @type {import('semantic-release').Options} */
module.exports = {
  branches: ['main', 'master'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/github',
  ],
};
