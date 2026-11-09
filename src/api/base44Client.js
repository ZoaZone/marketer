import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion } = appParams;

// BUG-001 FIX: Use window.location.origin for appBaseUrl to prevent login redirect loops
const appBaseUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://digitalstudios.app";

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: 'https://base44.app',
  requiresAuth: false,
  appBaseUrl,
});

export default base44;
