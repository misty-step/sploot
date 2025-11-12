// Run this in service worker console to test Clerk client manually
// Copy and paste the whole block

(async () => {
  console.log('=== Testing Clerk Client Creation ===');

  try {
    // Import createClerkClient from the extension
    const { createClerkClient } = await import(chrome.runtime.getURL('background.js'));

    console.log('Testing with syncHost: https://www.sploot.app');
    const clerk = await createClerkClient({
      publishableKey: 'pk_test_dGVuZGVyLWJpc29uLTczLmNsZXJrLmFjY291bnRzLmRldiQ',
      syncHost: 'https://www.sploot.app',  // WITH www
    });

    console.log('=== Clerk Client Created ===');
    console.log('Has session:', !!clerk.session);
    console.log('User ID:', clerk.session?.user?.id);
    console.log('User email:', clerk.session?.user?.primaryEmailAddress?.emailAddress);
    console.log('Client ID:', clerk.client?.id);

    if (clerk.session) {
      console.log('✅ SUCCESS - Clerk found session!');
      const token = await clerk.session.getToken();
      console.log('Token retrieved:', !!token);
    } else {
      console.log('❌ FAILED - No session found');
    }

  } catch (error) {
    console.error('Error creating Clerk client:', error);
  }
})();
