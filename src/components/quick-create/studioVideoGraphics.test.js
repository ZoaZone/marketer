import { describe, it, expect, vi } from 'vitest';
import { drawStudioVideoGraphics } from '@/components/quick-create/studioVideoGraphics';

const context = () => ({ drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), measureText: text => ({ width: Array.from(text).length * 14 }) });

describe('Studio exact video graphics', () => {
  it('draws approved words without changing spelling or truncating them', () => {
    const ctx = context();
    const text = 'DigitalStudios.app: Compassionate care for your pets!';
    drawStudioVideoGraphics(ctx, 720, 1280, null, text);
    expect(ctx.fillText.mock.calls.map(call => call[0]).join('')).toBe(text);
  });
  it('preserves non-Latin text and punctuation', () => {
    const ctx = context();
    const text = 'మీ పెంపుడు జంతువులకు ప్రేమతో సంరక్షణ';
    drawStudioVideoGraphics(ctx, 720, 1280, null, text);
    expect(ctx.fillText.mock.calls.map(call => call[0]).join('')).toBe(text);
  });
  it('keeps explicit line breaks and every line', () => {
    const ctx = context();
    drawStudioVideoGraphics(ctx, 1280, 720, null, 'Welcome\nCare with compassion');
    expect(ctx.fillText.mock.calls.map(call => call[0])).toEqual(['Welcome', 'Care with compassion']);
  });
  it('keeps the logo proportions inside the corner area', () => {
    const ctx = context(), logo = { width: 1000, height: 100 };
    drawStudioVideoGraphics(ctx, 1280, 720, logo, '');
    const [, x, y, w, h] = ctx.drawImage.mock.calls[0];
    expect(w / h).toBe(10);
    expect(x + w).toBeLessThan(1280); expect(y + h).toBeLessThan(720);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});