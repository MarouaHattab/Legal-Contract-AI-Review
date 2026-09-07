/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CREATOR_LINKEDIN_URL?: string;
  readonly VITE_CREATOR_GITHUB_URL?: string;
  readonly VITE_CREATOR_EMAIL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
