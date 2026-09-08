(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const assets = new Map();
  const observedVideos = new Set();
  const videoRatios = new Map();
  const systemPauses = new WeakSet();
  const htmxTokens = new WeakMap();
  let mediaObserver;
  let clerk;
  let clerkUserID;
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
  function sessionExpired() {
    captureSessionEnded = true;
    pauseAllVideos();
    activeUploadController?.abort();
    sessionNotice("Your session ended. Sign in again to keep using your library.", true);
  }
  async function request(path, options = {}, refreshed = false) {
    await authReady;
    const target = new URL(path, location.origin);
    if (target.origin !== location.origin) throw new Error("This action must stay on Sploot.");
    const headers = new Headers(options.headers);
    if (clerk?.session) {
      const token = await clerk.session.getToken(refreshed ? { skipCache: true } : {});
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(target, { ...options, headers, credentials: "same-origin" });
    if (response.status === 401 && !refreshed && clerk?.session) return request(path, options, true);
    if (response.status === 401) sessionExpired();
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
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `The request failed (${response.status}). Try again.`);
    return data;
  }
  function jsonOptions(method, body) {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  function loadScript(src, publishableKey) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.crossOrigin = "anonymous";
      if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Secure sign-in could not load. Check your connection and try again."));
      document.head.append(script);
    });
  }
  async function initializeAuth() {
    const key = $("meta[name='clerk-publishable-key']")?.content;
    const state = page();
    const signInStatus = $("#sign-in-status");
    if (state.userId && state.authMethod.startsWith("qa")) {
      if (signInStatus) signInStatus.textContent = "This is a local verification session.";
      return;
    }
    if (!key) {
      if (signInStatus) {
        signInStatus.textContent = "Sign-in is not configured on this server. Your existing library has not changed.";
        $("#retry-sign-in").hidden = false;
      }
      return;
    }
    if (state.userId) sessionNotice("Checking your session…");
    try {
      const domain = atob(key.split("_")[2]).replace(/\$$/, "");
      if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) || !domain.includes(".")) throw new Error("The sign-in configuration is invalid.");
      await Promise.all([
        loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`),
        loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, key),
      ]);
      clerk = window.Clerk;
      await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor }, signInUrl: "/sign-in", signInFallbackRedirectUrl: "/app" });
      clerkUserID = clerk.user?.id;
      if (clerk.session) {
        await clerk.session.getToken();
        sessionNotice("");
        if (signInStatus) {
          signInStatus.textContent = "Opening your library…";
          location.replace(safeReturnURL(new URLSearchParams(location.search).get("redirect_url") || state.returnUrl));
          return;
        }
      } else if (signInStatus) {
        signInStatus.textContent = "";
        clerk.mountSignIn($("#clerk-sign-in"), { routing: "hash", forceRedirectUrl: safeReturnURL(new URLSearchParams(location.search).get("redirect_url") || state.returnUrl) });
      } else if (state.userId) {
        sessionExpired();
      }
      clerk.addListener(({ session, user }) => {
        if (clerkUserID && user && user.id !== clerkUserID) {
          activeUploadController?.abort();
          location.replace("/app");
          return;
        }
        if (!session && page().userId) sessionExpired();
        updateAccountControls();
      });
      updateAccountControls();
    } catch (error) {
      if (signInStatus) {
        signInStatus.textContent = error.message;
        $("#retry-sign-in").hidden = false;
      } else sessionNotice("Session refresh is unavailable. Check your connection before saving.");
    }
  }
  function updateAccountControls() {
    const label = $("[data-account-label]");
    if (label && clerk?.user) label.textContent = clerk.user.primaryEmailAddress?.emailAddress || clerk.user.fullName || "Signed in to your library.";
    all("[data-action='sign-out'], [data-action='manage-account']").forEach(button => { button.hidden = !clerk?.session; });
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
    if (document.hidden || $("dialog[open]:not(#viewer)")) { pauseAllVideos(); return; }
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
    if (currentOwner) recoverUploads().catch(error => notify(error.message, "Retry", () => recoverUploads()));
    if ($("#feed") && currentOwner && storageGet(sessionStorage, positionKey())) await restorePosition(version);
    else if (previousRoute !== currentRoute) window.scrollTo({ top: 0, behavior: "instant" });
    if (version !== generation) return;
    restoring = false;
    if (page().uploadsEnabled !== "true") $("#upload-files").disabled = true;
    else $("#upload-files").disabled = false;
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
    openDialog("details-dialog");
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
    await authReady;
    const identity = clerk?.user?.id || (page().authMethod?.startsWith("qa") ? page().userId : null);
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
        job.clerkUser = clerk?.user?.id;
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
    if (!page().userId || page().uploadsEnabled !== "true") { notify("Saving is currently unavailable."); return; }
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
      const job = { key: record.id, owner: page().userId, clerkUser: clerk?.user?.id, record, url: record.sourceUrl };
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
    if (job.owner !== page().userId || (job.clerkUser && clerk?.user?.id !== job.clerkUser)) throw new Error("Your account changed. Sign in to the original account before retrying.");
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
    if (!Number.isFinite(stats.assetCount) || !Number.isFinite(stats.storageBytes) || !Number.isFinite(stats.storageLimitBytes)) throw new Error("Sploot could not read your library details.");
    const root = $("#library-stats");
    root.replaceChildren();
    const count = document.createElement("p");
    count.textContent = `${stats.assetCount.toLocaleString()} saved ${stats.assetCount === 1 ? "meme" : "memes"}`;
    const storage = document.createElement("p");
    storage.className = "help-text";
    storage.textContent = `${formatBytes(stats.storageBytes)} used of ${formatBytes(stats.storageLimitBytes)}. Storage includes originals, previews, and items in trash.`;
    const progress = document.createElement("progress");
    progress.className = "storage-meter";
    progress.max = Math.max(stats.storageLimitBytes, 1);
    progress.value = stats.storageBytes;
    progress.setAttribute("aria-label", "Library storage used");
    root.append(count, progress, storage);
  }
  function loadSettings(version) {
    loadTokens(version).catch(error => { if (version === generation && $("#token-list")) $("#token-list").textContent = error.message; });
    loadStats(version).catch(error => { if (version === generation && $("#library-stats")) $("#library-stats").textContent = error.message; });
  }
  async function createToken(form) {
    const errorOutput = $("#token-error");
    errorOutput.hidden = true;
    if (!$("#new-token").hidden) { errorOutput.textContent = "Save the token already shown before creating another."; errorOutput.hidden = false; return; }
    const submit = $("button[type='submit']", form);
    submit.disabled = true;
    try {
      const data = await api("/api/upload-tokens", jsonOptions("POST", { name: $("#token-name").value.trim() }));
      if (!data.token) throw new Error("Sploot did not return a token. Check the token list before creating another.");
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
        case "manage-account": clerk?.openUserProfile(); break;
        case "sign-out": rememberPosition(); captureSessionEnded = true; activeUploadController?.abort(); if (clerk) await clerk.signOut({ redirectUrl: "/sign-in" }); break;
        case "reload": location.reload(); break;
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
  document.addEventListener("submit", event => {
    if (event.target.id === "url-save-form") { event.preventDefault(); const url = $("#save-url").value.trim(); if (url) enqueueUpload({ url }); }
    if (event.target.id === "token-create-form") { event.preventDefault(); createToken(event.target); }
  });
  $("#upload-files").addEventListener("change", event => { [...event.target.files].forEach(file => enqueueUpload({ file })); event.target.value = ""; });
  document.addEventListener("change", event => {
    if (event.target.id === "autoplay-setting") { storageSet(localStorage, "sploot:autoplay", String(event.target.checked)); if (!event.target.checked) pauseAllVideos(); else chooseVisibleVideo(); }
  });
  document.addEventListener("paste", event => {
    if (event.target.closest("input, textarea, [contenteditable='true'], #clerk-sign-in") || page().uploadsEnabled !== "true") return;
    const files = [...(event.clipboardData?.files || [])];
    if (files.length) { event.preventDefault(); files.forEach(file => enqueueUpload({ file })); return; }
    const text = event.clipboardData?.getData("text/plain").trim();
    if (/^https?:\/\/\S+$/i.test(text || "")) { event.preventDefault(); enqueueUpload({ url: text }); }
  });
  let dragDepth = 0;
  document.addEventListener("dragenter", event => { if (page().uploadsEnabled === "true" && [...(event.dataTransfer?.types || [])].includes("Files")) { event.preventDefault(); dragDepth++; $("#drop-target").hidden = false; } });
  document.addEventListener("dragover", event => { if (dragDepth) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
  document.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#drop-target").hidden = true; });
  document.addEventListener("drop", event => { if (!dragDepth) return; event.preventDefault(); dragDepth = 0; $("#drop-target").hidden = true; [...(event.dataTransfer?.files || [])].forEach(file => enqueueUpload({ file })); });
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable='true'], #clerk-sign-in")) return;
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
  document.addEventListener("visibilitychange", () => { if (document.hidden) { rememberPosition(); pauseAllVideos(); } else { clerk?.session?.getToken().catch(() => sessionNotice("Session refresh is unavailable. Check your connection.")); chooseVisibleVideo(); } });
  reducedMotion.addEventListener("change", () => { if (!autoplayEnabled()) pauseAllVideos(); else chooseVisibleVideo(); });
  window.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(rememberPosition, 160); }, { passive: true });
  window.addEventListener("pagehide", () => { rememberPosition(); const token = $("#new-token-value"); if (token) token.value = ""; });
  window.addEventListener("pageshow", event => { if (event.persisted) { resetMedia(); updateAccountControls(); clerk?.session?.getToken().catch(() => sessionNotice("Session refresh is unavailable. Check your connection.")); } });
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
      if (clerk?.session) {
        const token = await clerk.session.getToken();
        if (token) htmxTokens.set(event.detail.elt, token);
      }
      event.detail.issueRequest(true);
    }).catch(error => notify(error.message || "Your session could not refresh. Check your connection."));
  });
  document.addEventListener("htmx:configRequest", event => {
    const token = htmxTokens.get(event.detail.elt);
    if (token) event.detail.headers.Authorization = `Bearer ${token}`;
    htmxTokens.delete(event.detail.elt);
  });
  document.addEventListener("htmx:beforeSwap", event => {
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
