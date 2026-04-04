/**
 * Popup controller for Delivery Hub Companion.
 * Manages tabs: My Items, Quick Log, Voice Note.
 * Handles context menu pending selections (pre-fill Quick Log).
 */

import {
    getMyWorkItems,
    createWorkLog,
    createWorkItemFromVoice,
    AuthError
} from '../lib/api-client.js';
import { getAuth, getCachedWorkItems, getOfflineQueue, getPendingSelection } from '../lib/storage.js';
import { VoiceEngine } from '../lib/voice-engine.js';

// ── State ──
let workItems = [];
let voiceEngine = null;
let isRefreshing = false;

// ── DOM Refs ──
const viewConnect = document.getElementById('view-connect');
const viewMain = document.getElementById('view-main');
const itemsList = document.getElementById('items-list');
const itemsLoading = document.getElementById('items-loading');
const itemsEmpty = document.getElementById('items-empty');
const itemsError = document.getElementById('items-error');
const itemsErrorText = document.getElementById('items-error-text');
const btnRefresh = document.getElementById('btn-refresh');
const offlineBanner = document.getElementById('offline-banner');
const offlineCount = document.getElementById('offline-count');
const logItem = document.getElementById('log-item');
const logHours = document.getElementById('log-hours');
const logNotes = document.getElementById('log-notes');
const logStatus = document.getElementById('log-status');
const btnLogSubmit = document.getElementById('btn-log-submit');
const btnMic = document.getElementById('btn-mic');
const voiceStatus = document.getElementById('voice-status');
const voiceTranscript = document.getElementById('voice-transcript');
const voiceText = document.getElementById('voice-text');
const voiceControls = document.getElementById('voice-controls');
const voiceResult = document.getElementById('voice-result');

// ── Init ──

init();

