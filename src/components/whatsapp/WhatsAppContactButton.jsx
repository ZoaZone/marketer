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

/** WhatsApp's glyph, inlined so the button paints with the first frame. */
function WhatsAppGlyph({ className = 'w-6 h-6' }) {
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
 * Floating action button.
 *
 * `bottomOffset` exists because most of these apps already pin a chat or
 * quick-action widget to the bottom-right corner. Rather than let two circles
 * overlap, each app passes the distance that stacks this one clear of whatever
 * it already has there.
 *
 * That offset is *added* to env(safe-area-inset-bottom) rather than replacing
 * it, so the button clears the iPhone home indicator in portrait and the notch
 * in landscape whatever the stacking distance. env() carries a 0px fallback,
 * so browsers that do not know the function get the plain offset.
 */
export function WhatsAppFloatingButton({
  appName,
  service,
  text,
  label = 'Chat with us',
  bottomOffset = '1.5rem',
}) {
  const accessibleLabel = `Message ${appName} on WhatsApp`;
  return (
    <a
      href={whatsappContactUrl({ appName, service, text })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset})`,
      }}
      className={
        'group fixed z-40 flex items-center gap-0 sm:hover:gap-2 ' +
        // 56px: comfortably past the 44px minimum touch target on both
        // platforms, and the size a thumb expects a FAB to be.
        'h-14 min-w-[3.5rem] rounded-full px-4 ' +
        'text-white bg-[#25D366] hover:bg-[#1FB855] ' +
        'shadow-lg shadow-black/20 hover:shadow-xl ' +
        'transition-[background-color,box-shadow,transform] duration-200 ' +
        'hover:scale-105 active:scale-95 ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 ' +
        'motion-reduce:transition-none motion-reduce:hover:scale-100'
      }
    >
      <WhatsAppGlyph className="w-7 h-7 shrink-0" />
      {/*
        The wordmark expands on hover on pointer devices only. On a phone the
        button stays a circle: there is no hover there, so an always-open pill
        would just cover more of the page it is floating over.
      */}
      <span
        className={
          'hidden sm:inline-block overflow-hidden whitespace-nowrap ' +
          'max-w-0 opacity-0 group-hover:max-w-[10rem] group-hover:opacity-100 ' +
          'font-semibold text-sm ' +
          'transition-[max-width,opacity] duration-300 ' +
          'motion-reduce:transition-none'
        }
      >
        {label}
      </span>
    </a>
  );
}

export default WhatsAppFloatingButton;
