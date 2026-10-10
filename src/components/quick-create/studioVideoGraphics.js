export function drawStudioVideoGraphics(ctx, width, height, logo, text) {
  if (logo) {
    const scale = Math.min(width * 0.16 / logo.width, height * 0.18 / logo.height);
    const w = logo.width * scale, h = logo.height * scale;
    ctx.drawImage(logo, width - w - width * 0.04, height * 0.04, w, h);
  }
  if (!text) return;
  const maxWidth = width * 0.84;
  let size = Math.round(width * 0.045), lines;
  do {
    ctx.font = `700 ${size}px Arial, sans-serif`;
    lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.match(/\S+\s*|\s+/g) || []) {
        if (line && ctx.measureText(line + word).width > maxWidth) { lines.push(line); line = ''; }
        if (ctx.measureText(word).width > maxWidth) {
          for (const character of Array.from(word)) {
            if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line); line = ''; }
            line += character;
          }
        } else line += word;
      }
      lines.push(line);
    }
    if (lines.length * size * 1.3 <= height * 0.25) break;
    size -= 1;
  } while (size > 10);
  const lineHeight = size * 1.3, padding = size * 0.7;
  const top = height * 0.93 - lines.length * lineHeight - padding;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(width * 0.05, top - padding, width * 0.9, lines.length * lineHeight + padding * 2);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, width / 2, top + index * lineHeight));
}