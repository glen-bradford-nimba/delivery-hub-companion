/**
 * Salesforce REST API client for Delivery Hub.
 * Uses session-based auth (access token from OAuth or sf CLI).
 */

import { getAuth, cacheWorkItems, addToOfflineQueue } from './storage.js';

// ── Auth Helpers ──

async function getAuthOrThrow() {
    const auth = await getAuth();
    if (!auth || !auth.accessToken) {
        throw new AuthError('Not authenticated. Please connect to Delivery Hub in Settings.');
    }
    if (!auth.instanceUrl) {
        throw new AuthError('No instance URL configured. Please check Settings.');
    }
    return auth;
}

function makeHeaders(auth) {
    return {
        'Authorization': 'Bearer ' + auth.accessToken,
        'Content-Type': 'application/json'
    };
}

function dataUrl(auth, path) {
    return auth.instanceUrl + '/services/data/v62.0' + path;
}

function namespacePrefix(auth) {
    const ns = auth.namespace;
    return (ns === '' || ns === null || ns === undefined) ? '' : (ns || 'delivery') + '__';
}

// ── Custom Errors ──

export class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

// ── API Call Wrapper ──

async function apiCall(url, options = {}) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (e) {
        throw new ApiError(
            'Network error — check your internet connection.',
            0,
            null
        );
    }

    if (response.status === 401) {
        throw new AuthError(
            'Session expired. Please refresh your access token in Settings.'
        );
    }

    if (!response.ok) {
        let body = '';
        try { body = await response.text(); } catch (e) { /* ignore */ }

        // Try to extract a readable Salesforce error message
        let message = 'API error (HTTP ' + response.status + ')';
        try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed) && parsed[0] && parsed[0].message) {
                message = parsed[0].message;
            } else if (parsed.message) {
                message = parsed.message;
            }
        } catch (e) {
            if (body.length > 0 && body.length < 200) {
                message = body;
            }
        }

        throw new ApiError(message, response.status, body);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return null;
    }

    return response.json();
}

// ── Public API Methods ──

/**
 * Fetch active work items assigned to the current user.
 */
export async function getMyWorkItems() {
    const auth = await getAuthOrThrow();
    const headers = makeHeaders(auth);
    const ns = namespacePrefix(auth);

    const fields = [
        'Id', 'Name',
        ns + 'BriefDescriptionTxt__c',
        ns + 'StageNamePk__c',
        ns + 'PriorityPk__c',
        ns + 'EstimatedHoursNumber__c',
        ns + 'TotalLoggedHoursNumber__c',
        ns + 'ClientNetworkEntityId__r.Name'
    ].join(', ');

    const where = [
        ns + 'IsActiveBool__c = true',
        ns + 'IsTemplateBool__c = false'
    ].join(' AND ');

    const orderBy = ns + 'PriorityPk__c ASC, CreatedDate DESC';

    const soql = encodeURIComponent(
        'SELECT ' + fields
        + ' FROM ' + ns + 'WorkItem__c'
        + ' WHERE ' + where
        + ' ORDER BY ' + orderBy
        + ' LIMIT 50'
    );

    const data = await apiCall(dataUrl(auth, '/query/?q=' + soql), { headers });
    const items = (data.records || []).map(r => ({
        id: r.Id,
        name: r.Name,
        description: r[ns + 'BriefDescriptionTxt__c'] || '',
        stage: r[ns + 'StageNamePk__c'] || '',
        priority: r[ns + 'PriorityPk__c'] || 'Medium',
        estimatedHours: r[ns + 'EstimatedHoursNumber__c'] || 0,
        loggedHours: r[ns + 'TotalLoggedHoursNumber__c'] || 0,
        entityName: r[ns + 'ClientNetworkEntityId__r']
            ? r[ns + 'ClientNetworkEntityId__r'].Name : ''
    }));

    await cacheWorkItems(items);
    return items;
}

/**
 * Create a work log entry for a work item.
 * Falls back to offline queue if API call fails due to network.
 */
export async function createWorkLog(workItemId, hours, notes) {
    const auth = await getAuthOrThrow();
    const headers = makeHeaders(auth);
    const ns = namespacePrefix(auth);

    const body = {
        [ns + 'WorkItemId__c']: workItemId,
        [ns + 'HoursNumber__c']: parseFloat(hours),
        [ns + 'NotesTxt__c']: notes || '',
        [ns + 'DateDt__c']: new Date().toISOString().split('T')[0]
    };

    try {
        return await apiCall(dataUrl(auth, '/sobjects/' + ns + 'WorkLog__c'), {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
    } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
            // Network error — queue for later
            await addToOfflineQueue({ body, type: 'WorkLog__c' });
            return { id: null, queued: true };
        }
        throw e;
    }
}

/**
 * Create a work item from voice note transcript or selected text.
 */
export async function createWorkItem(description, details, priority, source) {
    const auth = await getAuthOrThrow();
    const headers = makeHeaders(auth);
    const ns = namespacePrefix(auth);

    const briefDesc = description.length > 100
        ? description.substring(0, 100)
        : description;

    const sourceLabel = source || 'Chrome Extension';

    const body = {
        [ns + 'BriefDescriptionTxt__c']: briefDesc,
        [ns + 'DetailsTxt__c']: '[' + sourceLabel + '] ' + (details || description),
        [ns + 'PriorityPk__c']: priority || 'Medium',
        [ns + 'StageNamePk__c']: 'Backlog',
        [ns + 'StatusPk__c']: 'New',
        [ns + 'ActivatedDateTime__c']: new Date().toISOString()
    };

    return apiCall(dataUrl(auth, '/sobjects/' + ns + 'WorkItem__c'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
}

/**
 * Convenience wrapper for voice note work items.
 */
export async function createWorkItemFromVoice(transcript, priority) {
    return createWorkItem(transcript, transcript, priority, 'Voice Note - Chrome Extension');
}

/**
 * Convenience wrapper for context menu (selected text) work items.
 */
export async function createWorkItemFromSelection(text, sourceUrl, priority) {
    const details = text + (sourceUrl ? '\n\nSource: ' + sourceUrl : '');
    return createWorkItem(text, details, priority, 'Selected Text - Chrome Extension');
}

/**
 * Test the connection by querying for the org name.
 */
export async function testConnection() {
    const auth = await getAuthOrThrow();
    const headers = makeHeaders(auth);
    const data = await apiCall(
        dataUrl(auth, '/query/?q=' + encodeURIComponent('SELECT Name FROM Organization LIMIT 1')),
        { headers }
    );
    return data.records && data.records[0] ? data.records[0].Name : 'Connected';
}
