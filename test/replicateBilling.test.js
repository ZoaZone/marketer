// Replicate billing failures (HTTP 402 — account out of credit).
//
// This is the one Replicate failure that is neither transient nor fixable
// in code, and it has to behave differently from every other error:
//
//   - It must be typed, so callers can tell "the account is unfunded" from
//     "this model hiccuped".
//   - video.js must NOT fail over to the second model, because both models
//     bill the SAME account on the SAME token — the failover is guaranteed
//     to fail too, and in practice it drew a burst of 429s that buried the
//     real "insufficient credit" message in the logs.
//   - The client must mark it `.billing` so the UI raises it instead of
//     quietly degrading to "the still image will be used instead", which is
//     how an out-of-credit account presented as a cosmetic quality issue.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  replicateFetch,
  isReplicateBillingError,
  isRetryableReplicateError,
} from "../server-render/replicate.js";
import { asProviderError } from "@/utils/aiClient.js";

// aiClient imports the Base44 SDK client, which builds a real client at
// module load. Stub it — these tests exercise pure error classification and
// never touch the network.
vi.mock("@/api/base44Client", () => ({ base44: {} }));

const REPLICATE_402_BODY = {
  detail:
    "You have insufficient credit to run this model. Go to " +
    "https://replicate.com/account/billing#billing to purchase credit.",
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 402 ? "Payment Required" : "Error",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Replicate billing errors", () => {
  it("types a 402 as a billing error, not a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(402, REPLICATE_402_BODY)));

    await expect(
      replicateFetch("https://api.replicate.com/v1/predictions", { token: "t", method: "POST", body: {} }),
    ).rejects.toSatisfy((e) => isReplicateBillingError(e));
  });

  it("does NOT mark a 402 retryable — retrying an unfunded account is pointless", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(402, REPLICATE_402_BODY)));

    const err = await replicateFetch("https://api.replicate.com/v1/predictions", {
      token: "t", method: "POST", body: {},
    }).catch((e) => e);

    expect(isReplicateBillingError(err)).toBe(true);
    expect(isRetryableReplicateError(err)).toBeFalsy();
  });

  it("keeps Replicate's own actionable wording in the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(402, REPLICATE_402_BODY)));

    const err = await replicateFetch("https://api.replicate.com/v1/predictions", {
      token: "t", method: "POST", body: {},
    }).catch((e) => e);

    expect(err.message).toMatch(/insufficient credit/i);
    expect(err.message).toMatch(/replicate\.com\/account\/billing/);
  });

  it("still treats 429 as retryable, not as billing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(429, { detail: "Too Many Requests" })));

    const err = await replicateFetch("https://api.replicate.com/v1/predictions", {
      token: "t", method: "POST", body: {},
    }).catch((e) => e);

    expect(isRetryableReplicateError(err)).toBe(true);
    expect(isReplicateBillingError(err)).toBe(false);
  });

  it("still treats a 422 as a plain, non-billing failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(422, { detail: "Invalid input" })));

    const err = await replicateFetch("https://api.replicate.com/v1/predictions", {
      token: "t", method: "POST", body: {},
    }).catch((e) => e);

    expect(isReplicateBillingError(err)).toBe(false);
    expect(isRetryableReplicateError(err)).toBeFalsy();
  });
});

describe("client-side billing classification", () => {
  it("marks a worker error carrying Replicate's credit wording as billing", () => {
    const err = asProviderError(
      "Replicate account has insufficient credit: You have insufficient credit to run this model.",
    );
    expect(err.billing).toBe(true);
  });

  it("leaves an ordinary generation failure unmarked", () => {
    const err = asProviderError("Both video models failed. Primary (kling): timed out.");
    expect(err.billing).toBeUndefined();
  });

  it("leaves a timeout unmarked", () => {
    expect(asProviderError("Video generation timed out. Please try again.").billing).toBeUndefined();
  });
});
