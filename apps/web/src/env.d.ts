/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The development bridge's address, when it isn't http://127.0.0.1:5174. */
  readonly VITE_BRIDGE_URL?: string;
}
