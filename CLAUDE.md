# Delivery Hub Companion — Chrome Extension

## What This Is
Manifest V3 Chrome Extension for managing Delivery Hub work items from any browser tab. Built for field reps (like Jonathan Aguiar at United Rentals) who work in their own Salesforce org all day and need quick access to Delivery Hub.

## Architecture
- `popup/` — Main popup UI (HTML + CSS + JS modules)
- `background/background.js` — Service worker (context menus, offline queue sync via chrome.alarms)
- `content/content.js` — Content script (page context detection, future sidebar injection)
- `lib/api-client.js` — Salesforce REST API client (SOQL queries, namespace-aware)
- `lib/storage.js` — chrome.storage wrapper for auth, settings, cache, offline queue
- `lib/voice-engine.js` — Web Speech API wrapper (same approach as DH Voice Notes LWC)
- `options/` — Settings page (Salesforce instance URL + access token auth)

## Key Design Decisions
- Uses standard Salesforce REST API (SOQL) rather than Apex REST, since existing DH controllers are `@AuraEnabled` not `@RestResource`
- Namespace-aware: configurable between `delivery` (managed package) and empty (scratch org)
- No build step — vanilla JS modules, no bundler needed
- Auth: access token from `sf org display` pasted into settings. Phase 2 will add proper OAuth via Connected App.

## Parent Project
- **Delivery Hub**: github.com/Nimba-Solutions/Delivery-Hub (Salesforce managed package, namespace `delivery`)
- **Nimbus Gantt**: github.com/glen-bradford-nimba/nimbus-gantt (standalone TypeScript Gantt library)
- **Website**: cloudnimbusllc.com (Next.js)

## Development
1. Open `chrome://extensions` in Chrome
2. Enable Developer Mode
3. Click "Load unpacked" and select this directory
4. Click the extension icon to open the popup
5. Go to Settings to configure your Salesforce org connection

## Rules
- NEVER commit secrets, access tokens, or credentials
- Icons in `icons/` are placeholders — replace with branded PNGs before Chrome Web Store submission
- Keep it zero-dependency — no npm, no build step, no bundler
