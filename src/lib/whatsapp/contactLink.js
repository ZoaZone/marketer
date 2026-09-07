/**
 * Builds the wa.me deep link behind the public "message us on WhatsApp"
 * buttons.
 *
 * Kept separate from the components, and free of any framework import, so the
 * encoding rules below can be asserted directly by the test suite. The link is
 * the whole feature: if the text is encoded wrongly the button still looks
 * fine and still opens WhatsApp, just with a mangled message, which is exactly
 * the kind of break nobody notices in review.
 */

/**
 * The public WhatsApp Business number, in the digits-only form wa.me wants —
 * no '+', no spaces, no punctuation.
 *
 * This is the number a visitor messages. It is deliberately a plain constant
 * and not an environment variable: it is public information printed on a
 * button, so hiding it buys nothing, and a missing env var would silently ship
 * a dead link.
 */
export const WHATSAPP_CONTACT_NUMBER = '12566998899';

/**
 * Percent-encode message text for a wa.me query string.
 *
 * encodeURIComponent leaves !'()*~ unescaped because they are legal URI
 * "mark" characters. That is fine for a spec-compliant parser and not fine
 * here: an apostrophe is the most common character in these messages ("I'd
 * like to..."), and encoding it keeps the URL safe to paste into places that
 * treat a bare quote as a delimiter — chat clients, HTML attributes, shell
 * commands, spreadsheet cells.
 */
export function encodeWhatsAppText(text) {
  return encodeURIComponent(String(text)).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The greeting pre-filled into the visitor's compose box.
 *
 * Written in the visitor's voice, not ours — it is a message they are about to
 * send, and it should read like something a person would type. Naming both the
 * app and the service means the reply lands with enough context to answer,
 * which matters when one number is shared across every app in the portfolio.
 */
export function contactMessage(appName, service) {
  return `Hi ${appName} team, I'd like to learn more about ${service}.`;
}

/**
 * Full wa.me URL for a contact button.
 *
 * `text` overrides the generated greeting when a caller needs to say something
 * more specific than "tell me about this product" — a pricing page asking
 * about a named plan, say.
 */
export function whatsappContactUrl({
  appName,
  service,
  text,
  phone = WHATSAPP_CONTACT_NUMBER,
} = {}) {
  const message = text || contactMessage(appName, service);
  return `https://wa.me/${phone}?text=${encodeWhatsAppText(message)}`;
}
