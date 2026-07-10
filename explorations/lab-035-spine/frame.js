/* lab 035 frame router — renders SPECS[hash] into #mount, reports to shell. */
'use strict';

function renderFromHash() {
  const id = (location.hash || '').replace('#', '');
  const mount = document.getElementById('mount');
  if (!id) return;
  const builder = SPECS[id];
  const fresh = document.createElement('div');
  fresh.id = 'mount';
  mount.replaceWith(fresh);
  let ok = false;
  if (builder) {
    try {
      // Builders either fill the mount node (034 convention) or return a
      // detached root element — accept both.
      const returned = builder(fresh);
      if (returned instanceof Node && !fresh.hasChildNodes()) fresh.appendChild(returned);
      ok = true;
    } catch (err) {
      console.error('lab035 builder error for', id, err);
      fresh.innerHTML = `<div style="padding:40px;font-family:monospace">builder error for ${id}: ${err.message}</div>`;
    }
  } else {
    fresh.innerHTML = `<div style="padding:40px;font-family:monospace">no builder for ${id}</div>`;
  }
  if (window.parent !== window) {
    window.parent.postMessage({ lab: '035', id, ok }, '*');
  }
}

window.addEventListener('hashchange', renderFromHash);
console.log('lab035 frame · round 1 · builders:', Object.keys(SPECS).length);
renderFromHash();
