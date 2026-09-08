(() => {
  "use strict";

  // This is the existing browser capture store, not a replacement database.
  // Keep its v4 metadata, split payloads, hashed Clerk partitions, and claim
  // fences compatible with a still-open legacy Sploot tab during cutover.
  const DATABASE = "sploot_uploads";
  const VERSION = 4;
  const METADATA = "pending_uploads";
  const PAYLOADS = "upload_payloads";
  const MAX_ENTRIES = 100;
  const MAX_BYTES = 250 * 1024 * 1024;
  const MAX_URL_LENGTH = 2048;
  const MAX_RETRIES = 3;
  const MAX_AGE = 24 * 60 * 60 * 1000;
  const LEASE = 2 * 60 * 1000;
  let connection;

  function open() {
    if (connection) return connection;
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("Durable capture storage is unavailable in this browser. Keep the original file and use a browser with storage enabled."));
    connection = new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(DATABASE, VERSION);
      request.onerror = () => { connection = null; reject(new Error("Durable capture storage could not open. Keep this page open and try again.")); };
      request.onblocked = () => { blocked = true; connection = null; reject(new Error("Another Sploot tab is blocking capture storage. Close that tab, then retry.")); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        const metadata = db.objectStoreNames.contains(METADATA) ? request.transaction.objectStore(METADATA) : db.createObjectStore(METADATA, { keyPath: "id" });
        for (const name of ["addedAt", "status", "claimExpiresAt", "ownerKey"]) {
          if (!metadata.indexNames.contains(name)) metadata.createIndex(name, name, { unique: false });
        }
        const payloads = db.objectStoreNames.contains(PAYLOADS) ? request.transaction.objectStore(PAYLOADS) : db.createObjectStore(PAYLOADS, { keyPath: "id" });
        const cursor = metadata.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return;
          const record = entry.value;
          let changed = false;
          if (record.fileData) { payloads.put({ id: record.id, fileData: record.fileData }); delete record.fileData; changed = true; }
          if (typeof record.claimGeneration !== "number") { record.claimGeneration = 0; changed = true; }
          if (changed) entry.update(record);
          entry.continue();
        };
      };
    });
    return connection;
  }

  async function transaction(stores, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error("Durable capture storage was interrupted. Your pending saves have not been discarded."));
      try { operation(tx, value => { result = value; }, error => { failure = error; tx.abort(); }); }
      catch (error) { failure = error; tx.abort(); }
    });
  }

  function assertOwner(ownerKey) {
    if (!/^account-[a-f0-9]{64}$/.test(ownerKey)) throw new Error("Sign in before accessing this device's pending saves.");
  }

  async function ownerKey(identity) {
    if (!identity || !crypto.subtle) throw new Error("Secure capture account partitioning is unavailable. Sign in and use HTTPS.");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sploot-upload-owner:v1:${identity}`));
    return `account-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  async function list(owner) {
    assertOwner(owner);
    return transaction(METADATA, "readonly", (tx, done) => {
      const records = [];
      let unassignedCount = 0;
      const cursor = tx.objectStore(METADATA).openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) { done({ records: records.sort((left, right) => left.addedAt - right.addedAt), unassignedCount }); return; }
        if (entry.value.ownerKey === owner) records.push(entry.value);
        else if (!entry.value.ownerKey) unassignedCount++;
        entry.continue();
      };
    });
  }

  async function add(input, owner, id) {
    assertOwner(owner);
    if (input.url && (!/^https?:\/\/\S+$/i.test(input.url) || input.url.length > MAX_URL_LENGTH)) throw new Error("Use a direct media URL no longer than 2,048 characters.");
    const now = Date.now();
    const record = {
      id, ownerKey: owner, intent: input.file ? "file" : "url",
      filename: input.file?.name || input.url, mimeType: input.file?.type || "", size: input.file?.size || 0,
      lastModified: input.file?.lastModified || now, addedAt: now, firstAddedAt: now, attemptStartedAt: now,
      status: "pending", retryCount: 0, claimGeneration: 0,
    };
    if (input.url) record.sourceUrl = input.url;
    const fileData = input.file ? await input.file.arrayBuffer() : null;
    return transaction([METADATA, PAYLOADS], "readwrite", (tx, done, fail) => {
      const store = tx.objectStore(METADATA);
      const existing = store.get(id);
      existing.onsuccess = () => {
        if (existing.result) {
          if (existing.result.ownerKey !== owner) { fail(new Error("This capture belongs to another account.")); return; }
          done(existing.result);
          return;
        }
        let count = 0;
        let bytes = 0;
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          if (cursor.result) { count++; bytes += Number(cursor.result.value.size) || 0; cursor.result.continue(); return; }
          if (count >= MAX_ENTRIES || bytes + record.size > MAX_BYTES) { fail(new Error("This device's capture queue is full (100 saves or 250 MiB). Finish or remove a pending save before adding another.")); return; }
          store.add(record);
          if (fileData) tx.objectStore(PAYLOADS).add({ id, fileData });
          done(record);
        };
      };
    });
  }

  async function claim(id, owner, tab) {
    assertOwner(owner);
    return transaction(METADATA, "readwrite", (tx, done, fail) => {
      const store = tx.objectStore(METADATA);
      const request = store.get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (!record || record.ownerKey !== owner) { fail(new Error("This pending save is no longer available on this device. It may have completed in another tab.")); return; }
        if (record.status === "uploading" && record.claimExpiresAt > Date.now()) { fail(new Error("Another tab or earlier request is still saving this file. Wait up to two minutes, then retry to check the same save.")); return; }
        // A retry is always an explicit user action in this interface. Preserve
        // firstAddedAt while renewing the existing retry/age window.
        if (record.status === "terminal" || record.retryCount >= MAX_RETRIES || (record.attemptStartedAt || record.addedAt) <= Date.now() - MAX_AGE) {
          record.retryCount = 0;
          record.attemptStartedAt = Date.now();
        }
        record.status = "uploading";
        record.claimOwner = tab;
        record.claimToken = crypto.randomUUID();
        record.claimGeneration = (record.claimGeneration || 0) + 1;
        record.claimExpiresAt = Date.now() + LEASE;
        delete record.error;
        store.put(record);
        done(record);
      };
    });
  }

  function ownsClaim(record, claim) {
    return record && record.ownerKey === claim.ownerKey && record.claimOwner === claim.claimOwner && record.claimGeneration === claim.claimGeneration && record.claimToken === claim.claimToken && record.claimExpiresAt > Date.now();
  }

  async function file(claim) {
    const bytes = await transaction([METADATA, PAYLOADS], "readonly", (tx, done, fail) => {
      const request = tx.objectStore(METADATA).get(claim.id);
      request.onsuccess = () => {
        if (!ownsClaim(request.result, claim)) { fail(new Error("Another attempt took ownership of this capture. Review pending saves before retrying.")); return; }
        const payload = tx.objectStore(PAYLOADS).get(claim.id);
        payload.onsuccess = () => {
          if (!payload.result?.fileData) { fail(new Error("This browser no longer has the original capture bytes. Keep the pending record, or choose the original file again.")); return; }
          done(payload.result.fileData);
        };
      };
    });
    return new File([bytes], claim.filename, { type: claim.mimeType, lastModified: claim.lastModified });
  }

  async function finish(claim, error) {
    return transaction([METADATA, PAYLOADS], "readwrite", (tx, done, fail) => {
      const store = tx.objectStore(METADATA);
      const request = store.get(claim.id);
      request.onsuccess = () => {
        const record = request.result;
        if (!ownsClaim(record, claim)) { fail(new Error("The capture claim changed. This device's pending record was left intact.")); return; }
        if (error === undefined) { store.delete(claim.id); tx.objectStore(PAYLOADS).delete(claim.id); done(null); return; }
        record.retryCount = (record.retryCount || 0) + 1;
        record.status = record.retryCount >= MAX_RETRIES || (record.attemptStartedAt || record.addedAt) <= Date.now() - MAX_AGE ? "terminal" : "failed";
        record.error = error;
        delete record.claimOwner;
        delete record.claimToken;
        delete record.claimExpiresAt;
        store.put(record);
        done(record);
      };
    });
  }

  async function remove(record) {
    assertOwner(record.ownerKey);
    return transaction([METADATA, PAYLOADS], "readwrite", (tx, done, fail) => {
      const store = tx.objectStore(METADATA);
      const request = store.get(record.id);
      request.onsuccess = () => {
        const current = request.result;
        if (!current) return;
        if (current.ownerKey !== record.ownerKey || current.claimGeneration !== record.claimGeneration) { fail(new Error("This capture changed in another tab. Reload before removing it.")); return; }
        if (current.status === "uploading" && current.claimExpiresAt > Date.now()) { fail(new Error("This capture is still being saved. Wait for the active request before removing it.")); return; }
        store.delete(record.id);
        tx.objectStore(PAYLOADS).delete(record.id);
        done(null);
      };
    });
  }

  window.SplootUploadStore = { ownerKey, list, add, claim, file, finish, remove };
})();