async function init() {
    // Tab switching
    document.querySelectorAll('.dh-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Settings buttons
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-go-settings').addEventListener('click', openSettings);

    // Refresh button
    btnRefresh.addEventListener('click', handleRefresh);

    // Log submit
    btnLogSubmit.addEventListener('click', handleLogSubmit);

    // Voice
    btnMic.addEventListener('click', handleMicToggle);
    document.getElementById('btn-voice-create').addEventListener('click', handleVoiceCreate);

    // Check auth
    const auth = await getAuth();
    if (!auth || !auth.accessToken) {
        viewConnect.style.display = 'block';
        viewMain.style.display = 'none';
        return;
    }

    viewConnect.style.display = 'none';
    viewMain.style.display = 'block';

    // Show cached items immediately
    const cache = await getCachedWorkItems();
    if (cache.items.length > 0) {
        workItems = cache.items;
        renderItems();
        populateLogSelect();
        itemsLoading.style.display = 'none';
    }

    // Show offline queue banner if needed
    await updateOfflineBanner();

    // Fetch fresh data in background
    refreshWorkItems();

    // Initialize voice engine
    voiceEngine = new VoiceEngine();
    if (!voiceEngine.supported) {
        voiceStatus.textContent = 'Voice not supported in this browser.';
        btnMic.disabled = true;
        btnMic.classList.add('dh-mic-btn--disabled');
    } else {
        voiceEngine.onError((message) => {
            btnMic.classList.remove('dh-mic-btn--active');
            voiceStatus.textContent = message;
        });
    }

    // Check for pending selection from context menu
    await checkPendingSelection();
}

// ── Tabs ──

function switchTab(tabName) {
    document.querySelectorAll('.dh-tab').forEach(t => t.classList.remove('dh-tab--active'));
    document.querySelectorAll('.dh-tab-content').forEach(c => c.style.display = 'none');

    const tabBtn = document.querySelector('[data-tab="' + tabName + '"]');
    const tabContent = document.getElementById('tab-' + tabName);

    if (tabBtn) { tabBtn.classList.add('dh-tab--active'); }
    if (tabContent) { tabContent.style.display = 'block'; }
}

// ── Work Items ──

async function refreshWorkItems() {
    if (isRefreshing) { return; }
    isRefreshing = true;
    btnRefresh.classList.add('dh-spin');

    try {
        workItems = await getMyWorkItems();
        renderItems();
        populateLogSelect();
        itemsError.style.display = 'none';
    } catch (e) {
        console.error('Failed to load work items:', e);
        if (workItems.length === 0) {
            if (e instanceof AuthError) {
                showItemsError('Session expired. Please refresh your access token in Settings.');
            } else {
                showItemsError('Could not load work items. Check your connection.');
            }
        }
    }

    itemsLoading.style.display = 'none';
    isRefreshing = false;
    btnRefresh.classList.remove('dh-spin');
}

function handleRefresh() {
    itemsError.style.display = 'none';
    itemsLoading.style.display = 'flex';
    itemsEmpty.style.display = 'none';
    refreshWorkItems();
}

function showItemsError(message) {
    itemsErrorText.textContent = message;
    itemsError.style.display = 'block';
    itemsEmpty.style.display = 'none';
}

function renderItems() {
    itemsList.innerHTML = '';

    if (workItems.length === 0) {
        itemsEmpty.style.display = 'block';
        return;
    }
    itemsEmpty.style.display = 'none';

    workItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'dh-item-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.onclick = () => openInSalesforce(item.id);
        card.onkeydown = (e) => { if (e.key === 'Enter') { openInSalesforce(item.id); } };

        const estHours = item.estimatedHours || '?';
        const hours = item.loggedHours + '/' + estHours + 'h';
        const pct = item.estimatedHours > 0
            ? Math.round((item.loggedHours / item.estimatedHours) * 100)
            : 0;
        const overBudget = pct > 100;

        card.innerHTML =
            '<div class="dh-item-priority dh-item-priority--' + escapeAttr(item.priority) + '"></div>'
            + '<div class="dh-item-body">'
            + '  <div class="dh-item-name">' + escapeHtml(item.name) + '</div>'
            + '  <div class="dh-item-desc">' + escapeHtml(item.description || 'No description') + '</div>'
            + '  <div class="dh-item-meta">'
            +      escapeHtml(item.entityName || 'No client')
            +      ' &middot; <span class="' + (overBudget ? 'dh-over-budget' : '') + '">' + hours + '</span>'
            + '  </div>'
            + '</div>'
            + '<span class="dh-item-stage">' + escapeHtml(item.stage) + '</span>';

        itemsList.appendChild(card);
    });
}

function populateLogSelect() {
    const currentVal = logItem.value;
    logItem.innerHTML = '';

    if (workItems.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No work items available';
        opt.disabled = true;
        logItem.appendChild(opt);
        return;
    }

    workItems.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        const desc = (item.description || '').substring(0, 35);
        opt.textContent = item.name + (desc ? ' -- ' + desc : '');
        logItem.appendChild(opt);
    });

    // Restore previous selection if still available
    if (currentVal) {
        const exists = Array.from(logItem.options).some(o => o.value === currentVal);
        if (exists) { logItem.value = currentVal; }
    }
}

// ── Quick Log ──

async function handleLogSubmit() {
    const itemId = logItem.value;
    const hours = parseFloat(logHours.value);
    const notes = logNotes.value.trim();

    if (!itemId) {
        showStatus(logStatus, 'Please select a work item.', 'error');
        return;
    }
    if (!hours || hours <= 0 || isNaN(hours)) {
        showStatus(logStatus, 'Please enter a valid number of hours.', 'error');
        return;
    }

    btnLogSubmit.disabled = true;
    btnLogSubmit.textContent = 'Logging...';

    try {
        const result = await createWorkLog(itemId, hours, notes);
        if (result && result.queued) {
            showStatus(logStatus, 'Offline — work log queued for sync.', 'warning');
        } else {
            showStatus(logStatus, 'Work log created!', 'success');
        }
        logHours.value = '1';
        logNotes.value = '';

        // Refresh items to update hours display
        refreshWorkItems();
        await updateOfflineBanner();
    } catch (e) {
        if (e instanceof AuthError) {
            showStatus(logStatus, 'Session expired. Please refresh your token in Settings.', 'error');
        } else {
            showStatus(logStatus, e.message, 'error');
        }
    }

    btnLogSubmit.disabled = false;
    btnLogSubmit.textContent = 'Log Hours';
}

