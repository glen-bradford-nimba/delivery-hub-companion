/**
 * Options page controller for Delivery Hub Companion.
 */

/* global chrome */

import { getAuth, saveAuth, clearAuth } from '../lib/storage.js';
import { testConnection, AuthError } from '../lib/api-client.js';

const instanceUrl = document.getElementById('instance-url');
const accessToken = document.getElementById('access-token');
const namespace = document.getElementById('namespace');
const statusEl = document.getElementById('status');
const btnSave = document.getElementById('btn-save');
const btnTest = document.getElementById('btn-test');
const btnDisconnect = document.getElementById('btn-disconnect');
const connectedBadge = document.getElementById('connected-badge');

// ── Init ──

loadSettings();

async function loadSettings() {
    const auth = await getAuth();
    if (auth) {
        instanceUrl.value = auth.instanceUrl || '';
        // Show masked token if set (don't expose full token)
        if (auth.accessToken) {
            accessToken.placeholder = 'Token saved (enter new to replace)';
            connectedBadge.style.display = 'inline-flex';
        }
        namespace.value = (auth.namespace !== undefined && auth.namespace !== null)
            ? auth.namespace
            : 'delivery';
    }
}

// ── Save & Connect ──

btnSave.addEventListener('click', async () => {
    const url = instanceUrl.value.trim().replace(/\/+$/, '');
    const token = accessToken.value.trim();

    if (!url) {
        showStatus('Please enter your Salesforce Instance URL.', 'error');
        return;
    }

    // Validate URL format
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes('salesforce.com') && !parsed.hostname.includes('force.com')) {
            showStatus('URL does not look like a Salesforce instance. Expected *.salesforce.com or *.force.com.', 'error');
            return;
        }
    } catch (e) {
        showStatus('Invalid URL format. Example: https://myorg.my.salesforce.com', 'error');
        return;
    }

    // If no new token entered, keep the existing one
    const existingAuth = await getAuth();
    const finalToken = token || (existingAuth && existingAuth.accessToken) || '';

    if (!finalToken) {
        showStatus('Please enter an Access Token.', 'error');
        return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    await saveAuth({
        instanceUrl: url,
        accessToken: finalToken,
        namespace: namespace.value
    });

    showStatus('Settings saved. Testing connection...', 'info');

    try {
        const orgName = await testConnection();
        showStatus('Connected to ' + orgName + '!', 'success');
        connectedBadge.style.display = 'inline-flex';
        accessToken.value = '';
        accessToken.placeholder = 'Token saved (enter new to replace)';
    } catch (e) {
        if (e instanceof AuthError) {
            showStatus('Saved, but token appears invalid or expired. ' + e.message, 'error');
        } else {
            showStatus('Saved, but connection test failed: ' + e.message, 'error');
        }
        connectedBadge.style.display = 'none';
    }

    btnSave.disabled = false;
    btnSave.textContent = 'Save & Connect';
});

// ── Test ──

btnTest.addEventListener('click', async () => {
    btnTest.disabled = true;
    btnTest.textContent = 'Testing...';

    try {
        const orgName = await testConnection();
        showStatus('Connection successful! Org: ' + orgName, 'success');
    } catch (e) {
        if (e instanceof AuthError) {
            showStatus('Not connected. ' + e.message, 'error');
        } else {
            showStatus('Connection failed: ' + e.message, 'error');
        }
    }

    btnTest.disabled = false;
    btnTest.textContent = 'Test';
});

// ── Disconnect (two-step: show confirm, then act) ──

btnDisconnect.addEventListener('click', () => {
    const confirmEl = document.getElementById('disconnect-confirm');
    confirmEl.style.display = 'block';
});

document.getElementById('btn-confirm-disconnect').addEventListener('click', async () => {
    await clearAuth();
    instanceUrl.value = '';
    accessToken.value = '';
    accessToken.placeholder = 'Paste your access token here';
    connectedBadge.style.display = 'none';
    document.getElementById('disconnect-confirm').style.display = 'none';
    showStatus('Disconnected. Your access token has been removed.', 'info');
});

document.getElementById('btn-cancel-disconnect').addEventListener('click', () => {
    document.getElementById('disconnect-confirm').style.display = 'none';
});

// ── Status Helper ──

function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status status--' + type;
}
