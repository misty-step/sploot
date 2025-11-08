import { setupAuthListeners } from './background/auth-manager';

export default defineBackground(() => {
  console.log('Sploot extension background worker started');

  // Initialize authentication manager
  setupAuthListeners();

  // Context menu and other background handlers will be registered here
});
