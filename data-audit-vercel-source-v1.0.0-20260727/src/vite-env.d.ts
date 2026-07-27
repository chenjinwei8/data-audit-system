/// <reference types="vite/client" />

type AppRuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

interface Window {
  __APP_CONFIG__?: AppRuntimeConfig;
}
