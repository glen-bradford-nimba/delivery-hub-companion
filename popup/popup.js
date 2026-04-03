/**
 * Popup controller for Delivery Hub Companion.
 */

import { getMyWorkItems, createWorkLog, createWorkItemFromVoice, testConnection } from '../lib/api-client.js';
import { getAuth, getCachedWorkItems } from '../lib/storage.js';
import { VoiceEngine } from '../lib/voice-engine.js';

// ── State ──
let workItems = [];
let voiceEngine = null;

// ── DOM refs ──
const viewConnect = document.getElementById('view-connect');
const viewMain = document.getElementById('view-main');
const itemsList = document.getElementById('items-list');
const itemsLoading = document.getElementById('items-loading');
const itemsEmpty = document.getElementById('items-empty');
const logItem = document.getElementById('log-item');
const logHours = document.getElementById('log-hours');
const logNotes = document.getElementById('log-notes');
const logStatus = document.getElementById('log-status');
const btnMic = document.getElementById('btn-mic');
const voiceStatus = document.getElementById('voice-status');
const voiceTranscript = document.getElementById('voice-transcript');
const voiceText = document.getElementById('voice-text');
const voiceControls = document.getElementById('voice-controls');
const voiceResult = document.getElementById('voice-result');

// ── Init ──
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Tab switching
    document.querySelectorAll('.dh-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Settings buttons
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-go-settings').addEventListener('click', openSettings);

    // Log submit
    document.getElementById('btn-log-submit').addEventListener('click', handleLogSubmit);

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

    // Load cached items immediately, then refresh
    workItems = await getCachedWorkItems();
    if (workItems.length > 0) {
        renderItems();
        populateLogSelect();
        itemsLoading.style.display = 'none';
    }

    // Fetch fresh data
    try {
        workItems = await getMyWorkItems();
        renderItems();
        populateLogSelect();
    } catch (e) {
        console.error('Failed to load work items:', e);
        if (workItems.length === 0) {
            itemsEmpty.style.display = 'block';
        }
    }
    itemsLoading.style.display = 'none';

    // Initialize voice engine
    voiceEngine = new VoiceEngine();
    if (!voiceEngine.supported) {
        voiceStatus.textContent = 'Voice not supported in this browser';
        btnMic.disabled = true;
        btnMic.style.opacity = '0.4';
    }
}

// ── Tabs ──
function switchTab(tabName) {
    document.querySelectorAll('.dh-tab').forEach(t => t.classList.remove('dh-tab--active'));
    document.querySelectorAll('.dh-tab-content').forEach(c => c.style.display = 'none');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('dh-tab--active');
    document.getElementById('tab-' + tabName).style.display = 'block';
}

// ── Items ──
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
        card.onclick = () => openInSalesforce(item.id);

        const hours = item.loggedHours + '/' + (item.estimatedHours || '?') + 'h';

        card.innerHTML =
            '<div class="dh-item-priority dh-item-priority--' + item.priority + '"></div>'
            + '<div class="dh-item-body">'
            + '  <div class="dh-item-name">' + escapeHtml(item.name) + '</div>'
            + '  <div class="dh-item-desc">' + escapeHtml(item.description) + '</div>'
            + '  <div class="dh-item-meta">' + escapeHtml(item.entityName || 'No client') + ' &middot; ' + hours + '</div>'
            + '</div>'
            + '<span class="dh-item-stage">' + escapeHtml(item.stage) + '</span>';

        itemsList.appendChild(card);
    });
}

function populateLogSelect() {
    logItem.innerHTML = '';
    workItems.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name + ' — ' + (item.description || '').substring(0, 40);
        logItem.appendChild(opt);
    });
}

// ── Quick Log ──
async function handleLogSubmit() {
    const itemId = logItem.value;
    const hours = parseFloat(logHours.value);
    const notes = logNotes.value.trim();

    if (!itemId || !hours || hours <= 0) {
        showStatus(logStatus, 'Please select a work item and enter hours.', 'error');
        return;
    }

    const btn = document.getElementById('btn-log-submit');
    btn.disabled = true;
    btn.textContent = 'Logging...';

    try {
        await createWorkLog(itemId, hours, notes);
        showStatus(logStatus, 'Work log created successfully!', 'success');
        logHours.value = '1';
        logNotes.value = '';
        // Refresh items to update hours
        workItems = await getMyWorkItems();
        renderItems();
        populateLogSelect();
    } catch (e) {
        showStatus(logStatus, e.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Log Hours';
}

// ── Voice ──
function handleMicToggle() {
    if (!voiceEngine) { return; }

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
            voiceText.textContent = transcript + (interim ? ' ' + interim : '');
            voiceTranscript.style.display = 'block';
        });

        if (voiceEngine.start()) {
            btnMic.classList.add('dh-mic-btn--active');
            voiceStatus.textContent = 'Listening... tap to stop';
        }
    }
}

async function handleVoiceCreate() {
    const transcript = voiceEngine ? voiceEngine.transcript : '';
    if (!transcript) { return; }

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
        workItems = await getMyWorkItems();
        renderItems();
        populateLogSelect();
    } catch (e) {
        showStatus(voiceResult, e.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Create Work Item';
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
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
