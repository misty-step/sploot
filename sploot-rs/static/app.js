const expired = document.getElementById("expired");
const offline = document.getElementById("offline");
const denied = document.getElementById("denied");

function show(which) {
  expired.hidden = which !== "expired";
  offline.hidden = which !== "offline";
  denied.hidden = which !== "denied";
}

async function check() {
  try {
    const response = await fetch("/api/me", { redirect: "manual", credentials: "same-origin" });
    if (response.status === 403) {
      show("denied");
      return;
    }
    if (response.type === "opaqueredirect" || response.status === 401) {
      show("expired");
      return;
    }
    if (response.ok) show("ok");
  } catch {
    show("offline");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") check();
});

setInterval(() => {
  if (document.visibilityState === "visible") check();
}, 300000);

const signIn = document.getElementById("sign-in");
if (signIn) signIn.addEventListener("click", () => location.reload());
