/**
 * Salesforce REST API client for Delivery Hub.
 * Uses session-based auth (access token from OAuth or sf CLI).
 */

import { getAuth, cacheWorkItems } from './storage.js';

async function getAuthHeaders() {
    const auth = await getAuth();
    if (!auth || !auth.accessToken) {
        throw new Error('Not authenticated. Please connect to Delivery Hub in Settings.');
    }
    return {
        'Authorization': 'Bearer ' + auth.accessToken,
        'Content-Type': 'application/json'
    };
}

function apiUrl(auth, path) {
    return auth.instanceUrl + '/services/apexrest' + path;
}

function dataUrl(auth, path) {
    return auth.instanceUrl + '/services/data/v62.0' + path;
}

/**
 * Fetch active work items via Apex REST or standard API.
 * Uses SOQL query since existing controllers are @AuraEnabled (not REST).
 */
export async function getMyWorkItems() {
    const auth = await getAuth();
    const headers = await getAuthHeaders();
    const namespace = auth.namespace || 'delivery';
    const ns = namespace + '__';

    const soql = encodeURIComponent(
        'SELECT Id, Name, ' + ns + 'BriefDescriptionTxt__c, '
        + ns + 'StageNamePk__c, ' + ns + 'PriorityPk__c, '
        + ns + 'EstimatedHoursNumber__c, ' + ns + 'TotalLoggedHoursNumber__c, '
        + ns + 'ClientNetworkEntityId__r.Name '
        + 'FROM ' + ns + 'WorkItem__c '
        + 'WHERE ' + ns + 'IsActiveBool__c = true '
        + 'AND ' + ns + 'IsTemplateBool__c = false '
        + 'ORDER BY ' + ns + 'PriorityPk__c ASC, CreatedDate DESC '
        + 'LIMIT 50'
    );

    const response = await fetch(dataUrl(auth, '/query/?q=' + soql), { headers });
    if (!response.ok) {
        const err = await response.text();
        throw new Error('Failed to fetch work items: ' + err);
    }
    const data = await response.json();
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
 */
export async function createWorkLog(workItemId, hours, notes) {
    const auth = await getAuth();
    const headers = await getAuthHeaders();
    const namespace = auth.namespace || 'delivery';
    const ns = namespace + '__';

    const body = {
        [ns + 'WorkItemId__c']: workItemId,
        [ns + 'HoursNumber__c']: hours,
        [ns + 'NotesTxt__c']: notes,
        [ns + 'DateDt__c']: new Date().toISOString().split('T')[0]
    };

    const response = await fetch(dataUrl(auth, '/sobjects/' + ns + 'WorkLog__c'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error('Failed to create work log: ' + err);
    }
    return response.json();
}

/**
 * Create a work item from voice note transcript.
 */
export async function createWorkItemFromVoice(transcript, priority) {
    const auth = await getAuth();
    const headers = await getAuthHeaders();
    const namespace = auth.namespace || 'delivery';
    const ns = namespace + '__';

    const briefDesc = transcript.length > 100
        ? transcript.substring(0, 100)
        : transcript;

    const body = {
        [ns + 'BriefDescriptionTxt__c']: briefDesc,
        [ns + 'DetailsTxt__c']: '[Voice Note - Chrome Extension] ' + transcript,
        [ns + 'PriorityPk__c']: priority || 'Medium',
        [ns + 'StageNamePk__c']: 'Backlog',
        [ns + 'StatusPk__c']: 'New',
        [ns + 'ActivatedDateTime__c']: new Date().toISOString()
    };

    const response = await fetch(dataUrl(auth, '/sobjects/' + ns + 'WorkItem__c'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error('Failed to create work item: ' + err);
    }
    return response.json();
}

/**
 * Test the connection by querying for the org name.
 */
export async function testConnection() {
    const auth = await getAuth();
    const headers = await getAuthHeaders();
    const response = await fetch(
        dataUrl(auth, '/query/?q=' + encodeURIComponent('SELECT Name FROM Organization LIMIT 1')),
        { headers }
    );
    if (!response.ok) {
        throw new Error('Connection failed. Check your access token.');
    }
    const data = await response.json();
    return data.records && data.records[0] ? data.records[0].Name : 'Connected';
}
