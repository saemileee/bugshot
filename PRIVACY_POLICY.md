# BugShot Privacy Policy

**Last Updated: February 21, 2026**

## Overview

BugShot is a Chrome extension that helps developers capture bugs and design issues, then submit them to project management tools. This privacy policy explains what data BugShot collects, how it is used, and how it is stored.

## Data Collection

### Personal Information
- **Email address**: Used solely for Jira API authentication. Stored locally in Chrome's `chrome.storage.local`.

### Authentication Information
- **Jira API token**: Used to authenticate with your Jira instance. Stored locally in `chrome.storage.local`.
- **GitHub personal access token**: Used to authenticate with GitHub Issues API. Stored locally in `chrome.storage.local`.
- **N8N webhook URL**: Used to send data to your N8N workflow. Stored locally in `chrome.storage.local`.

### Web History
- **Page URLs and titles**: Captured as part of bug reports to identify where the issue was found. Only captured when you actively create a report.

### Website Content
- **Screenshots**: Captured when you explicitly click the screenshot button. Used for visual documentation of bugs.
- **Screen recordings**: Captured when you explicitly start a recording session. Used for documenting interaction bugs.
- **CSS properties and values**: Captured when you select an element for inspection. Used to track style changes (as-is / to-be).
- **Text content**: Captured from selected elements to provide context for bug reports.

## Data Usage

All collected data is used exclusively for the purpose of creating and submitting bug reports to your configured services:

- **Jira**: Issues are created with screenshots, CSS changes, and descriptions via the Jira REST API.
- **GitHub Issues**: Issues are created with descriptions and CSS changes via the GitHub API.
- **N8N Webhook**: Report data is sent to your configured webhook endpoint.

## Data Storage

- All credentials and settings are stored locally on your device using Chrome's `chrome.storage.local` API.
- Screenshots and recordings are temporarily held in memory during report creation and are not persisted after submission.
- No data is stored on external servers operated by BugShot.

## Data Sharing

- BugShot does **not** sell, trade, or transfer your data to any third parties.
- Data is only sent to the services you explicitly configure (Jira, GitHub, N8N).
- BugShot does not use any analytics, tracking, or advertising services.

## Permissions

BugShot requests the following browser permissions:

- **tabs**: To capture the current tab for screenshots.
- **storage**: To save your settings and credentials locally.
- **offscreen**: To enable screen recording via an offscreen document.
- **alarms**: To keep the service worker alive during screen recordings.
- **Host permissions (`<all_urls>`)**: To inject the BugShot widget on any webpage you are inspecting.

## Data Security

- All API communications use HTTPS.
- Credentials are stored locally and never transmitted to BugShot servers.
- No remote logging or telemetry is performed.

## User Control

- You can clear all stored data by removing the extension or clearing extension storage.
- You can disconnect any integration at any time through the BugShot settings panel.
- All data capture actions (screenshots, recordings, element inspection) require explicit user interaction.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/saemileee/bugshot).
