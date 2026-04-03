/**
 * Content script — minimal for now.
 * Phase 2 will add sidebar injection and page context detection.
 */

// Listen for messages from the popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
        sendResponse({
            url: window.location.href,
            title: document.title,
            selectedText: window.getSelection().toString()
        });
    }
});
