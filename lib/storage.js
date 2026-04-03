/**
 * Chrome storage wrapper for settings and cached data.
 */

const KEYS = {
    AUTH: 'dh_auth',
    SETTINGS: 'dh_settings',
    WORK_ITEMS_CACHE: 'dh_work_items',
    OFFLINE_QUEUE: 'dh_offline_queue'
};

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

export async function getSettings() {
    const result = await chrome.storage.local.get(KEYS.SETTINGS);
    return result[KEYS.SETTINGS] || { instanceUrl: '', orgAlias: '' };
}

export async function saveSettings(settings) {
    await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
}

export async function getCachedWorkItems() {
    const result = await chrome.storage.local.get(KEYS.WORK_ITEMS_CACHE);
    return result[KEYS.WORK_ITEMS_CACHE] || [];
}

export async function cacheWorkItems(items) {
    await chrome.storage.local.set({ [KEYS.WORK_ITEMS_CACHE]: items });
}

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
