import { createServer } from 'node:http';

// Manual clipboard harness: generated, non-sensitive images for a real browser.
// No LinkedIn automation, authentication access, or external requests.
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>PasteStack clipboard test</title>
<style>
body { max-width: 900px; margin: 60px auto; padding: 0 24px; font: 16px/1.5 system-ui; color: #182b42; background: #f7f9fc; }
h1 { margin-bottom: 4px; } p { color: #52657c; }
main { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 28px; }
article { flex: 1; min-width: 220px; padding: 14px; background: white; border: 1px solid #d5dfec; border-radius: 14px; }
canvas { display: block; width: 100%; border-radius: 8px; margin-bottom: 12px; }
button { font: inherit; color: white; background: #0a66c2; border: 0; border-radius: 20px; padding: 8px 16px; cursor: pointer; }
button:focus-visible { outline: 3px solid #874800; outline-offset: 3px; }
</style>
<h1>PasteStack clipboard test</h1>
<p>Copy these generated images one at a time, then paste into an unpublished LinkedIn draft.</p>
<p>No post is published by this page. Keep your real drafts separate.</p>
<main></main><p role="status" aria-live="polite">Choose an image to copy.</p>
<script>
const colors = ['#0a66c2', '#147d77', '#7451a8'];
colors.forEach((color, index) => {
  const card = document.createElement('article');
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 540;
  const context = canvas.getContext('2d');
  context.fillStyle = color; context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#ffffff22'; context.beginPath(); context.arc(850, 30, 240, 0, Math.PI * 2); context.fill();
  context.fillStyle = 'white'; context.font = '600 56px system-ui'; context.fillText('PasteStack test ' + (index + 1), 60, 260);
  context.font = '28px system-ui'; context.fillText('Clipboard image · unpublished test', 60, 330);
  const button = document.createElement('button');
  button.textContent = 'Copy image ' + (index + 1);
  button.onclick = async () => {
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      document.querySelector('[role=status]').textContent = 'Copied image ' + (index + 1) + '. Paste it into your LinkedIn draft.';
    } catch (error) {
      document.querySelector('[role=status]').textContent = 'Copy failed: ' + error.message;
    }
  };
  card.append(canvas, button); document.querySelector('main').append(card);
});
</script></html>`;

const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html);
});
server.listen(0, '127.0.0.1', () => {
  console.log(`PasteStack manual test: http://127.0.0.1:${server.address().port}`);
  console.log('Press Ctrl+C to stop. This server is accessible only on your computer.');
});
