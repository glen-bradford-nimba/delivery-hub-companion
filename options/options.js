/**
 * Options page controller for Delivery Hub Companion.
 */

import { getAuth, saveAuth, clearAuth, getSettings, saveSettings } from '../lib/storage.js';
import { testConnection } from '../lib/api-client.js';

const instanceUrl = document.getElementById('instance-url');
const accessToken = document.getElementById('access-token');
const namespace = document.getElementById('namespace');
const statusEl = document.getElementById('status');

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await getAuth();
    if (auth) {
        instanceUrl.value = auth.instanceUrl || '';
        accessToken.value = auth.accessToken || '';
        namespace.value = auth.namespace || 'delivery';
    }
});

// Save
document.getElementById('btn-save').addEventListener('click', async () => {
    const url = instanceUrl.value.trim().replace(/\/+$/, '');
    const token = accessToken.value.trim();

    if (!url || !token) {
        showStatus('Please enter both Instance URL and Access Token.', 'error');
        return;
    }

    await saveAuth({
        instanceUrl: url,
        accessToken: token,
        namespace: namespace.value
    });

    showStatus('Settings saved! Testing connection...', 'success');

    try {
        const orgName = await testConnection();
        showStatus('Connected to ' + orgName + '!', 'success');
    } catch (e) {
        showStatus('Saved, but connection test failed: ' + e.message, 'error');
    }
});

// Test
document.getElementById('btn-test').addEventListener('click', async () => {
    try {
        const orgName = await testConnection();
        showStatus('Connection successful! Org: ' + orgName, 'success');
    } catch (e) {
        showStatus('Connection failed: ' + e.message, 'error');
    }
});

// Disconnect
document.getElementById('btn-disconnect').addEventListener('click', async () => {
    await clearAuth();
    instanceUrl.value = '';
    accessToken.value = '';
    showStatus('Disconnected. Your access token has been removed.', 'success');
});

function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status status--' + type;
}
