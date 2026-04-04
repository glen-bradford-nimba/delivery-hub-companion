/**
 * Service worker for Delivery Hub Companion.
 * Handles context menus, badge updates, and periodic offline queue sync.
 */

/* global chrome, fetch */

// ── Context Menu Setup ──

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'dh-create-from-selection',
        title: 'Create DH Work Item from "%s"',
        contexts: ['selection']
    });

    // Set badge for first-time install to remind user to configure
    chrome.storage.local.get('dh_auth', (result) => {
        if (!result.dh_auth || !result.dh_auth.accessToken) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        }
    });
});

// ── Context Menu Click ──

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'dh-create-from-selection' && info.selectionText) {
        // Store the selected text so the popup can pick it up
        chrome.storage.local.set({
            dh_pending_selection: {
                text: info.selectionText.trim(),
                url: info.pageUrl || (tab && tab.url) || '',
                title: (tab && tab.title) || '',
                timestamp: Date.now()
            }
        });

        // Notify user to click the extension icon
        chrome.notifications.create('dh-selection-captured', {
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: 'Delivery Hub',
            message: 'Text captured! Click the extension icon to create a work item.',
            priority: 2
        });
    }
});

// ── Clear badge when auth is saved ──

chrome.storage.onChanged.addListener((changes) => {
    if (changes.dh_auth) {
        const newAuth = changes.dh_auth.newValue;
        if (newAuth && newAuth.accessToken) {
            chrome.action.setBadgeText({ text: '' });
        } else {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        }
    }
});

// ── Periodic Offline Queue Sync ──

chrome.alarms.create('dh-sync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'dh-sync') { return; }

    const result = await chrome.storage.local.get(['dh_offline_queue', 'dh_auth']);
    const queue = result.dh_offline_queue || [];
    if (queue.length === 0) { return; }

    const auth = result.dh_auth;
    if (!auth || !auth.accessToken || !auth.instanceUrl) { return; }

    const headers = {
        'Authorization': 'Bearer ' + auth.accessToken,
        'Content-Type': 'application/json'
    };
    const ns = (auth.namespace || 'delivery') + '__';

    const failed = [];
    let successCount = 0;

    for (const entry of queue) {
        try {
            const url = auth.instanceUrl + '/services/data/v62.0/sobjects/' + ns + 'WorkLog__c';
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(entry.body)
            });

            if (response.ok) {
                successCount++;
            } else if (response.status === 401) {
                // Token expired — stop processing, keep all remaining
                failed.push(entry, ...queue.slice(queue.indexOf(entry) + 1));
                break;
            } else {
                failed.push(entry);
            }
        } catch (e) {
            // Network error — keep in queue
            failed.push(entry);
        }
    }

    await chrome.storage.local.set({ dh_offline_queue: failed });

    if (successCount > 0) {
        // Update badge to show sync happened
        chrome.action.setBadgeText({ text: String(successCount) });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    }
});

// ── Message Handling ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'QUEUE_SYNCED') {
        // Popup notifies us when it manually triggers a sync
        sendResponse({ ok: true });
    }
    if (message.type === 'GET_PENDING_SELECTION') {
        chrome.storage.local.get('dh_pending_selection', (result) => {
            const pending = result.dh_pending_selection || null;
            // Only return if recent (within 5 minutes)
            if (pending && Date.now() - pending.timestamp < 300000) {
                sendResponse({ selection: pending });
                // Clear it after reading
                chrome.storage.local.remove('dh_pending_selection');
            } else {
                sendResponse({ selection: null });
                if (pending) {
                    chrome.storage.local.remove('dh_pending_selection');
                }
            }
        });
        return true; // Keep channel open for async sendResponse
    }
});
