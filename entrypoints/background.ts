import { setupAuthListeners } from './background/auth-manager';
import { setupContextMenu } from './background/context-menu';

export default defineBackground(() => {
  console.log('Sploot extension background worker started');

  // Initialize authentication manager
  setupAuthListeners();

  // Initialize context menu
  setupContextMenu();

  console.log('Sploot extension initialized successfully');
});
