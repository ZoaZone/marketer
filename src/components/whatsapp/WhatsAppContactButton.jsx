import React from 'react';
import { whatsappContactUrl } from '@/lib/whatsapp/contactLink';

/**
 * Public "message us on WhatsApp" buttons: a floating action button pinned to
 * the viewport and a compact icon button for the header.
 *
 * Both are plain anchors to a wa.me link rather than anything scripted. That
 * keeps them working with JavaScript still loading, lets the browser hand off
 * to the installed WhatsApp app on iOS and Android instead of opening a web
 * tab, and means a long-press offers "copy link" like any other link.
 *
 * Deliberately no library and no brand-colour token: #25D366 is WhatsApp's,
 * not this app's, and it must stay that green in every theme these apps ship.
 */

/**
 * WhatsApp's glyph, inlined so the button paints with the first frame.
 * Exported so the unified contact widget (src/components/support/ContactWidget)
 * can label its WhatsApp tab with the same mark instead of a second copy.
 */
export function WhatsAppGlyph({ className = 'w-6 h-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Header button. Icon-only so it survives a crowded nav, but with an
 * accessible name and a tooltip, because an unlabelled icon in a row of worded
 * links reads as decoration.
 */
export function WhatsAppNavButton({ appName, service, text, className = '' }) {
  const label = `Message ${appName} on WhatsApp`;
  return (
    <a
      href={whatsappContactUrl({ appName, service, text })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center justify-center h-10 w-10 rounded-full ' +
        'text-white bg-[#25D366] hover:bg-[#1FB855] ' +
        'shadow-sm hover:shadow-md ' +
        'transition-[background-color,box-shadow,transform] duration-200 ' +
        'hover:-translate-y-0.5 active:translate-y-0 ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 ' +
        className
      }
    >
      <WhatsAppGlyph className="w-5 h-5" />
    </a>
  );
}

/**
 * WhatsApp button that attaches to the app's own chat launcher rather than
 * competing with it.
 *
 * The first version of this was a full-size floating action button of its own.
 * That was wrong: every app here already pins a chat launcher to the
 * bottom-right, so the page ended up with two equal-weight circles in the same
 * corner and no way to tell which one was the app's own support channel. Worse,
 * where the app's launcher was missing the WhatsApp button was the *only* thing
 * in the corner, which read as "this product's chat is WhatsApp".
 *
 * So it is deliberately secondary: smaller than the launcher (44px against
 * 56px), and sitting directly above it in the same column so the two read as
 * one control with a second option, not as two rival buttons.
 *
 * Two ways to place it:
 *
 * - Inside the app's launcher stack (the usual case). The chat component
 *   already renders a `flex flex-col items-end` container; drop this in above
 *   its button and the existing gap does the spacing.
 * - `fixedAbove` for the apps whose chat launcher is a lone fixed button with
 *   no stack to join. Pass the distance that puts this one just above it.
 *   Still additive to env(safe-area-inset-bottom), so it clears the iPhone
 *   home indicator either way.
 *
 * The z-index sits below a chat panel on purpose: when someone opens the chat,
 * the panel should cover this, not fight it.
 */
export function WhatsAppDockButton({
  appName,
  service,
  text,
  fixedAbove,
}) {
  const accessibleLabel = `Message ${appName} on WhatsApp`;
  return (
    <a
      href={whatsappContactUrl({ appName, service, text })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      style={
        fixedAbove
          ? {
              right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${fixedAbove})`,
            }
          : undefined
      }
      className={
        (fixedAbove ? 'fixed z-40 ' : '') +
        // 44px: the platform minimum touch target, and clearly subordinate to
        // the 56px launcher it sits above.
        'inline-flex items-center justify-center h-11 w-11 rounded-full shrink-0 ' +
        'text-white bg-[#25D366] hover:bg-[#1FB855] ' +
        'shadow-lg shadow-black/20 hover:shadow-xl ' +
        'transition-[background-color,box-shadow,transform] duration-200 ' +
        'hover:scale-105 active:scale-95 ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 ' +
        'motion-reduce:transition-none motion-reduce:hover:scale-100'
      }
    >
      <WhatsAppGlyph className="w-6 h-6" />
    </a>
  );
}

export default WhatsAppDockButton;
