(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const assets = new Map();
  const observedVideos = new Set();
  const videoRatios = new Map();
  const systemPauses = new WeakSet();
  let mediaObserver;
  let sessionUser;
  let sessionCheck;
  let authReady = Promise.resolve();
  let viewerAsset;
  let detailsAsset;
  let sharedFile;
  let shareController;
  let sharedObjectURL;
  let currentRoute = "";
  let currentOwner = "";
  let generation = 0;
  let restoring = false;
  let scrollTimer;
  let activeVideo;
  let uploadRunning = false;
  let activeUploadController;
  const uploadQueue = [];
  let deviceRequest;
  let trashCursor;
  let indexingTimer;

  const captureJobs = new Map();
  let capturePersistence = Promise.resolve();
  let captureRecoveryOwner;
  let captureTab;
  let captureSessionEnded = false;
  function storageGet(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
  }
  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch { /* Browsing still works in storage-restricted sessions. */ }
  }
  function page() { return $("#page-state")?.dataset || {}; }
  function routeKey() { return location.pathname + location.search; }
  function positionKey(route = currentRoute) { return `sploot:${currentOwner}:position:${route}`; }
  function autoplayEnabled() {
    const preference = storageGet(localStorage, "sploot:autoplay");
    return preference === null ? !reducedMotion.matches : preference === "true";
  }
  function announce(message) {
    const dialog = all("dialog[open]").at(-1);
    let output = dialog ? $("[data-dialog-announcer]", dialog) : $("#announcer");
    if (!output) {
      output = document.createElement("div");
      output.className = "sr-only";
      output.dataset.dialogAnnouncer = "";
      output.setAttribute("role", "status");
      output.setAttribute("aria-live", "polite");
      dialog.append(output);
    }
    output.textContent = message;
  }
  function notify(message, actionLabel, action) {
    const container = all("dialog[open]").at(-1) || $("#notifications");
    const notification = document.createElement("div");
    notification.className = "notification";
    const text = document.createElement("p");
    text.textContent = message;
    notification.append(text);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      button.textContent = actionLabel;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await action(); notification.remove(); }
        catch (error) { text.textContent = error.message; button.disabled = false; announce(error.message); }
      });
      notification.append(button);
    }
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "icon-button";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => notification.remove());
    notification.append(dismiss);
    container.append(notification);
    announce(message);
    if (!action) setTimeout(() => notification.remove(), 8000);
  }
  function safeReturnURL(value) {
    try {
      const target = new URL(value || "/app", location.origin);
      if (target.origin === location.origin && (target.pathname === "/app" || target.pathname.startsWith("/app/"))) return target.pathname + target.search + target.hash;
    } catch { /* Untrusted redirect destinations fall back to the library. */ }
    return "/app";
  }
  function sessionNotice(message, signIn = false) {
    $("[data-session-message]").textContent = message;
    const link = $("[data-session-link]");
    link.hidden = !signIn;
    link.href = `/sign-in?redirect_url=${encodeURIComponent(safeReturnURL(location.href))}`;
    $("#session-notice").hidden = !message;
  }
  function sessionExpired(changed = false) {
    rememberPosition();
    captureSessionEnded = true;
    pauseAllVideos();
    activeUploadController?.abort();
    clearTimeout(indexingTimer);
    $("#drop-target").hidden = true;
    $("#upload-files").disabled = true;
    $("#url-save-form button[type='submit']").disabled = true;
    shareController?.abort();
    all("dialog[open]").forEach(dialog => { dialog.dataset.history = "false"; dialog.close(); });
    const shell = $("#shell");
    if (shell) { shell.inert = true; shell.hidden = true; }
    $("#session-notice").hidden = true;
    $("#session-lock-title").textContent = changed ? "The signed-in account changed" : "Your session ended";
    $("#session-lock-message").textContent = "Your pending captures stay on this device, under their original account. They have not been moved to another library.";
    const link = $("#session-lock-link");
    link.href = changed ? safeReturnURL(location.href) : `/sign-in?redirect_url=${encodeURIComponent(safeReturnURL(location.href))}`;
    link.textContent = changed ? "Open the current account" : "Sign in again";
    $("#session-lock").hidden = false;
    $("#review-pending").hidden = captureJobs.size === 0;
    link.focus();
  }
  async function request(path, options = {}) {
    await authReady;
    const target = new URL(path, location.origin);
    if (target.origin !== location.origin) throw new Error("This action must stay on Sploot.");
    if (captureSessionEnded && page().userId && target.pathname !== "/api/auth/logout") throw new Error("Your session changed. Sign in to the original account to continue.");
    const headers = new Headers(options.headers);
    if (page().userId) headers.set("X-Sploot-User-ID", page().userId);
    const response = await fetch(target, { ...options, headers, credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 && page().userId) sessionExpired();
    if (response.status === 409 && page().userId) {
      const error = await response.clone().json().catch(() => null);
      if (error?.code === "ACCOUNT_CHANGED") sessionExpired(true);
    }
    return response;
  }
  async function responseData(response) {
    if (response.status === 204) return {};
    try { return await response.json(); }
    catch { throw new Error("Sploot returned an unreadable response. Please try again."); }
  }
  async function api(path, options = {}) {
    const response = await request(path, options);
    const data = await responseData(response);
    if (!response.ok) {
      const error = new Error(typeof data.error === "string" ? data.error : `The request failed (${response.status}). Try again.`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function jsonOptions(method, body) {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  function checkSession() {
    if (sessionCheck) return sessionCheck;
    sessionCheck = (async () => {
      const state = page();
      const response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        sessionUser = null;
        if (state.userId) sessionExpired();
        return null;
      }
      const data = await responseData(response);
      if (!response.ok || !data.user?.id || !data.user?.email) throw new Error(data.error || "Your session could not be checked. Check your connection and try again.");
      sessionUser = data.user;
      if (state.userId && state.userId !== sessionUser.id) {
        sessionExpired(true);
        return null;
      }
      if ($("#auth-form")) {
        location.replace(safeReturnURL(state.returnUrl));
        return sessionUser;
      }
      if (!captureSessionEnded) sessionNotice("");
      updateAccountControls();
      return sessionUser;
    })().finally(() => { sessionCheck = null; });
    return sessionCheck;
  }
  async function initializeAuth() {
    if (!page().userId && !$("#auth-form")) return;
    try { await checkSession(); }
    catch (error) { if (page().userId) sessionNotice(error.message); }
  }
  function updateAccountControls() {
    const email = sessionUser?.id === page().userId ? sessionUser.email : page().accountEmail;
    all("[data-account-label]").forEach(label => { label.textContent = email || ""; });
  }
  function broadcastSessionChange() {
    storageSet(localStorage, "sploot:session-change", `${Date.now()}:${Math.random()}`);
  }
  function passwordValidation(password) {
    const length = [...password].length;
    return length < 12 || length > 128 ? "Use a password with 12–128 characters." : "";
  }
  function showFormError(output, message) {
    output.textContent = message;
    output.hidden = false;
    output.tabIndex = -1;
    output.focus();
  }
  async function submitAuth(form) {
    const errorOutput = $("#auth-error");
    const status = $("#auth-status");
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    errorOutput.hidden = true;
    status.hidden = true;
    const password = $("#auth-password").value;
    if (form.dataset.authMode === "register") {
      const invalid = passwordValidation(password);
      if (invalid) { showFormError(errorOutput, invalid); return; }
    }
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const data = await api(form.action, jsonOptions("POST", { email: $("#auth-email").value.trim(), password }));
      if (!data.user?.id) throw new Error("Sign-in was not confirmed. Try signing in again.");
      sessionUser = data.user;
      $("#auth-password").value = "";
      broadcastSessionChange();
      status.textContent = "Opening your library…";
      status.hidden = false;
      location.assign(safeReturnURL(page().returnUrl));
    } catch (error) { showFormError(errorOutput, error.message); }
    finally { submit.disabled = false; form.removeAttribute("aria-busy"); }
  }
  // Fragments are not sent to HTTP servers, referrers, or access logs. Remove
  // the secret from history immediately; retain it only in this page closure.
  let claimParameters = null;
  if ($("#claim-form")) {
    const receiveInvitation = () => {
      claimParameters = new URLSearchParams(location.hash.slice(1));
      history.replaceState(null, "", "/claim");
      $("#claim-account").textContent = claimParameters.get("email") || "Use the invitation the operator sent for your account.";
      $("#claim-password").value = "";
      $("#claim-error").hidden = true;
    };
    receiveInvitation();
    addEventListener("hashchange", receiveInvitation);
  }
  async function submitClaim(form) {
    const output = $("#claim-error");
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    output.hidden = true;
    const password = $("#claim-password").value;
    const invalid = passwordValidation(password);
    if (invalid) { showFormError(output, invalid); return; }
    const parameters = claimParameters;
    const userId = parameters?.get("userId");
    const token = parameters?.get("token");
    if (!userId || !token) { showFormError(output, "Open the complete private invitation link from the operator."); return; }
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const data = await api(form.action, jsonOptions("POST", { userId, token, password }));
      if (data.user?.id !== userId) throw new Error("Account activation was not confirmed.");
      parameters.delete("token");
      broadcastSessionChange();
      if (claimParameters === parameters) {
        $("#claim-password").value = "";
        location.replace("/app");
      }
    } catch (error) {
      if (claimParameters === parameters) showFormError(output, error.message);
    }
    finally { submit.disabled = false; form.removeAttribute("aria-busy"); }
  }
  async function signOut(switchAccount = false) {
    const destination = switchAccount ? `/sign-in?redirect_url=${encodeURIComponent(safeReturnURL(location.href))}` : "/sign-in";
    rememberPosition();
    activeUploadController?.abort();
    await capturePersistence;
    if ([...captureJobs.values()].some(job => job.file && !job.record)) throw new Error("A pending file could not be kept on this device. Retry or remove it in Save before signing out.");
    all("[data-action='sign-out'], [data-action='switch-account']").forEach(button => { button.disabled = true; });
    captureSessionEnded = true;
    activeUploadController?.abort();
    try {
      await api("/api/auth/logout", { method: "POST" });
      sessionUser = null;
      broadcastSessionChange();
      location.assign(destination);
    } catch (error) {
      if ($("#session-lock").hidden) captureSessionEnded = false;
      throw error;
    } finally { all("[data-action='sign-out'], [data-action='switch-account']").forEach(button => { button.disabled = false; }); }
  }
  async function changePassword(form) {
    const errorOutput = $("#password-error");
    const status = $("#password-status");
    errorOutput.hidden = true;
    status.hidden = true;
    const password = $("#new-password").value;
    const invalid = passwordValidation(password);
    if (invalid) { showFormError(errorOutput, invalid); return; }
    if (password !== $("#confirm-password").value) { showFormError(errorOutput, "The new passwords do not match."); return; }
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      await api("/api/auth/password", jsonOptions("POST", { currentPassword: $("#current-password").value, password }));
      broadcastSessionChange();
      if (!form.isConnected) { notify("Password changed. Other connections and access tokens were revoked."); return; }
      form.reset();
      $("#new-token-value").value = "";
      $("#new-token").hidden = true;
      status.textContent = "Password changed. Other browsers and devices are signed out, and your personal access tokens are revoked.";
      status.hidden = false;
      loadSettings(generation);
    } catch (error) { showFormError(errorOutput, error.message); }
    finally { submit.disabled = false; }
  }
  async function loadDevices(version = generation) {
    const data = await api("/api/auth/devices");
    if (version !== generation || !$("#device-list")) return;
    if (!Array.isArray(data.devices)) throw new Error("Sploot could not read your connected devices.");
    const list = $("#device-list");
    list.replaceChildren();
    if (!data.devices.length) { list.textContent = "No connected devices. Start a connection in your extension to get a code."; return; }
    data.devices.forEach(device => {
      const row = document.createElement("div");
      row.className = "token-row";
      const detail = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = device.name;
      const description = document.createElement("p");
      description.textContent = `Connected ${formatDate(device.createdAt)}. ${device.lastUsedAt ? `Last used ${formatDate(device.lastUsedAt)}.` : "Not used yet."} Expires ${formatDate(device.expiresAt)}.`;
      detail.append(name, description);
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "button";
      revoke.textContent = "Disconnect";
      revoke.setAttribute("aria-label", `Disconnect ${device.name}`);
      revoke.addEventListener("click", async () => {
        if (!confirm(`Disconnect “${device.name}”? It will no longer have access to your library.`)) return;
        revoke.disabled = true;
        try { await api(`/api/auth/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" }); await loadDevices(version); announce("Device disconnected."); }
        catch (error) { notify(error.message); revoke.disabled = false; }
      });
      row.append(detail, revoke);
      list.append(row);
    });
  }
  async function checkDeviceCode(form) {
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    const code = $("#device-user-code").value.trim().toUpperCase();
    if (!code) return;
    const version = generation;
    const errorOutput = $("#device-code-error");
    errorOutput.hidden = true;
    $("#device-code-status").hidden = true;
    $("#device-approval").hidden = true;
    deviceRequest = null;
    submit.disabled = true;
    try {
      const data = await api(`/api/auth/device?userCode=${encodeURIComponent(code)}`);
      if (!form.isConnected || version !== generation) return;
      if (!data.userCode || !data.name || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error("This connection could not be read. Request a new code from your device.");
      deviceRequest = data;
      $("#device-user-code").value = data.userCode;
      $("#device-request-name").textContent = data.name;
      $("#device-confirm-code").textContent = data.userCode;
      $("#device-request-expiry").textContent = `Code expires ${new Date(data.expiresAt).toLocaleTimeString()}.`;
      $("#device-approval").hidden = false;
      const url = new URL(location.href);
      url.searchParams.set("code", data.userCode);
      history.replaceState(history.state, "", url);
      currentRoute = routeKey();
      $("[data-action='approve-device']").focus();
    } catch (error) { if (form.isConnected) showFormError(errorOutput, error.message); }
    finally { submit.disabled = false; }
  }
  async function approveDevice(approve) {
    const requested = deviceRequest;
    if (!requested) return;
    const controls = all("#device-approval button, #device-code-form button");
    controls.forEach(button => { button.disabled = true; });
    $("#device-code-error").hidden = true;
    try {
      await api("/api/auth/device/approve", jsonOptions("POST", { userCode: requested.userCode, approve }));
      if (deviceRequest !== requested || !$("#device-approval")) return;
      deviceRequest = null;
      $("#device-approval").hidden = true;
      const status = $("#device-code-status");
      status.textContent = approve ? `${requested.name} approved. Return to your device to finish connecting. You can disconnect it in Settings.` : "Connection denied. This device was not given access to your library.";
      status.hidden = false;
      status.tabIndex = -1;
      status.focus();
    } catch (error) { if ($("#device-code-error")) showFormError($("#device-code-error"), error.message); }
    finally { controls.forEach(button => { button.disabled = false; }); }
  }
  async function loadTrash(append = false, version = generation) {
    const query = new URLSearchParams({ deleted: "true", sortBy: "updatedAt", sortOrder: "desc", limit: "20" });
    if (append && trashCursor) query.set("cursor", trashCursor);
    const data = await api(`/api/assets?${query}`);
    if (version !== generation || !$("#trash-list")) return;
    if (!Array.isArray(data.assets)) throw new Error("Sploot could not read the trash.");
    const list = $("#trash-list");
    if (!append) list.replaceChildren();
    data.assets.forEach(asset => {
      const row = document.createElement("div");
      row.className = "token-row";
      const detail = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = asset.filename;
      const description = document.createElement("p");
      description.textContent = `${formatBytes(asset.size)}. Moved to trash ${formatDate(asset.deletedAt)}.`;
      detail.append(name, description);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "button";
      restore.textContent = "Restore";
      restore.setAttribute("aria-label", `Restore ${asset.filename}`);
      restore.addEventListener("click", async () => {
        restore.disabled = true;
        purge.disabled = true;
        try {
          await api(`/api/assets/${encodeURIComponent(asset.id)}/restore`, { method: "POST" });
          row.remove();
          if (!list.children.length) await loadTrash(false, version);
          loadStats(version).catch(error => notify(error.message));
          notify("Restored to your library.", "View meme", async () => showViewer(await getAsset(asset.id)));
        } catch (error) { notify(error.message); restore.disabled = false; purge.disabled = false; }
      });
      const purge = document.createElement("button");
      purge.type = "button";
      purge.className = "button button-danger";
      purge.textContent = "Delete permanently";
      purge.setAttribute("aria-label", `Delete ${asset.filename} permanently`);
      purge.addEventListener("click", async () => {
        if (!confirm(`Permanently delete “${asset.filename}” and its preview? This cannot be undone. Existing backup copies are not erased.`)) return;
        restore.disabled = true;
        purge.disabled = true;
        try {
          await api(`/api/assets/${encodeURIComponent(asset.id)}/purge`, { method: "DELETE" });
          if (version !== generation) return;
          row.remove();
          if (!list.children.length) await loadTrash(false, version);
          await loadStats(version);
          announce("Deleted permanently from this library.");
        } catch (error) { notify(error.message); restore.disabled = false; purge.disabled = false; }
      });
      const actions = document.createElement("div");
      actions.className = "button-row";
      actions.append(restore, purge);
      row.append(detail, actions);
      list.append(row);
    });
    trashCursor = data.nextCursor || "";
    $("#load-trash").hidden = !data.hasMore || !trashCursor;
    if (!list.children.length) list.textContent = "Trash is empty.";
  }

  function assetFromCard(card) {
    const data = card.dataset;
    return { id: data.assetId, filename: data.filename, mime: data.mime, source: data.source, poster: data.poster, download: data.download, favorite: data.favorite === "true", size: Number(data.size), createdAt: data.created, width: Number(data.width), height: Number(data.height), public: data.public === "true", shareSlug: data.shareSlug, card };
  }
  function normalizeAsset(asset) {
    const source = `/media/${encodeURIComponent(asset.id)}`;
    return { ...asset, mime: asset.mime || asset.mimeType, source, poster: asset.thumbnailUrl ? `${source}?thumbnail=1` : "", download: `${source}?download=1`, public: false };
  }
  async function getAsset(id) {
    if (assets.has(id)) return assets.get(id);
    const data = await api(`/api/assets/${encodeURIComponent(id)}`);
    if (!data.asset?.id) throw new Error("This meme is no longer available.");
    const asset = normalizeAsset(data.asset);
    assets.set(asset.id, asset);
    return asset;
  }
  function pauseVideo(video) {
    if (!video.paused) { systemPauses.add(video); video.pause(); }
    video.muted = true;
  }
  function releaseViewerVideo() {
    const video = $("#viewer-stage video");
    if (!video) return;
    pauseVideo(video);
    observedVideos.delete(video);
    video.removeAttribute("src");
    video.load();
  }
  function pauseAllVideos(except) {
    observedVideos.forEach(video => { if (video !== except) pauseVideo(video); });
    const viewerVideo = $("#viewer-stage video");
    if (viewerVideo && viewerVideo !== except) pauseVideo(viewerVideo);
  }
  function chooseVisibleVideo() {
    if (captureSessionEnded || document.hidden || $("dialog[open]:not(#viewer)")) { pauseAllVideos(); return; }
    let candidate = $("#viewer[open] video");
    if (!$("#viewer").open) {
      let largest = .45;
      videoRatios.forEach((ratio, video) => { if (ratio > largest) { largest = ratio; candidate = video; } });
    }
    if (activeVideo !== candidate) { pauseAllVideos(candidate); activeVideo = candidate; }
    if (candidate && autoplayEnabled() && candidate.paused && !candidate.dataset.userPaused && !candidate.dataset.autoplayBlocked) {
      candidate.play().catch(() => { candidate.dataset.autoplayBlocked = "true"; });
    }
  }
  function bindVideo(video) {
    if (observedVideos.has(video)) return;
    observedVideos.add(video);
    video.addEventListener("play", () => {
      if (document.hidden || $("dialog[open]:not(#viewer)") || (!video.closest("#viewer") && (videoRatios.get(video) || 0) === 0)) { pauseVideo(video); return; }
      delete video.dataset.userPaused;
      delete video.dataset.autoplayBlocked;
      pauseAllVideos(video);
      activeVideo = video;
    });
    video.addEventListener("pause", () => {
      if (systemPauses.has(video)) systemPauses.delete(video);
      else video.dataset.userPaused = "true";
    });
    video.addEventListener("volumechange", () => {
      const root = video.closest(".media-card, #viewer");
      const button = root && $("[data-action='sound']", root);
      if (button) {
        button.setAttribute("aria-pressed", String(!video.muted));
        button.setAttribute("aria-label", video.muted ? "Turn sound on" : "Mute video");
      }
    });
  }
  function bindMedia() {
    const feed = $("#feed");
    if (!feed) return;
    all("[data-asset-id]", feed).forEach(card => {
      assets.set(card.dataset.assetId, assetFromCard(card));
      const video = $("video", card);
      if (video && !observedVideos.has(video)) { bindVideo(video); mediaObserver.observe(video); }
    });
  }
  function resetMedia() {
    pauseAllVideos();
    mediaObserver?.disconnect();
    observedVideos.clear();
    videoRatios.clear();
    assets.clear();
    activeVideo = null;
    const top = matchMedia("(min-width: 760px)").matches ? 0 : Math.round($(".chrome")?.getBoundingClientRect().height || 0);
    mediaObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => videoRatios.set(entry.target, entry.intersectionRatio));
      chooseVisibleVideo();
    }, { rootMargin: `-${top}px 0px -48px 0px`, threshold: [0, .25, .45, .6, .8, 1] });
    bindMedia();
  }
  function visibleCard() {
    const feed = $("#feed");
    if (!feed) return null;
    const rect = feed.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const found = document.elementFromPoint(x, innerHeight / 2)?.closest(".media-card");
    if (found) return found;
    const cards = all(".media-card", feed);
    return cards.find(card => card.getBoundingClientRect().bottom > 120) || cards.at(-1);
  }
  function rememberPosition(enteringSearch = false) {
    if (restoring || currentRoute !== routeKey() || !currentOwner || !$("#feed") || $("#viewer").open) return;
    if (!enteringSearch && document.activeElement?.closest("[data-search-form]")) return;
    const anchor = visibleCard();
    storageSet(sessionStorage, positionKey(), JSON.stringify({ anchor: anchor?.dataset.assetId, offset: anchor?.getBoundingClientRect().top || 0, y: scrollY, pages: all("[data-page-marker]").length }));
  }
  async function restorePosition(version) {
    let saved;
    try { saved = JSON.parse(storageGet(sessionStorage, positionKey()) || "null"); } catch { return; }
    if (!saved || !Number.isFinite(saved.y) || saved.y < 0) return;
    restoring = true;
    try {
      while (version === generation && saved.anchor && !assets.has(saved.anchor) && all("[data-page-marker]").length < saved.pages) {
        const loader = $("#load-more");
        if (!loader) break;
        const response = await request(loader.dataset.nextFragment, { headers: { Accept: "text/html" } });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Your previous position could not be restored. Reload to try again.");
        const html = await response.text();
        if (version !== generation) return;
        const fragment = document.createElement("template");
        fragment.innerHTML = html;
        if (fragment.content.querySelector("#shell")) throw new Error("Sign in again to return to your previous position.");
        loader.replaceWith(fragment.content);
        bindMedia();
      }
      if (version !== generation) return;
      await new Promise(resolve => requestAnimationFrame(resolve));
      const anchor = assets.get(saved.anchor)?.card;
      window.scrollTo({ top: anchor ? scrollY + anchor.getBoundingClientRect().top - saved.offset : saved.y, behavior: "instant" });
    } catch (error) { notify(error.message); }
    finally {
      if (version === generation) {
        restoring = false;
        window.htmx?.process($("#feed"));
      }
    }
  }
  function updateSeed() {
    const state = page();
    if (!state.userId) return false;
    const key = `sploot:${state.userId}:seed`;
    const previous = storageGet(sessionStorage, key);
    if (state.page === "app" && state.seed) {
      const url = new URL(location.href);
      if (!url.searchParams.has("seed") && previous && previous !== state.seed) {
        url.searchParams.set("seed", previous);
        location.replace(url);
        return true;
      }
      url.searchParams.set("seed", state.seed);
      history.replaceState(history.state, "", url);
      storageSet(sessionStorage, key, state.seed);
    }
    const seed = state.page === "app" ? state.seed || previous : previous || state.seed;
    if (seed) all("[data-feed-nav], .wordmark, .back-link").forEach(link => {
      const url = new URL(link.href, location.origin);
      if (url.pathname === "/app") { url.searchParams.set("seed", seed); link.href = url.href; }
    });
    const searchSeed = $("[data-search-form] input[name='seed']");
    if (searchSeed && seed) searchSeed.value = seed;
    return false;
  }
  async function initializePage() {
    const version = ++generation;
    const previousRoute = currentRoute;
    currentOwner = page().userId || "";
    if (updateSeed()) return;
    currentRoute = routeKey();
    resetMedia();
    updateAccountControls();
    const autoplay = $("#autoplay-setting");
    if (autoplay) autoplay.checked = autoplayEnabled();
    if (page().page === "settings" && currentOwner) loadSettings(version);
    deviceRequest = null;
    if (page().page === "connect" && $("#device-user-code").value.trim()) checkDeviceCode($("#device-code-form"));
    if (currentOwner) recoverUploads().catch(error => notify(error.message, "Retry", () => recoverUploads()));
    if ($("#feed") && currentOwner && storageGet(sessionStorage, positionKey())) await restorePosition(version);
    else if (previousRoute !== currentRoute) window.scrollTo({ top: 0, behavior: "instant" });
    if (version !== generation) return;
    restoring = false;
    const storageAvailable = !!crypto.subtle && typeof crypto.randomUUID === "function" && "indexedDB" in window;
    const canCapture = storageAvailable && page().uploadsEnabled === "true" && !!page().userId && !captureSessionEnded;
    $("#upload-files").disabled = !canCapture;
    $("#url-save-form button[type='submit']").disabled = !canCapture;
    $("#upload-capability").hidden = storageAvailable;
    const target = location.hash.startsWith("#asset=") ? decodeURIComponent(location.hash.slice(7)) : new URLSearchParams(location.search).get("asset");
    if (target && !$("#viewer").open) {
      try { showViewer(await getAsset(target), false); } catch (error) { notify(error.message); }
    }
    if (new URLSearchParams(location.search).get("upload") === "true" && page().uploadsEnabled === "true") openDialog("upload-dialog");
    const more = $("#load-more");
    if (more && more.getBoundingClientRect().top < innerHeight) $("a", more).click();
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
    chooseVisibleVideo();
  }
  function showViewer(asset, push = true) {
    rememberPosition();
    viewerAsset = asset;
    const viewer = $("#viewer");
    const stage = $("#viewer-stage");
    releaseViewerVideo();
    stage.classList.remove("is-zoomed");
    stage.replaceChildren();
    const isVideo = asset.mime.startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = asset.source;
    if (isVideo) {
      media.controls = true;
      media.muted = true;
      media.playsInline = true;
      media.loop = true;
      media.preload = "metadata";
      if (asset.poster) media.poster = asset.poster;
      bindVideo(media);
    } else {
      media.alt = asset.filename;
      media.addEventListener("click", () => toggleZoom());
    }
    media.addEventListener("error", () => notify("The original could not load. Try Download original in the sharing panel."), { once: true });
    stage.append(media);
    $("#viewer-title").textContent = asset.filename;
    const favorite = $("[data-action='favorite']", viewer);
    favorite.hidden = asset.public;
    favorite.setAttribute("aria-pressed", String(asset.favorite));
    favorite.setAttribute("aria-label", asset.favorite ? "Remove from favorites" : "Add to favorites");
    const sound = $("[data-action='sound']", viewer);
    sound.hidden = !isVideo;
    sound.setAttribute("aria-pressed", "false");
    sound.setAttribute("aria-label", "Turn sound on");
    const zoom = $("[data-action='zoom']", viewer);
    if (zoom) { zoom.hidden = isVideo; zoom.setAttribute("aria-pressed", "false"); }
    const cards = all(".media-card", $("#feed") || document);
    const index = cards.findIndex(card => card.dataset.assetId === asset.id);
    $("[data-action='previous']", viewer).disabled = index <= 0;
    $("[data-action='next']", viewer).disabled = index < 0 || index >= cards.length - 1;
    if (push && !viewer.open) history.pushState({ splootViewer: true, route: currentRoute }, "", `#asset=${encodeURIComponent(asset.id)}`);
    else if (viewer.open) history.replaceState(history.state, "", `#asset=${encodeURIComponent(asset.id)}`);
    viewer.dataset.history = push ? "true" : "false";
    openDialog("viewer");
    chooseVisibleVideo();
  }
  function toggleZoom() {
    if (!$("#viewer-stage img")) return;
    const zoomed = $("#viewer-stage").classList.toggle("is-zoomed");
    $("#viewer [data-action='zoom']")?.setAttribute("aria-pressed", String(zoomed));
    announce(zoomed ? "Original-size view. Scroll or pinch to read the meme." : "Fit to screen.");
  }
  function stepMedia(direction) {
    const cards = all(".media-card", $("#feed") || document);
    const current = $("#viewer").open ? viewerAsset?.card : visibleCard();
    const index = cards.indexOf(current);
    const next = cards[index + direction];
    if (!next) {
      if (direction > 0) $("#load-more a")?.click();
      return;
    }
    if ($("#viewer").open) showViewer(assets.get(next.dataset.assetId));
    else { next.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" }); next.focus({ preventScroll: true }); }
  }
  async function toggleFavorite(asset) {
    if (!asset || asset.public || asset.favoritePending) return;
    asset.favoritePending = true;
    const next = !asset.favorite;
    try {
      const data = await api(`/api/assets/${encodeURIComponent(asset.id)}`, jsonOptions("PATCH", { favorite: next }));
      if (typeof data.asset?.favorite !== "boolean") throw new Error("Sploot did not confirm the favorite change.");
      asset.favorite = data.asset.favorite;
      if (asset.card) asset.card.dataset.favorite = String(asset.favorite);
      const buttons = [asset.card && $("[data-action='favorite']", asset.card), viewerAsset?.id === asset.id && $("#viewer [data-action='favorite']")].filter(Boolean);
      buttons.forEach(button => { button.setAttribute("aria-pressed", String(asset.favorite)); button.setAttribute("aria-label", asset.favorite ? "Remove from favorites" : "Add to favorites"); });
      if (!asset.favorite && page().favorite === "true") asset.card?.remove();
      announce(asset.favorite ? "Added to favorites." : "Removed from favorites.");
    } finally { asset.favoritePending = false; }
  }
  function toggleSound(asset) {
    const video = $("#viewer").open && viewerAsset?.id === asset?.id ? $("#viewer-stage video") : asset?.card && $("video", asset.card);
    if (!video) return;
    pauseAllVideos(video);
    video.muted = !video.muted;
    if (video.paused) video.play().catch(() => notify("Use the video's Play control to start playback."));
  }
  async function prepareShare(asset) {
    if (!asset) return;
    shareController?.abort();
    if (sharedObjectURL) URL.revokeObjectURL(sharedObjectURL);
    sharedObjectURL = null;
    sharedFile = null;
    const controller = new AbortController();
    shareController = controller;
    $("#share-filename").textContent = asset.filename;
    $("#share-status").textContent = "Preparing the original file…";
    $("#native-share").disabled = true;
    $("#native-share").hidden = false;
    $("#copy-media").disabled = true;
    $("#copy-media").hidden = false;
    $("#download-media").href = asset.download;
    $("#download-media").download = asset.filename;
    openDialog("share-dialog");
    try {
      const response = await request(asset.source, { signal: controller.signal });
      if (!response.ok) throw new Error("The original could not be prepared. Try Download original.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const expectedSize = Number(response.headers.get("Content-Length"));
      if (!blob.size || (expectedSize > 0 && blob.size !== expectedSize) || /^(text\/|application\/json)/.test(blob.type)) throw new Error("The original download was incomplete. Try Download original again.");
      const mediaType = blob.type || asset.mime;
      sharedFile = new File([blob], asset.filename, { type: mediaType });
      sharedObjectURL = URL.createObjectURL(sharedFile);
      $("#download-media").href = sharedObjectURL;
      const canShare = !!navigator.share && !!navigator.canShare?.({ files: [sharedFile] });
      const canCopy = mediaType.startsWith("image/") && !!navigator.clipboard?.write && typeof ClipboardItem !== "undefined" && (typeof ClipboardItem.supports === "function" ? ClipboardItem.supports(mediaType) : mediaType === "image/png");
      $("#native-share").disabled = !canShare;
      $("#native-share").hidden = !canShare;
      $("#copy-media").disabled = !canCopy;
      $("#copy-media").hidden = !canCopy;
      $("#share-status").textContent = canShare ? "Ready. Share the file with an app or save it to your device." : canCopy ? "This browser can copy this image or download the original file." : "This browser cannot share or copy this file format. Download the original, then attach it in your app.";
    } catch (error) {
      if (!controller.signal.aborted) $("#share-status").textContent = error.message;
    }
  }
  function showDetails(asset) {
    detailsAsset = asset;
    $("#details-filename").textContent = asset.filename;
    $("#details-download").href = asset.download;
    $("#details-download").download = asset.filename;
    const metadata = $("#details-metadata");
    metadata.replaceChildren();
    const values = [["Format", asset.mime], ["Original size", formatBytes(asset.size)]];
    if (asset.width && asset.height) values.push(["Dimensions", `${asset.width} × ${asset.height}`]);
    if (asset.createdAt) values.push(["Saved", formatDate(asset.createdAt)]);
    values.forEach(([label, value]) => { const term = document.createElement("dt"); const definition = document.createElement("dd"); term.textContent = label; definition.textContent = value; metadata.append(term, definition); });
    all("[data-private-action]", $("#details-dialog")).forEach(section => { section.hidden = asset.public; });
    updatePublicLink(asset.shareSlug ? new URL(`/s/${encodeURIComponent(asset.shareSlug)}`, location.origin).href : "");
    clearTimeout(indexingTimer);
    $("#asset-tag-form").reset();
    $("#asset-tag-error").hidden = true;
    $("#asset-tags").textContent = "Loading tags…";
    $("#existing-tags").replaceChildren();
    $("#asset-indexing-status").textContent = "Checking search availability…";
    $("#retry-indexing").hidden = true;
    if (!asset.public) {
      loadAssetTags(asset).catch(error => { if (detailsAsset === asset) $("#asset-tags").textContent = error.message; });
      loadIndexing(asset);
    }
    openDialog("details-dialog");
  }
  function renderAssetTags(asset, tags) {
    if (detailsAsset !== asset) return;
    const list = $("#asset-tags");
    list.replaceChildren();
    if (!tags.length) { list.textContent = "No tags yet."; return; }
    tags.forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      const name = document.createElement("span");
      name.textContent = tag.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove tag ${tag.name}`);
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          await api(`/api/assets/${encodeURIComponent(asset.id)}/tags`, jsonOptions("DELETE", { tagIds: [tag.id] }));
          const data = await api(`/api/assets/${encodeURIComponent(asset.id)}/tags`);
          renderAssetTags(asset, data.tags);
          announce("Tag removed.");
        } catch (error) { notify(error.message); remove.disabled = false; }
      });
      chip.append(name, remove);
      list.append(chip);
    });
  }
  async function loadAssetTags(asset) {
    const [attached, available] = await Promise.all([api(`/api/assets/${encodeURIComponent(asset.id)}/tags`), api("/api/tags")]);
    if (detailsAsset !== asset) return;
    if (!Array.isArray(attached.tags) || !Array.isArray(available.tags)) throw new Error("Sploot could not read this meme’s tags.");
    renderAssetTags(asset, attached.tags);
    const list = $("#existing-tags");
    list.replaceChildren();
    available.tags.forEach(tag => { const option = document.createElement("option"); option.value = tag.name; list.append(option); });
  }
  async function addAssetTag(form) {
    const asset = detailsAsset;
    if (!asset || asset.public) return;
    const name = $("#asset-tag-name").value.trim();
    if (!name) return;
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    submit.disabled = true;
    $("#asset-tag-error").hidden = true;
    try {
      const data = await api(`/api/assets/${encodeURIComponent(asset.id)}/tags`, jsonOptions("POST", { tagNames: [name] }));
      if (detailsAsset !== asset) return;
      if (!Array.isArray(data.tags)) throw new Error("Tag changes were not confirmed. Reopen Details to check.");
      renderAssetTags(asset, data.tags);
      form.reset();
      $("#asset-tag-name").focus();
      announce("Tag added.");
    } catch (error) { if (detailsAsset === asset) showFormError($("#asset-tag-error"), error.message); }
    finally { submit.disabled = false; }
  }
  async function loadIndexing(asset) {
    clearTimeout(indexingTimer);
    try {
      const data = await api(`/api/assets/${encodeURIComponent(asset.id)}/embedding-status`);
      if (detailsAsset !== asset || !$("#details-dialog").open) return;
      const messages = { ready: "Ready to find with a description.", pending: "Waiting for local search indexing. The original is saved.", processing: "Indexing on this Sploot server. The original is saved.", failed: "Search indexing failed. The original is safe; retry to make it searchable." };
      $("#asset-indexing-status").textContent = messages[data.status] || "Search status is unavailable. Reopen Details to check again.";
      if (data.status === "failed" && data.error) $("#asset-indexing-status").textContent += ` ${data.error}`;
      $("#retry-indexing").hidden = data.status !== "failed";
      if ((data.status === "pending" || data.status === "processing") && !document.hidden) indexingTimer = setTimeout(() => loadIndexing(asset), 3000);
    } catch (error) { if (detailsAsset === asset) $("#asset-indexing-status").textContent = error.message; }
  }
  async function retryIndexing() {
    const asset = detailsAsset;
    if (!asset || asset.public) return;
    await api(`/api/assets/${encodeURIComponent(asset.id)}/generate-embedding`, { method: "POST" });
    await loadIndexing(asset);
  }
  function updatePublicLink(value) {
    $("#public-link").value = value;
    $("#public-link-output").hidden = !value;
    $("#create-public-link").hidden = !!value;
  }
  async function changePublicLink(revoke) {
    const asset = detailsAsset;
    if (!asset || asset.public) return;
    const data = await api(`/api/assets/${encodeURIComponent(asset.id)}/share`, { method: revoke ? "DELETE" : "POST" });
    if (!revoke && (!data.shareUrl || !data.shareSlug)) throw new Error("Sploot did not return a public link.");
    asset.shareSlug = revoke ? "" : data.shareSlug;
    if (asset.card) asset.card.dataset.shareSlug = asset.shareSlug;
    updatePublicLink(revoke ? "" : data.shareUrl);
    announce(revoke ? "Public link revoked." : "Public link created. Anyone with it can view this meme.");
  }
  async function deleteAsset() {
    const asset = detailsAsset;
    if (!asset || asset.public || !confirm(`Move “${asset.filename}” to trash?`)) return;
    await api(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
    const card = asset.card;
    const parent = card?.parentNode;
    const sibling = card?.nextSibling;
    card?.remove();
    $("#details-dialog").close();
    if ($("#viewer").open && viewerAsset?.id === asset.id) $("#viewer").close();
    notify("Moved to trash.", "Undo", async () => {
      const data = await api(`/api/assets/${encodeURIComponent(asset.id)}/restore`, { method: "POST" });
      if (parent?.isConnected && card && (page().favorite !== "true" || asset.favorite)) parent.insertBefore(card, sibling?.parentNode === parent ? sibling : $("#load-more", parent));
      if (data.asset) Object.assign(asset, normalizeAsset(data.asset));
      bindMedia();
      notify("Restored to your library.", "View", () => showViewer(asset));
    });
  }

  function formatBytes(size) {
    if (!Number.isFinite(size)) return "Unavailable";
    if (size < 1000) return `${size} B`;
    const units = ["kB", "MB", "GB", "TB"];
    for (const unit of units) { size /= 1000; if (size < 1000 || unit === "TB") return `${size.toFixed(1)} ${unit}`; }
  }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  async function captureOwner() {
    const identity = page().userId;
    if (!identity) throw new Error("Sign in before saving. Pending captures stay on this device under their original account.");
    return window.SplootUploadStore.ownerKey(identity);
  }
  function uploadReceipt(job, message) {
    const receipt = document.createElement("li");
    receipt.className = "receipt";
    receipt.dataset.status = "queued";
    const title = document.createElement("strong");
    title.textContent = job.file?.name || job.record?.filename || job.url;
    const status = document.createElement("span");
    status.textContent = message;
    receipt.append(title, status);
    $("#upload-receipts").prepend(receipt);
    $(".receipt-section").hidden = false;
    job.receipt = receipt;
    job.status = status;
  }
  function validateUploadFile(file) {
    const input = $("#upload-files");
    if (file.size <= 0) throw new Error("This file is empty. Choose the original image or video.");
    if (file.size > Number(input.dataset.maxBytes)) throw new Error(`This file exceeds the ${formatBytes(Number(input.dataset.maxBytes))} limit.`);
    if (file.type && !input.accept.split(",").includes(file.type)) throw new Error("This file format is not supported. Choose an allowed image, GIF, or video.");
  }
  function pendingActions(job) {
    all("button", job.receipt).forEach(button => button.remove());
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => {
      all("button", job.receipt).forEach(button => button.remove());
      if (job.record) { uploadQueue.push(job); drainUploads(); }
      else persistUpload(job);
    }, { once: true });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button";
    remove.textContent = "Remove pending capture";
    remove.addEventListener("click", async () => {
      if (!confirm("Remove this pending capture from this browser? This does not delete a meme already saved to your library.")) return;
      remove.disabled = true;
      try {
        if (job.record) await window.SplootUploadStore.remove(job.record);
        job.file = null;
        job.receipt.remove();
        captureJobs.delete(job.key);
        announce("Pending capture removed from this device.");
      } catch (error) { job.status.textContent = error.message; remove.disabled = false; }
    });
    job.receipt.append(retry, remove);
  }
  function persistUpload(job) {
    job.receipt.dataset.status = "queued";
    job.status.textContent = "Keeping this capture on your device…";
    capturePersistence = capturePersistence.then(async () => {
      try {
        const ownerKey = await captureOwner();
        if (job.owner !== page().userId) throw new Error("Your account changed. Sign in to the original account before retrying.");
        if (job.file) validateUploadFile(job.file);
        job.record = await window.SplootUploadStore.add(job, ownerKey, job.key);
        job.file = null;
        job.status.textContent = "Kept on this device. Waiting to save…";
        uploadQueue.push(job);
        drainUploads();
      } catch (error) {
        job.receipt.dataset.status = "failed";
        job.status.textContent = `${error.message} This capture has not been sent. Keep this page open until it can be stored, or keep the original file.`;
        pendingActions(job);
        announce(job.status.textContent);
      }
    });
  }
  function enqueueUpload(input) {
    if (captureSessionEnded || !page().userId || page().uploadsEnabled !== "true") { notify("Sign in to an active account before saving."); return; }
    if ($("#upload-files").disabled || !crypto.subtle || typeof crypto.randomUUID !== "function") { notify("Durable capture needs browser storage and a secure connection. Use HTTPS, or the loopback address on this device."); return; }
    const job = { ...input, key: crypto.randomUUID(), owner: page().userId };
    captureJobs.set(job.key, job);
    uploadReceipt(job, "Keeping this capture on your device…");
    openDialog("upload-dialog");
    persistUpload(job);
  }
  async function recoverUploads() {
    const owner = await captureOwner();
    if (captureRecoveryOwner === owner) return;
    const pending = await window.SplootUploadStore.list(owner);
    captureRecoveryOwner = owner;
    let recovered = 0;
    for (const record of pending.records) {
      if (captureJobs.has(record.id)) continue;
      const job = { key: record.id, owner: page().userId, record, url: record.sourceUrl };
      captureJobs.set(job.key, job);
      uploadReceipt(job, record.error || "Not yet confirmed saved. The original capture is still on this device. Retry checks the same save.");
      job.receipt.dataset.status = record.status === "failed" || record.status === "terminal" ? "failed" : "queued";
      pendingActions(job);
      recovered++;
    }
    if (recovered) notify(`${recovered} pending ${recovered === 1 ? "capture is" : "captures are"} still on this device.`, "Review saves", () => openDialog("upload-dialog"));
    if (pending.unassignedCount) notify("Older captures without an account assignment are still on this device. They have not been uploaded to this account. Do not clear browser data until they are recovered.");
  }
  async function runUpload(job) {
    await authReady;
    if (captureSessionEnded) throw new Error("Your session ended. Sign in again to retry this pending capture.");
    if (page().uploadsEnabled !== "true") throw new Error("Saving is currently unavailable. This capture remains on your device.");
    if (job.owner !== page().userId) throw new Error("Your account changed. Sign in to the original account before retrying.");
    const owner = await captureOwner();
    if (owner !== job.record.ownerKey) throw new Error("This capture belongs to a different account. Its original bytes have not been changed.");
    captureTab ||= crypto.randomUUID();
    job.claim = await window.SplootUploadStore.claim(job.key, owner, captureTab);
    job.record = job.claim;
    if (job.claim.intent !== "url") {
      job.file = await window.SplootUploadStore.file(job.claim);
      validateUploadFile(job.file);
    } else job.url = job.claim.sourceUrl;
    const input = $("#upload-files");
    const controller = new AbortController();
    activeUploadController = controller;
    const timer = setTimeout(() => controller.abort(), Number(input.dataset.timeout));
    const options = { method: "POST", signal: controller.signal, headers: { "Idempotency-Key": job.key } };
    let endpoint;
    if (job.file) { endpoint = "/api/upload"; const form = new FormData(); form.append("file", job.file); options.body = form; }
    else { endpoint = "/api/upload/url"; options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify({ url: job.url }); }
    try {
      const response = await request(endpoint, options);
      const data = await responseData(response);
      if (response.status === 409 && data.success === true && data.isDuplicate === true && data.asset?.id) return { status: "duplicate", asset: data.asset };
      if (response.status === 201 && data.success === true && data.isDuplicate !== true && data.asset?.id) return { status: "saved", asset: data.asset };
      throw new Error(typeof data.error === "string" ? data.error : data.code === "UPLOAD_IN_PROGRESS" ? "This save is still processing. Retry shortly to check the same save." : `Save was not confirmed (${response.status}). Retry to check the same save.`);
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Save not confirmed. The connection timed out or your session ended. Retry checks the same save without adding a second copy.");
      throw error;
    } finally { clearTimeout(timer); activeUploadController = null; }
  }
  async function drainUploads() {
    if (uploadRunning) return;
    uploadRunning = true;
    try {
      while (uploadQueue.length) {
        const job = uploadQueue.shift();
        job.receipt.dataset.status = "saving";
        job.status.textContent = "Saving the original. A recovery copy remains on this device…";
        try {
          const result = await runUpload(job);
          let localWarning = "";
          try { await window.SplootUploadStore.finish(job.claim); }
          catch { localWarning = " The pending device record could not be cleared; retrying it will check for the same saved file."; }
          job.receipt.dataset.status = result.status;
          job.status.textContent = (result.status === "saved" ? "Saved to your library. Search indexing may take a moment." : "Already in your library. No second copy was saved.") + localWarning;
          const view = document.createElement("button");
          view.className = "button";
          view.type = "button";
          view.textContent = "View meme";
          view.addEventListener("click", async () => {
            try { const asset = await getAsset(result.asset.id); $("#upload-dialog").close(); showViewer(asset); }
            catch (error) { job.status.textContent = error.message; }
          });
          job.receipt.append(view);
          announce(`${result.status === "saved" ? "Saved" : "Already saved"}: ${result.asset.filename}`);
        } catch (error) {
          let localWarning = "";
          if (job.claim) {
            try { job.record = await window.SplootUploadStore.finish(job.claim, error.message || "Saving failed without confirmation."); }
            catch { localWarning = " The pending device record was left intact; another live request may still own it."; }
          }
          job.receipt.dataset.status = "failed";
          job.status.textContent = `${error.message} The capture remains on this device.${localWarning}`;
          pendingActions(job);
          announce(`Save failed: ${error.message}`);
        } finally { job.file = null; job.claim = null; }
      }
    } finally { uploadRunning = false; }
  }

  async function loadTokens(version = generation) {
    const data = await api("/api/upload-tokens");
    if (version !== generation || !$("#token-list")) return;
    if (!Array.isArray(data.tokens)) throw new Error("Sploot could not read your tokens.");
    const list = $("#token-list");
    list.replaceChildren();
    if (!data.tokens.length) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "No active tokens. Create one for a device or connection."; list.append(empty); }
    data.tokens.forEach(token => {
      const row = document.createElement("div");
      row.className = "token-row";
      const detail = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = token.name;
      const description = document.createElement("p");
      description.textContent = `Prefix ${token.prefix}…; created ${formatDate(token.createdAt)}. ${token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}.` : "Not used yet."}`;
      detail.append(name, description);
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "button";
      revoke.textContent = "Revoke";
      revoke.setAttribute("aria-label", `Revoke ${token.name}`);
      revoke.addEventListener("click", async () => {
        if (!confirm(`Revoke “${token.name}”? That connection will no longer be able to save or search.`)) return;
        revoke.disabled = true;
        try { await api(`/api/upload-tokens/${encodeURIComponent(token.id)}`, { method: "DELETE" }); row.remove(); announce("Token revoked."); if (!list.children.length) await loadTokens(); }
        catch (error) { notify(error.message); revoke.disabled = false; }
      });
      row.append(detail, revoke);
      list.append(row);
    });
  }
  async function loadStats(version) {
    const stats = await api("/api/stats");
    if (version !== generation || !$("#library-stats")) return;
    if (!Number.isFinite(stats.assetCount) || !Number.isFinite(stats.storageBytes) || !Number.isFinite(stats.trashStorageBytes)) throw new Error("Sploot could not read your library details.");
    const root = $("#library-stats");
    root.replaceChildren();
    const count = document.createElement("p");
    count.textContent = `${stats.assetCount.toLocaleString()} saved ${stats.assetCount === 1 ? "meme" : "memes"}`;
    const storage = document.createElement("p");
    storage.className = "help-text";
    storage.textContent = `${formatBytes(stats.storageBytes)} used, including ${formatBytes(stats.trashStorageBytes)} in trash. Storage includes originals and previews.`;
    root.append(count, storage);
  }
  function loadSettings(version) {
    loadDevices(version).catch(error => { if (version === generation && $("#device-list")) $("#device-list").textContent = error.message; });
    loadTrash(false, version).catch(error => { if (version === generation && $("#trash-list")) $("#trash-list").textContent = error.message; });
    loadTokens(version).catch(error => { if (version === generation && $("#token-list")) $("#token-list").textContent = error.message; });
    loadStats(version).catch(error => { if (version === generation && $("#library-stats")) $("#library-stats").textContent = error.message; });
  }
  async function createToken(form) {
    const errorOutput = $("#token-error");
    errorOutput.hidden = true;
    if (!$("#new-token").hidden) { errorOutput.textContent = "Save the token already shown before creating another."; errorOutput.hidden = false; return; }
    const submit = $("button[type='submit']", form);
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const data = await api("/api/upload-tokens", jsonOptions("POST", { name: $("#token-name").value.trim() }));
      if (!data.token) throw new Error("Sploot did not return a token. Check the token list before creating another.");
      if (!form.isConnected) { notify("A token was created. Revoke it in Settings and create another if you did not copy it."); return; }
      $("#new-token-value").value = data.token;
      $("#new-token").hidden = false;
      $("#new-token-value").focus();
      $("#new-token-value").select();
      form.reset();
      await loadTokens();
    } catch (error) { errorOutput.textContent = error.message; errorOutput.hidden = false; }
    finally { submit.disabled = false; }
  }
  async function copyText(input, success) {
    if (!navigator.clipboard?.writeText) { input.focus(); input.select(); announce("Select and copy this value using your device's Copy command."); return; }
    try { await navigator.clipboard.writeText(input.value); announce(success); }
    catch { input.focus(); input.select(); announce("Clipboard permission was denied. Use your device's Copy command on the selected value."); }
  }

  document.addEventListener("click", async event => {
    const close = event.target.closest("[data-close]");
    if (close) { document.getElementById(close.dataset.close).close(); return; }
    const control = event.target.closest("[data-action]");
    if (!control || control.disabled) return;
    const action = control.dataset.action;
    event.preventDefault();
    const card = control.closest(".media-card");
    const asset = card ? assets.get(card.dataset.assetId) : viewerAsset;
    try {
      switch (action) {
        case "upload": if (page().uploadsEnabled === "true") openDialog("upload-dialog"); break;
        case "review-pending": openDialog("upload-dialog"); break;
        case "open": if (asset) showViewer(asset); break;
        case "favorite": await toggleFavorite(asset); break;
        case "sound": toggleSound(asset); break;
        case "share": await prepareShare(asset); break;
        case "details": if (asset) showDetails(asset); break;
        case "previous": stepMedia(-1); break;
        case "next": stepMedia(1); break;
        case "zoom": toggleZoom(); break;
        case "focus-search": $("#search-input")?.focus(); break;
        case "shuffle": {
          rememberPosition();
          const random = new Uint32Array(1);
          crypto.getRandomValues(random);
          const url = new URL("/app", location.origin);
          url.searchParams.set("seed", String(random[0] % 1000001));
          if (page().favorite === "true") url.searchParams.set("favorite", "true");
          location.assign(url);
          break;
        }
        case "create-public-link": control.disabled = true; try { await changePublicLink(false); } finally { control.disabled = false; } break;
        case "revoke-public-link": control.disabled = true; try { await changePublicLink(true); } finally { control.disabled = false; } break;
        case "copy-public-link": await copyText($("#public-link"), "Public link copied."); break;
        case "delete": control.disabled = true; try { await deleteAsset(); } finally { control.disabled = false; } break;
        case "copy-token": await copyText($("#new-token-value"), "Token copied. Keep it private."); break;
        case "dismiss-token": $("#new-token-value").value = ""; $("#new-token").hidden = true; $("#token-name").focus(); break;
        case "sign-out": await signOut(); break;
        case "switch-account": await signOut(true); break;
        case "approve-device": await approveDevice(true); break;
        case "deny-device": await approveDevice(false); break;
        case "load-trash": control.disabled = true; try { await loadTrash(true); } finally { control.disabled = false; } break;
        case "retry-indexing": control.disabled = true; try { await retryIndexing(); } finally { control.disabled = false; } break;
      }
    } catch (error) { notify(error.message); }
  });
  $("#native-share").addEventListener("click", async () => {
    if (!sharedFile) return;
    try { await navigator.share({ files: [sharedFile] }); $("#share-status").textContent = "File handed to your sharing app."; }
    catch (error) { if (error.name !== "AbortError") $("#share-status").textContent = "The sharing app could not accept this file. Download the original and attach it instead."; }
  });
  $("#copy-media").addEventListener("click", async () => {
    if (!sharedFile) return;
    try { await navigator.clipboard.write([new ClipboardItem({ [sharedFile.type]: sharedFile })]); $("#share-status").textContent = "Image copied."; }
    catch { $("#share-status").textContent = "Clipboard access was denied or this format cannot be copied. Share or download the original instead."; }
  });
  $("#download-media").addEventListener("click", () => { $("#share-status").textContent = "Download requested. Choose where to save the original on your device."; });
  $("#share-dialog").addEventListener("close", () => {
    shareController?.abort();
    sharedFile = null;
    if (sharedObjectURL) URL.revokeObjectURL(sharedObjectURL);
    sharedObjectURL = null;
    chooseVisibleVideo();
  });
  $("#viewer").addEventListener("close", () => {
    const viewer = $("#viewer");
    releaseViewerVideo();
    $("#viewer-stage").replaceChildren();
    if (viewer.dataset.history === "true" && history.state?.splootViewer) history.back();
    else if (location.hash.startsWith("#asset=") || new URLSearchParams(location.search).has("asset")) {
      const url = new URL(location.href);
      url.hash = "";
      url.searchParams.delete("asset");
      history.replaceState(history.state, "", url);
      currentRoute = routeKey();
    }
    viewerAsset?.card?.focus({ preventScroll: true });
    viewerAsset = null;
    chooseVisibleVideo();
  });
  ["upload-dialog", "details-dialog"].forEach(id => document.getElementById(id).addEventListener("close", chooseVisibleVideo));
  $("#details-dialog").addEventListener("close", () => { clearTimeout(indexingTimer); detailsAsset = null; });
  document.addEventListener("submit", event => {
    if (event.target.id === "url-save-form") { event.preventDefault(); const url = $("#save-url").value.trim(); if (url) enqueueUpload({ url }); }
    if (event.target.id === "token-create-form") { event.preventDefault(); createToken(event.target); }
    if (event.target.id === "auth-form") { event.preventDefault(); submitAuth(event.target); }
    if (event.target.id === "claim-form") { event.preventDefault(); submitClaim(event.target); }
    if (event.target.id === "password-change-form") { event.preventDefault(); changePassword(event.target); }
    if (event.target.id === "device-code-form") { event.preventDefault(); checkDeviceCode(event.target); }
    if (event.target.id === "asset-tag-form") { event.preventDefault(); addAssetTag(event.target); }
  });
  $("#upload-files").addEventListener("change", event => { [...event.target.files].forEach(file => enqueueUpload({ file })); event.target.value = ""; });
  document.addEventListener("change", event => {
    if (event.target.id === "autoplay-setting") { storageSet(localStorage, "sploot:autoplay", String(event.target.checked)); if (!event.target.checked) pauseAllVideos(); else chooseVisibleVideo(); }
    if (event.target.matches("[data-show-password]")) {
      const input = document.getElementById(event.target.dataset.showPassword);
      if (input) input.type = event.target.checked ? "text" : "password";
    }
  });
  document.addEventListener("paste", event => {
    if (event.target.closest("input, textarea, [contenteditable='true']") || page().uploadsEnabled !== "true" || captureSessionEnded || !page().userId) return;
    const files = [...(event.clipboardData?.files || [])];
    if (files.length) { event.preventDefault(); files.forEach(file => enqueueUpload({ file })); return; }
    const text = event.clipboardData?.getData("text/plain").trim();
    if (/^https?:\/\/\S+$/i.test(text || "")) { event.preventDefault(); enqueueUpload({ url: text }); }
  });
  let dragDepth = 0;
  document.addEventListener("dragenter", event => { if (page().userId && !captureSessionEnded && page().uploadsEnabled === "true" && [...(event.dataTransfer?.types || [])].includes("Files")) { event.preventDefault(); dragDepth++; $("#drop-target").hidden = false; } });
  document.addEventListener("dragover", event => { if (dragDepth) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
  document.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#drop-target").hidden = true; });
  document.addEventListener("drop", event => { if (!dragDepth) return; event.preventDefault(); dragDepth = 0; $("#drop-target").hidden = true; [...(event.dataTransfer?.files || [])].forEach(file => enqueueUpload({ file })); });
  document.addEventListener("keydown", event => {
    if (captureSessionEnded || event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.target.closest("button, a") && (!$("#viewer").open || ["Enter", " "].includes(event.key))) return;
    if ($("dialog[open]:not(#viewer)")) return;
    const asset = $("#viewer").open ? viewerAsset : assets.get(visibleCard()?.dataset.assetId);
    if (event.key === "/" && !$("#viewer").open) { event.preventDefault(); $("#search-input")?.focus(); }
    else if (["j", "ArrowDown", "ArrowRight"].includes(event.key)) { event.preventDefault(); stepMedia(1); }
    else if (["k", "ArrowUp", "ArrowLeft"].includes(event.key)) { event.preventDefault(); stepMedia(-1); }
    else if (event.key.toLowerCase() === "f" && asset) { event.preventDefault(); toggleFavorite(asset).catch(error => notify(error.message)); }
    else if (event.key === "Enter" && asset) { event.preventDefault(); showViewer(asset); }
  });
  document.addEventListener("error", event => {
    const media = event.target.closest?.(".original-media");
    if (media) { const error = $(".media-error", media.closest(".media-stage")); if (error) error.hidden = false; }
  }, true);
  // Mobile caret scrolling must not replace the browse anchor while editing.
  document.addEventListener("focusin", event => {
    if (event.target.closest("[data-search-form]") && !event.relatedTarget?.closest?.("[data-search-form]")) rememberPosition(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { rememberPosition(); pauseAllVideos(); clearTimeout(indexingTimer); }
    else { initializeAuth(); chooseVisibleVideo(); if (detailsAsset && $("#details-dialog").open) loadIndexing(detailsAsset); }
  });
  reducedMotion.addEventListener("change", () => { if (!autoplayEnabled()) pauseAllVideos(); else chooseVisibleVideo(); });
  window.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(rememberPosition, 160); }, { passive: true });
  window.addEventListener("pagehide", () => { rememberPosition(); const token = $("#new-token-value"); if (token) token.value = ""; });
  window.addEventListener("pageshow", event => { if (event.persisted) { resetMedia(); initializeAuth(); } });
  window.addEventListener("storage", event => { if (event.key === "sploot:session-change") initializeAuth(); });
  window.addEventListener("beforeunload", event => {
    if ([...captureJobs.values()].some(job => job.file && !job.record)) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("popstate", () => {
    if ($("#viewer").open && !location.hash.startsWith("#asset=")) { $("#viewer").dataset.history = "false"; $("#viewer").close(); }
    else if (location.hash.startsWith("#asset=")) getAsset(decodeURIComponent(location.hash.slice(7))).then(asset => showViewer(asset, false)).catch(error => notify(error.message));
  });
  document.addEventListener("htmx:confirm", event => {
    if (!page().userId) return;
    event.preventDefault();
    authReady.then(async () => {
      if (!event.detail.elt.isConnected) return;
      if (new URL(event.detail.path, location.origin).origin !== location.origin) throw new Error("This action must stay on Sploot.");
      if (captureSessionEnded) throw new Error("Sign in again before continuing.");
      event.detail.issueRequest(true);
    }).catch(error => notify(error.message || "Your session could not be checked. Check your connection."));
  });
  document.addEventListener("htmx:configRequest", event => {
    if (page().userId) event.detail.headers["X-Sploot-User-ID"] = page().userId;
  });
  document.addEventListener("htmx:beforeSwap", event => {
    if (event.detail.xhr.status === 409) {
      try {
        if (JSON.parse(event.detail.serverResponse).code === "ACCOUNT_CHANGED") { event.detail.shouldSwap = false; event.detail.isError = false; sessionExpired(true); return; }
      } catch { /* A non-account conflict follows the normal page error path. */ }
    }
    const responseURL = event.detail.xhr.responseURL;
    if (responseURL && new URL(responseURL).pathname === "/sign-in") {
      event.detail.shouldSwap = false;
      location.assign(responseURL);
      return;
    }
    if (event.detail.target?.id === "shell" && event.detail.xhr.status >= 400 && event.detail.xhr.getResponseHeader("Content-Type")?.includes("text/html")) {
      const response = new DOMParser().parseFromString(event.detail.serverResponse, "text/html");
      if (response.querySelector("#shell")) { event.detail.shouldSwap = true; event.detail.isError = false; }
    }
  });
  document.addEventListener("htmx:beforeRequest", event => {
    if (restoring && event.detail.target?.id === "load-more") { event.preventDefault(); return; }
    if (event.detail.target?.id === "shell") { rememberPosition(); const token = $("#new-token-value"); if (token) token.value = ""; pauseAllVideos(); $("#main")?.setAttribute("aria-busy", "true"); }
  });
  document.addEventListener("htmx:afterSwap", event => {
    if (event.detail.target?.id === "shell") { initializePage().catch(error => notify(error.message)); $("#main")?.focus({ preventScroll: true }); }
    else { bindMedia(); rememberPosition(); }
  });
  document.addEventListener("htmx:historyRestore", () => { initializePage().catch(error => notify(error.message)); });
  document.addEventListener("htmx:historyCacheMissLoadError", event => {
    if (event.detail.xhr.status === 401) sessionExpired();
    else notify("Your previous page could not load. Reload to try again.");
  });
  document.addEventListener("htmx:responseError", event => {
    $("#main")?.removeAttribute("aria-busy");
    if (event.detail.xhr.status === 401) { sessionExpired(); return; }
    const error = $("#load-more .load-error");
    if (event.detail.target?.id === "load-more" && error) error.hidden = false;
    else notify("This page could not load. Your library has not changed. Try again.");
  });
  document.addEventListener("htmx:sendError", () => { $("#main")?.removeAttribute("aria-busy"); notify("Could not connect to Sploot. Check your connection and try again."); });

  authReady = initializeAuth();
  initializePage().catch(error => notify(error.message));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  const shareReceipt = new URLSearchParams(location.search);
  if (shareReceipt.has("shared")) {
    const saved = Math.max(0, Number(shareReceipt.get("shared")) || 0);
    const duplicates = Math.max(0, Number(shareReceipt.get("duplicates")) || 0);
    const failed = Math.max(0, Number(shareReceipt.get("failed")) || 0);
    notify(`${saved} saved. ${duplicates} already saved.${failed ? ` ${failed} could not be saved; share those files again.` : ""}`);
  }
})();
