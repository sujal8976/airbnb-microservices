/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_API: string;
  readonly VITE_LISTING_API: string;
  readonly VITE_SEARCH_API: string;
  readonly VITE_BOOKING_API: string;
  readonly VITE_PAYMENT_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
