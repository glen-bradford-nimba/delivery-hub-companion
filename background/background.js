/**
 * Service worker for Delivery Hub Companion.
 * Handles context menus and periodic sync alarms.
 */

chrome.runtime.onInstalled.addListener(() => {
    // Context menu: create work item from selected text
    chrome.contextMenus.create({
        id: 'dh-create-from-selection',
        title: 'Create Delivery Hub Work Item from "%s"',
        contexts: ['selection']
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'dh-create-from-selection' && info.selectionText) {
        // Store the selected text so the popup can use it
        chrome.storage.local.set({
            dh_pending_selection: {
                text: info.selectionText.trim(),
                url: info.pageUrl,
                timestamp: Date.now()
            }
        });
        // Open the popup — user will see the pre-filled text
        // Note: Can't programmatically open popup, so we use a notification
        chrome.notifications.create('dh-selection', {
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: 'Delivery Hub',
            message: 'Text captured. Click the extension icon to create a work item.',
            priority: 2
        });
    }
});

// Periodic alarm for syncing offline queue
chrome.alarms.create('dh-sync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'dh-sync') { return; }

    const result = await chrome.storage.local.get('dh_offline_queue');
    const queue = result.dh_offline_queue || [];
    if (queue.length === 0) { return; }

    const authResult = await chrome.storage.local.get('dh_auth');
    const auth = authResult.dh_auth;
    if (!auth || !auth.accessToken) { return; }

    // Process queue
    const failed = [];
    for (const entry of queue) {
        try {
            const headers = {
                'Authorization': 'Bearer ' + auth.accessToken,
                'Content-Type': 'application/json'
            };
            const ns = (auth.namespace || 'delivery') + '__';
            const url = auth.instanceUrl + '/services/data/v62.0/sobjects/' + ns + 'WorkLog__c';

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(entry.body)
            });
            if (!response.ok) {
                failed.push(entry);
            }
        } catch (e) {
            failed.push(entry);
        }
    }

    await chrome.storage.local.set({ dh_offline_queue: failed });
});
