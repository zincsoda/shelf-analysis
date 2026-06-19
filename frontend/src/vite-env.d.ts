/// <reference types="vite/client" />

declare const __APP_GIT_COMMIT__: string;
declare const __APP_GIT_COMMIT_SHORT__: string;
declare const __APP_GIT_COMMIT_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
