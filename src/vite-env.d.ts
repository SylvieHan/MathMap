/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLISHED_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
