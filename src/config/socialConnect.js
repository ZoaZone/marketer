// socialConnect.js — how a user actually connects each social platform.
//
// The report was "social accounts are showing expired" with no obvious way
// back. Two things were missing: an account whose token had expired offered
// no reconnect action (only a "test connection" refresh that re-confirmed
// the failure), and the add-account form described where to get a token in
// one line of prose with no link — so "get a Page Access Token from
// developers.facebook.com → Graph API Explorer" meant finding that page
// yourself.
//
// Each entry below carries the DIRECT url of the page that issues the
// credential, plus the ordered steps to follow once you are on it.
//
// On username/password: none of these platforms' posting APIs accept one.
// Instagram, Facebook, LinkedIn, TikTok, YouTube, X and Pinterest all
// require an OAuth access token, and a password would not authenticate a
// publish call even if we stored it — which is why the SocialAccount
// entity's "credentials" connection method exists only to read records
// created before that was understood, and why nothing here offers it. The
// honest equivalent of "log in with your username and password" for these
// APIs is: open the link below while signed in to that account, and copy
// the token it issues.

export const PLATFORM_CONNECT = {
  instagram: {
    label: "Instagram",
    url: "https://developers.facebook.com/tools/explorer/",
    urlLabel: "Open Graph API Explorer",
    tokenPlaceholder: "IGQVJXxxxxxxxx",
    steps: [
      "Sign in as the account that manages the Instagram Business profile.",
      "Pick your app, then add the instagram_basic and instagram_content_publish permissions.",
      "Click Generate Access Token and approve the prompt.",
      "Copy the token and paste it below.",
    ],
    note: "Instagram publishing needs a Business or Creator profile linked to a Facebook Page — a personal profile cannot post via the API.",
  },
  facebook: {
    label: "Facebook",
    url: "https://developers.facebook.com/tools/explorer/",
    urlLabel: "Open Graph API Explorer",
    tokenPlaceholder: "EAAxxxxxxxx",
    steps: [
      "Sign in as an admin of the Page you want to post to.",
      "Choose your app, then switch the token dropdown to that Page.",
      "Add the pages_manage_posts and pages_read_engagement permissions.",
      "Generate the Page Access Token and paste it below.",
    ],
    note: "Use the PAGE token, not the user token — a user token cannot publish to a Page.",
  },
  linkedin: {
    label: "LinkedIn",
    url: "https://www.linkedin.com/developers/apps",
    urlLabel: "Open LinkedIn Developer Portal",
    tokenPlaceholder: "AQXxxxxxxxx",
    steps: [
      "Open your app, or create one and verify it against your Company Page.",
      "Under Products, request Share on LinkedIn / Community Management API.",
      "On the Auth tab, generate an OAuth 2.0 access token with w_member_social.",
      "Copy the token and paste it below.",
    ],
    note: "LinkedIn tokens expire after 60 days — expect to reconnect roughly every two months.",
  },
  twitter_x: {
    label: "Twitter / X",
    url: "https://developer.x.com/en/portal/dashboard",
    urlLabel: "Open X Developer Portal",
    tokenPlaceholder: "AAAAAxxxxxxxx",
    steps: [
      "Open your project's app, then Keys and tokens.",
      "Under Authentication Tokens, generate an Access Token and Secret with Read and Write.",
      "Copy the OAuth token and paste it below.",
    ],
    note: "Posting requires a paid Basic tier or above — the free tier is read-only.",
  },
  tiktok: {
    label: "TikTok",
    url: "https://developers.tiktok.com/apps",
    urlLabel: "Open TikTok for Developers",
    tokenPlaceholder: "act.xxxxxxxx",
    steps: [
      "Open your app and add the Content Posting API product.",
      "Complete the app review — unaudited apps can only post to private drafts.",
      "Run the OAuth flow for your account and copy the access token.",
    ],
    note: "TikTok access tokens last 24 hours; the refresh token is what keeps a connection alive long-term.",
  },
  youtube: {
    label: "YouTube",
    url: "https://developers.google.com/oauthplayground/",
    urlLabel: "Open Google OAuth Playground",
    tokenPlaceholder: "ya29.xxxxxxxx",
    steps: [
      "Select the YouTube Data API v3 scope youtube.upload.",
      "Authorize with the Google account that owns the channel.",
      "Exchange the authorization code for tokens and copy the access token.",
    ],
    note: "Google access tokens expire in about an hour, so YouTube usually needs reconnecting per session unless a refresh token is stored.",
  },
  pinterest: {
    label: "Pinterest",
    url: "https://developers.pinterest.com/apps/",
    urlLabel: "Open Pinterest Developers",
    tokenPlaceholder: "pina_xxxxxxxx",
    steps: [
      "Open your app and request standard access if you have not already.",
      "Generate an access token with the boards:write and pins:write scopes.",
      "Copy the token and paste it below.",
    ],
  },
  whatsapp: {
    label: "WhatsApp",
    url: "https://business.facebook.com/wa/manage/",
    urlLabel: "Open WhatsApp Manager",
    sender: true,
    note: "This entry is a sender label only. Delivery uses the WhatsApp Business (Twilio/BSP) credentials in Settings → API Keys.",
  },
  email: {
    label: "Email",
    url: "https://app.sendgrid.com/settings/api_keys",
    urlLabel: "Open SendGrid API Keys",
    sender: true,
    note: "This entry is a sender label only. Delivery uses the SendGrid API key in Settings → API Keys.",
  },
};

export function connectGuide(platform) {
  return PLATFORM_CONNECT[platform] || null;
}

/**
 * Whether a status means "this account needs a fresh credential", as
 * opposed to working or merely still being checked. These are the accounts
 * that get a Reconnect action rather than only a re-test.
 */
export function needsReconnect(status) {
  return status === "expired" || status === "disconnected";
}
