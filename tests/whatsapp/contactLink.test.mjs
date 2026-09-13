/**
 * Unit tests for src/lib/whatsapp/contactLink.js.
 * Run with: npm run test:whatsapp
 */
import {
  WHATSAPP_CONTACT_NUMBER,
  encodeWhatsAppText,
  contactMessage,
  whatsappContactUrl,
} from '../../src/lib/whatsapp/contactLink.js';

describe('the wa.me link', () => {
  test('reproduces the link from the specification exactly', () => {
    // Pinned character for character. The button is only ever as correct as
    // this string, and a "harmless" encoding change here reaches every app.
    expect(whatsappContactUrl({ appName: 'AEVOICE', service: 'Soft Engine' })).toBe(
      'https://wa.me/12566998899?text=Hi%20AEVOICE%20team%2C%20I%27d%20like%20to' +
        '%20learn%20more%20about%20Soft%20Engine.',
    );
  });

  test('addresses the public business number in the digits-only form wa.me wants', () => {
    // A '+' or a space here produces a link that opens WhatsApp on a blank
    // chat, which looks like the button working and is not.
    expect(WHATSAPP_CONTACT_NUMBER).toBe('12566998899');
    expect(WHATSAPP_CONTACT_NUMBER).toMatch(/^[0-9]+$/);
  });

  test('sends the visitor to a chat with a message already written', () => {
    const url = whatsappContactUrl({ appName: 'FlowSync', service: 'Workflow Automation' });
    expect(url.startsWith('https://wa.me/12566998899?text=')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(
      "Hi FlowSync team, I'd like to learn more about Workflow Automation.",
    );
  });

  test('an explicit text overrides the generated greeting', () => {
    const url = whatsappContactUrl({
      appName: 'FlowSync',
      service: 'Workflow Automation',
      text: 'Question about the Scale plan',
    });
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('Question about the Scale plan');
  });
});

describe('message text encoding', () => {
  test("encodes the apostrophe encodeURIComponent leaves bare", () => {
    // The apostrophe in "I'd" is the character most likely to break a URL that
    // gets pasted into an attribute, a shell, or a chat client.
    expect(encodeWhatsAppText("I'd")).toBe('I%27d');
  });

  test('encodes the remaining URI marks encodeURIComponent skips', () => {
    expect(encodeWhatsAppText('!()*')).toBe('%21%28%29%2A');
  });

  test('survives a round trip', () => {
    const message = "Hi Zoa Zone team, I'd like to learn more about Payroll & Billing (India)!";
    expect(decodeURIComponent(encodeWhatsAppText(message))).toBe(message);
  });

  test('encodes the separators that would otherwise truncate the message', () => {
    const encoded = encodeWhatsAppText('a&b=c#d');
    expect(encoded).not.toMatch(/[&=#]/);
    expect(decodeURIComponent(encoded)).toBe('a&b=c#d');
  });

  test('carries non-ASCII text through as UTF-8', () => {
    expect(decodeURIComponent(encodeWhatsAppText('नमस्ते'))).toBe('नमस्ते');
  });
});

describe('the greeting', () => {
  test('names both the app and the service', () => {
    // One number answers every app in the portfolio, so a greeting that says
    // only "tell me more" arrives with no way to route it.
    const message = contactMessage('HelloBiz', 'the AI Business Platform');
    expect(message).toContain('HelloBiz');
    expect(message).toContain('the AI Business Platform');
  });

  test('is written in the visitor’s voice, since the visitor is the sender', () => {
    expect(contactMessage('PDFMaster', 'Pro PDF Tools')).toBe(
      "Hi PDFMaster team, I'd like to learn more about Pro PDF Tools.",
    );
  });
});
