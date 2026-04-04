/**
 * Chrome storage wrapper for settings, cache, and offline queue.
 */

/* global chrome */

const KEYS = {
    AUTH: 'dh_auth',
    SETTINGS: 'dh_settings',
    WORK_ITEMS_CACHE: 'dh_work_items',
    WORK_ITEMS_CACHE_TS: 'dh_work_items_ts',
    OFFLINE_QUEUE: 'dh_offline_queue',
    PENDING_SELECTION: 'dh_pending_selection'
};

// Cache TTL: 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Auth ──

export async function getAuth() {
    const result = await chrome.storage.local.get(KEYS.AUTH);
    return result[KEYS.AUTH] || null;
}

export async function saveAuth(auth) {
    await chrome.storage.local.set({ [KEYS.AUTH]: auth });
}

export async function clearAuth() {
    await chrome.storage.local.remove(KEYS.AUTH);
}

// ── Settings ──

export async function getSettings() {
    const result = await chrome.storage.local.get(KEYS.SETTINGS);
    return result[KEYS.SETTINGS] || { instanceUrl: '', orgAlias: '' };
}

export async function saveSettings(settings) {
    await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
}

// ── Work Items Cache ──

export async function getCachedWorkItems() {
    const result = await chrome.storage.local.get([
        KEYS.WORK_ITEMS_CACHE,
        KEYS.WORK_ITEMS_CACHE_TS
    ]);
    const items = result[KEYS.WORK_ITEMS_CACHE] || [];
    const ts = result[KEYS.WORK_ITEMS_CACHE_TS] || 0;

    return {
        items,
        timestamp: ts,
        isStale: Date.now() - ts > CACHE_TTL_MS
    };
}

export async function cacheWorkItems(items) {
    await chrome.storage.local.set({
        [KEYS.WORK_ITEMS_CACHE]: items,
        [KEYS.WORK_ITEMS_CACHE_TS]: Date.now()
    });
}

// ── Offline Queue ──

export async function getOfflineQueue() {
    const result = await chrome.storage.local.get(KEYS.OFFLINE_QUEUE);
    return result[KEYS.OFFLINE_QUEUE] || [];
}

export async function addToOfflineQueue(entry) {
    const queue = await getOfflineQueue();
    queue.push({ ...entry, timestamp: Date.now() });
    await chrome.storage.local.set({ [KEYS.OFFLINE_QUEUE]: queue });
}

export async function clearOfflineQueue() {
    await chrome.storage.local.set({ [KEYS.OFFLINE_QUEUE]: [] });
}

// ── Pending Selection (from context menu) ──

export async function getPendingSelection() {
    const result = await chrome.storage.local.get(KEYS.PENDING_SELECTION);
    const pending = result[KEYS.PENDING_SELECTION] || null;

    // Only return if recent (within 5 minutes)
    if (pending && Date.now() - pending.timestamp < 300000) {
        // Clear after reading
        await chrome.storage.local.remove(KEYS.PENDING_SELECTION);
        return pending;
    }

    // Expired — clean up
    if (pending) {
        await chrome.storage.local.remove(KEYS.PENDING_SELECTION);
    }
    return null;
}