// ── Voice ──

function handleMicToggle() {
    if (!voiceEngine || !voiceEngine.supported) { return; }

    if (voiceEngine.isListening) {
        voiceEngine.stop();
        btnMic.classList.remove('dh-mic-btn--active');
        voiceStatus.textContent = 'Tap to start dictating';

        const text = voiceEngine.transcript;
        if (text) {
            voiceText.textContent = text;
            voiceTranscript.style.display = 'block';
            voiceControls.style.display = 'block';
        }
    } else {
        voiceResult.style.display = 'none';
        voiceTranscript.style.display = 'none';
        voiceControls.style.display = 'none';

        voiceEngine.onUpdate((transcript, interim) => {
            const display = transcript + (interim ? ' ' + interim : '');
            voiceText.textContent = display || 'Listening...';
            voiceTranscript.style.display = 'block';
        });

        if (voiceEngine.start()) {
            btnMic.classList.add('dh-mic-btn--active');
            voiceStatus.textContent = 'Listening... tap to stop';
        } else {
            voiceStatus.textContent = 'Could not start microphone. Check permissions.';
        }
    }
}

async function handleVoiceCreate() {
    const transcript = voiceEngine ? voiceEngine.transcript : '';
    if (!transcript) {
        showStatus(voiceResult, 'No transcript to submit. Record a voice note first.', 'error');
        return;
    }

    const priority = document.getElementById('voice-priority').value;
    const btn = document.getElementById('btn-voice-create');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const result = await createWorkItemFromVoice(transcript, priority);
        showStatus(voiceResult, 'Work item created! ID: ' + result.id, 'success');
        voiceTranscript.style.display = 'none';
        voiceControls.style.display = 'none';
        // Refresh items
        refreshWorkItems();
    } catch (e) {
        if (e instanceof AuthError) {
            showStatus(voiceResult, 'Session expired. Please refresh your token in Settings.', 'error');
        } else {
            showStatus(voiceResult, e.message, 'error');
        }
    }

    btn.disabled = false;
    btn.textContent = 'Create Work Item';
}

// ── Pending Selection (Context Menu) ──

async function checkPendingSelection() {
    const pending = await getPendingSelection();
    if (!pending || !pending.text) { return; }

    // Switch to Quick Log tab and pre-fill notes
    switchTab('log');
    logNotes.value = pending.text;

    // Show a helpful status message
    const sourceLabel = pending.url ? ' from ' + truncateUrl(pending.url) : '';
    showStatus(logStatus, 'Text captured' + sourceLabel + '. Select a work item and log hours, or adjust the notes.', 'info');
}

function truncateUrl(url) {
    try {
        const u = new URL(url);
        const path = u.pathname.length > 30
            ? u.pathname.substring(0, 30) + '...'
            : u.pathname;
        return u.hostname + path;
    } catch (e) {
        return url.substring(0, 40);
    }
}

// ── Offline Banner ──

async function updateOfflineBanner() {
    const queue = await getOfflineQueue();
    if (queue.length > 0) {
        offlineCount.textContent = queue.length;
        offlineBanner.style.display = 'flex';
    } else {
        offlineBanner.style.display = 'none';
    }
}

// ── Helpers ──

function openSettings() {
    chrome.runtime.openOptionsPage();
}

async function openInSalesforce(recordId) {
    const auth = await getAuth();
    if (auth && auth.instanceUrl) {
        chrome.tabs.create({ url: auth.instanceUrl + '/lightning/r/' + recordId + '/view' });
    }
}

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'dh-status dh-status--' + type;
    el.style.display = 'block';

    // Auto-hide success and info messages after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
    // Error messages stay visible until next action
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function escapeAttr(text) {
    return (text || '').replace(/[^a-zA-Z0-9-_]/g, '');
}
