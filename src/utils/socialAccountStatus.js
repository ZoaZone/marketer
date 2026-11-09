import { base44 } from "@/api/base44Client";

/**
 * socialAccountStatus.js
 *
 * A SocialAccount's stored `status` field is only ever updated when
 * testSocialConnection actually runs — it does NOT self-correct over time.
 * An account connected via username/password (which none of these
 * platforms' posting APIs accept) can sit at a stale "active" indefinitely,
 * showing a false "Connected" badge until someone manually re-tests it.
 * These helpers make the real, current state visible wherever a connection
 * badge is shown or a publish decision is made.
 */

export const CONNECTION_BADGES = {
  active:       { label: "Connected",          dot: "bg-emerald-400",                text: "text-emerald-400" },
  connected:    { label: "Connected",           dot: "bg-emerald-400",                text: "text-emerald-400" },
  expired:      { label: "Needs reconnection",  dot: "bg-amber-400",                  text: "text-amber-400" },
  disconnected: { label: "Not authorized",      dot: "bg-red-400",                    text: "text-red-400" },
  checking:     { label: "Checking…",           dot: "bg-neutral-400 animate-pulse",  text: "text-muted-foreground" },
};

export function connectionBadge(status) {
  return CONNECTION_BADGES[status] || CONNECTION_BADGES.disconnected;
}

export function isAuthorizedStatus(status) {
  return status === "active" || status === "connected";
}

const VERIFY_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Verification timed out")), ms)),
  ]);
}

/**
 * Re-verify a single account's real connection status via testSocialConnection,
 * which already does the right tiered check server-side: accounts with no
 * usable token (or a username/password "credentials" connection, which can
 * never authenticate these APIs) are flagged instantly with no external
 * call; only accounts with a real access token trigger a live platform ping.
 *
 * If the check itself fails or times out (network blip, not a real
 * "unauthorized" result), this falls back to the account's last-known
 * stored status instead of reporting a false "not authorized" — a slow or
 * failed verification should never make a genuinely-connected account flash
 * red. `verified: false` marks that fallback case.
 */
export async function verifyOneAccount(account) {
  try {
    const res = await withTimeout(
      base44.functions.invoke("testSocialConnection", { account_id: account.id }),
      VERIFY_TIMEOUT_MS
    );
    const data = res?.data ?? res;
    return { status: data?.status || account.status, message: data?.message || "", verified: true };
  } catch (_e) {
    return { status: account.status, message: "Couldn't re-verify this account just now.", verified: false };
  }
}

/**
 * Re-verify a batch of accounts in parallel. `onResult(accountId, result)`
 * fires as soon as each individual check resolves, so fast results show up
 * immediately instead of waiting for the slowest account in the batch.
 */
export async function verifyAccounts(accounts, onResult) {
  await Promise.all(accounts.map(async (acc) => {
    const result = await verifyOneAccount(acc);
    onResult(acc.id, result);
  }));
}
