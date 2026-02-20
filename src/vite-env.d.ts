/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JIRA_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
