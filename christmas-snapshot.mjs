// One-off: a static copy of the Christmas landing page and the looks gallery, for a public preview link.
//   node snapshot.mjs <origin, e.g. http://127.0.0.1:8841> <out dir>
// Every HTML file lands in the out dir's root and every asset under its own path (fonts/x.woff2), so a root-relative
// address becomes a relative one by dropping its first slash, wherever the folder is served from.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [origin, outDir] = process.argv.slice(2);
const PAGES = { '/christmas-edition': 'index.html', '/christmas-edition/looks': 'looks.html' };
const NOTE = '<div id="preview-note" style="margin:0;padding:12px 16px;background:#fbf6ea;color:#23201a;font:16px/1.5 system-ui,sans-serif;text-align:center">Preview copy for feedback, made ' + new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) + '. Only this page and the looks page work here: every other button and link leads back to this note.</div>';
// A root-relative address of a file, after a quote, a bracket, a comma, a space, an equals sign or an encoded quote.
const ASSET = /(?<=["'(=\s,]|&quot;|&#39;|&#x27;)\/[A-Za-z0-9_\-./]+\.(?:css|woff2|jpg|jpeg|png|svg|webp)(?=[^A-Za-z0-9]|$)/g;
const assets = new Set();
const covers = new Set();

const get = async (p) => {
  const res = await fetch(origin + p, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  if (!res.ok) throw new Error(`${p}: ${res.status}`);
  return res;
};
const relink = (text) => text.replace(ASSET, (m) => { assets.add(m); return m.slice(1); });

function page(html) {
  let s = html;
  s = s.replace(/<div class="demo-banner"[^]*?<\/div>\s*/, '');
  s = s.replace(/<script[^>]*src="\/error-report\.js"[^>]*><\/script>\s*/g, '');
  s = s.replace(/<link rel="canonical"[^>]*>\s*/g, '').replace(/<meta (?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/g, '');
  s = s.replace(/<head>/, '<head>\n<meta name="robots" content="noindex">');
  s = s.replace(/src="\/christmas-edition\/sample\/([a-z]+)\/cover"/g, (_, look) => { covers.add(look); return `src="cover-${look}.html"`; });
  s = s.replace(/href="(\/[^"]*)"/g, (whole, href) => {
    if (ASSET.test(`"${href}`)) { ASSET.lastIndex = 0; return whole; }
    ASSET.lastIndex = 0;
    const [p, frag] = href.split('#');
    if (p === '/christmas-edition/looks') return `href="looks.html${frag ? '#' + frag : ''}"`;
    if (p === '/christmas-edition') return `href="index.html${frag ? '#' + frag : ''}"`;
    return 'href="#preview-note"';
  });
  // The footer's contact address is a placeholder on a local copy: the link goes to the note and its text says Contact.
  s = s.replace(/href="mailto:[^"]*"/g, 'href="#preview-note"').replace(/hello@mantelpost\.local/g, 'Contact');
  s = s.replace(/(<body[^>]*>)/, `$1\n${NOTE}`);
  return relink(s);
}

await mkdir(outDir, { recursive: true });
for (const [p, file] of Object.entries(PAGES)) await writeFile(path.join(outDir, file), page(await (await get(p)).text()));
for (const look of covers) {
  let s = await (await get(`/christmas-edition/sample/${look}/cover`)).text();
  s = s.replace(/<script[^>]*src="\/error-report\.js"[^>]*><\/script>\s*/g, '').replace(/href="(\/[^"]*)"/g, (whole, href) => (/\.(css|svg|woff2|png|jpg)$/.test(href) ? whole : 'href="#"'));
  await writeFile(path.join(outDir, `cover-${look}.html`), relink(s));
}
// Assets, and whatever a stylesheet among them names in turn.
const done = new Set();
let bytes = 0;
while (true) {
  const next = [...assets].find((a) => !done.has(a));
  if (!next) break;
  done.add(next);
  const res = await get(next);
  const file = path.join(outDir, next.slice(1));
  await mkdir(path.dirname(file), { recursive: true });
  if (next.endsWith('.css')) {
    // A stylesheet sits in the root too (styles.css), so its addresses lose their slash the same way.
    if (next.lastIndexOf('/') !== 0) throw new Error(`a stylesheet not in the root: ${next}`);
    const text = relink(await res.text());
    bytes += text.length;
    await writeFile(file, text);
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    bytes += buf.length;
    await writeFile(file, buf);
  }
}
console.log(`pages 2, covers ${covers.size}, assets ${done.size}, asset bytes ${bytes}`);
