# Brand assets

Four files belong here. They were processed from the originals so the near-black
background matches the app's own `#0a0a0a` and the outer edge feathers to alpha —
that is what stops the logo showing as a rectangle on the dark UI.

| File            | Size    | Used by |
|-----------------|---------|---------|
| `wordmark.png`  | 560×179 | Home footer, Pricing header |
| `icon.png`      | 320×320 | favicon, apple-touch-icon, manifest, Dashboard, AdminLogin, FreeTrial, PostPaymentOnboarding, WidgetHost |
| `lockup-h.png`  | 600×321 | Sidebar header, Home hero, Open Graph / Twitter preview |
| `lockup-v.png`  | 360×481 | Auth / sign-in card |

The previously vendored `logo-mark.jpeg` and `logo-wordmark.jpg` have been deleted:
they carried the wrong wordmark text. Every `<img>` referencing these paths has an
`onError` handler that hides it, so until the files are added the pages fall back to
their text branding rather than showing a broken image.

Crop any replacement TIGHT to the artwork. The original `/logo.png` was a
1024×1024 square whose mark filled only the middle ~17% of the height, which is
why it rendered about 16px tall in a 96px sidebar box.
