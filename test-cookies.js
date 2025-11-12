// Test cookie access from service worker console
// Copy and paste each section separately

// Test 1: Check cookies from www.sploot.app
console.log('=== Test 1: Cookies from www.sploot.app ===');
chrome.cookies.getAll({domain: 'www.sploot.app'}, (cookies) => {
  const clerkCookies = cookies.filter(c =>
    c.name.includes('session') ||
    c.name.includes('clerk') ||
    c.name.includes('client')
  );
  console.log('Found', clerkCookies.length, 'Clerk-related cookies');
  console.table(clerkCookies.map(c => ({
    name: c.name,
    domain: c.domain,
    secure: c.secure,
    sameSite: c.sameSite
  })));
});

// Test 2: Check specific Clerk cookies
console.log('\n=== Test 2: Checking specific Clerk cookies ===');
const cookiesToCheck = ['__session', '__client', '__client_uat', '__clerk_db_jwt'];

cookiesToCheck.forEach(name => {
  // Check on www.sploot.app
  chrome.cookies.get({
    url: 'https://www.sploot.app',
    name: name
  }, (cookie) => {
    console.log(`${name} on www.sploot.app:`, cookie ? '✅ FOUND' : '❌ NOT FOUND');
  });

  // Check on sploot.app (without www)
  chrome.cookies.get({
    url: 'https://sploot.app',
    name: name
  }, (cookie) => {
    console.log(`${name} on sploot.app:`, cookie ? '✅ FOUND' : '❌ NOT FOUND');
  });
});

// Test 3: Check all accessible Clerk cookies
console.log('\n=== Test 3: All accessible Clerk cookies ===');
chrome.cookies.getAll({}, (cookies) => {
  const clerkCookies = cookies.filter(c =>
    c.domain.includes('sploot') &&
    (c.name.includes('clerk') || c.name.includes('session') || c.name.includes('client'))
  );

  console.log('Total Clerk cookies found:', clerkCookies.length);
  console.table(clerkCookies.map(c => ({
    name: c.name,
    domain: c.domain,
    value: c.value.substring(0, 20) + '...'
  })));
});
