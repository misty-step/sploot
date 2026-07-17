export function getQaAuthState() {
  const user = {
    firstName: 'QA',
    username: 'qa-design-user',
    emailAddresses: [{ emailAddress: 'qa-design-user@qa.local' }],
  };
  const signOut = async () => {
    document.cookie = 'sploot_qa_auth=; Max-Age=0; Path=/';
    window.location.assign('/');
  };
  return { user, signOut };
}
