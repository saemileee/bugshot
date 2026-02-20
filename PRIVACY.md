# BugShot Privacy Policy

*Last updated: February 21, 2026*

## Overview

BugShot is a Chrome extension that helps designers and developers inspect page elements, track CSS changes, capture screenshots and screen recordings, and submit bug reports to project management tools. This privacy policy explains how BugShot handles user data.

## Data Collection

### Authentication Information

BugShot stores integration credentials locally in your browser using Chrome's `storage.sync` API:

- **Jira**: Email, API token, and Atlassian site URL
- **GitHub**: Personal Access Token
- **N8N**: Webhook URL

These credentials are stored only in your browser and are used exclusively to authenticate with the services you configure. They are never sent to any server other than the intended service endpoint.

### Website Content

BugShot captures the following data only when you explicitly initiate an action:

- **CSS properties** of elements you select for inspection
- **Screenshots** of the active tab when you click the capture button
- **Screen recordings** when you start a recording session

This data is stored temporarily in your browser (IndexedDB) and is sent only to the integrations you have configured (Jira, GitHub, or N8N) when you explicitly submit a bug report.

## Data Storage

All data is stored locally in your browser:

- Integration credentials are stored in `chrome.storage.sync`
- Screen recordings are stored temporarily in IndexedDB
- No data is stored on any external server owned or operated by BugShot

## Third-Party Services

BugShot communicates with the following third-party services only when you explicitly submit a report:

- **Atlassian Jira** — to create issues and upload attachments
- **GitHub** — to create issues
- **N8N** — to send webhook payloads

No data is sent automatically or in the background. All transmissions are initiated by user action.

## Data Sharing

- BugShot does **not** sell or transfer user data to third parties
- BugShot does **not** use user data for advertising or analytics
- BugShot does **not** collect telemetry or usage statistics

## Data Deletion

You can delete all stored data at any time by:

1. Disconnecting integrations in the BugShot settings panel
2. Removing the extension from Chrome (this clears all stored data)

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date.

## Contact

For questions about this privacy policy, please open an issue at [https://github.com/saemileee/bugshot](https://github.com/saemileee/bugshot).
