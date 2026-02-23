import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'BugShot',
  version: '1.0.1',
  description: 'Capture bugs and design issues, submit to Jira, GitHub, and N8N with screenshots',

  icons: {
    '16': 'src/assets/icons/icon-16.png',
    '32': 'src/assets/icons/icon-32.png',
    '48': 'src/assets/icons/icon-48.png',
    '128': 'src/assets/icons/icon-128.png',
  },

  devtools_page: 'src/devtools/devtools.html',

  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module' as const,
  },

  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],

  action: {
    default_icon: {
      '16': 'src/assets/icons/icon-16.png',
      '32': 'src/assets/icons/icon-32.png',
    },
  },

  permissions: [
    'tabs',
    'storage',
    'offscreen',
    'alarms',
    'debugger',
  ],

  host_permissions: [
    '<all_urls>',
    'https://*.atlassian.net/*',
  ],
});
