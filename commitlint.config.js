/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow longer subjects for descriptive messages
    'header-max-length': [2, 'always', 100],
    // Allow any scope
    'scope-empty': [0],
    'scope-case': [0],
  },
};
