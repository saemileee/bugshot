# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-02-25

### Added
- **Region Screenshot Capture**: Added drag-to-select overlay for capturing specific areas of the page
  - New Crop icon button next to full screenshot button for easy identification
  - Real-time dimension display during selection
  - ESC key to cancel selection
  - Performance optimized with RAF throttling
- **Screenshot Descriptions**: Each screenshot now supports individual descriptions
  - Description textarea in inline editor
  - Descriptions included in issue body HTML
  - Visible in review/preview stage
- **Success Page**: Dedicated success page after issue creation
  - Shows all created issues with integration labels
  - Clickable links to view issues directly
  - Issue keys displayed prominently (e.g., PROJ-123)
  - Persistent view instead of brief notification
- **Jira Assignee Improvements**:
  - Increased assignee list from 50 to 200 users
  - Support for assignee-less issue submission
  - Better handling for large teams

### Changed
- **Video Bitrate Reduction**: Reduced from 2.5 Mbps to 1.5 Mbps for smaller file sizes
- **Content Order**: Adjusted issue body content order to: Summary → CSS Changes → Media → Notes → Context
- **Media Descriptions**: Video thumbnails and descriptions removed for simpler workflow

### Performance
- **🚀 Critical: Page Visibility API Optimization**
  - Widget auto-unmounts when tab becomes hidden (background)
  - Widget remounts when tab becomes visible (foreground)
  - ~90% CPU reduction for background tabs
  - ResizeObserver and MutationObserver pause/resume based on visibility
  - RAF loops cancelled in background tabs
  - Storage change handlers skip execution in hidden tabs
  - Fixes multi-tab CPU usage scaling issue

### Fixed
- Build errors related to Vite environment variables (`process.env` → `import.meta.env.MODE`)
- Unused variable warnings in performance test utilities

## [1.0.1] - 2025-02-XX

### Added
- Initial stable release
- Screenshot capture functionality
- Video recording with MediaRecorder API
- Element picker with persistent highlight
- CSS change tracking
- Multi-integration support (Jira, GitHub, n8n)
- IndexedDB storage for recordings
- Draft management system

### Infrastructure
- Chrome Extension MV3 architecture
- Closed Shadow DOM for widget isolation
- Offscreen document for recording/conversion
- Service worker message hub
- React 19 with TypeScript
- Vite build system with @crxjs/vite-plugin

## Versioning Guidelines

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backwards-compatible functionality
- **PATCH** (0.0.X): Bug fixes, backwards-compatible fixes

### When to bump versions:
- **MAJOR**: Manifest V3 → V4, complete architecture rewrite, removing features
- **MINOR**: New capture modes, new integrations, UI redesigns, performance optimizations
- **PATCH**: Bug fixes, typo corrections, dependency updates, minor tweaks
