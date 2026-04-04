/**
 * Content script for Delivery Hub Companion.
 * Runs on Salesforce pages. Detects page context and record info.
 */

/* global chrome */

/**
 * Parse Salesforce Lightning URL to extract record context.
 * Examples:
 *   /lightning/r/Account/001xx000003ABCD/view
 *   /lightning/r/delivery__WorkItem__c/a0Bxx000001XYZ/view
 *   /lightning/o/Account/list
 */
function parseSalesforceUrl(url) {
    const context = {
        url: url,
        title: document.title,
        selectedText: '',
        isSalesforce: false,
        recordId: null,
        objectApiName: null,
        viewType: null
    };

    try {
        const u = new URL(url);
        const hostname = u.hostname;

        // Detect Salesforce domain
        if (hostname.includes('.salesforce.com') || hostname.includes('.force.com')) {
            context.isSalesforce = true;
        }

        const path = u.pathname;

        // Record detail: /lightning/r/{objectApiName}/{recordId}/view
        const recordMatch = path.match(/\/lightning\/r\/([^/]+)\/([a-zA-Z0-9]{15,18})\/(\w+)/);
        if (recordMatch) {
            context.objectApiName = recordMatch[1];
            context.recordId = recordMatch[2];
            context.viewType = recordMatch[3]; // "view", "edit", etc.
        }

        // List view: /lightning/o/{objectApiName}/list
        const listMatch = path.match(/\/lightning\/o\/([^/]+)\/list/);
        if (listMatch) {
            context.objectApiName = listMatch[1];
            context.viewType = 'list';
        }

        // App page: /lightning/page/home, etc.
        const pageMatch = path.match(/\/lightning\/page\/(\w+)/);
        if (pageMatch) {
            context.viewType = 'page';
        }
    } catch (e) {
        // Not a valid URL — ignore
    }

    return context;
}

// ── Message Listener ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
        const context = parseSalesforceUrl(window.location.href);
        context.selectedText = window.getSelection().toString();
        sendResponse(context);
    }

    if (message.type === 'GET_SELECTED_TEXT') {
        sendResponse({ text: window.getSelection().toString() });
    }
});
