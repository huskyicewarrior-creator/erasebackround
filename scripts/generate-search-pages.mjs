import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { build } from 'vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Generate real HTML content for guide URLs without a runtime server.
const ssrDir = resolve('.search-render');
try {
  await build({ build: { ssr: 'src/entry-server.tsx', outDir: ssrDir, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'entry.mjs' } } }, configFile: resolve('vite.config.ts'), logLevel: 'warn' });
  const { guides, renderGuides } = await import(pathToFileURL(resolve(ssrDir, 'entry.mjs')).href);
  const origin = (process.env.SITE_ORIGIN || 'https://erasebackround.com').replace(/\/$/, '');
  const base = await readFile('dist/index.html', 'utf8');
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const pages = [
    { path: '/', title: 'Remove Image Backgrounds | erasebackround.com', description: 'Remove image backgrounds and download a transparent PNG. Upload, drag and drop, or paste JPEG, PNG, WebP, and AVIF images.' },
    { path: '/guides', title: 'Image Background Removal Guides | erasebackround.com', description: 'Practical guides to transparent PNGs, AVIF images, green screens, and image background removal workflows.', html: renderGuides() },
    ...guides.map(guide => ({ path: `/guides/${guide.slug}`, title: `${guide.title} | erasebackround.com`, description: guide.description, html: renderGuides(guide.slug) })),
    { path: '/api', title: 'Background Removal API | erasebackround.com', description: 'Learn how to submit an image, check an asynchronous job, and download a transparent PNG through the API.' },
    { path: '/privacy', title: 'Privacy | erasebackround.com', description: 'Read the pre-launch notice about image processing, temporary storage, and service data.' },
  ];
  for (const page of pages) {
    let html = base.replace(/<title>.*?<\/title>/s, `<title>${escape(page.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escape(page.description)}" />`)
      .replace('</head>', `  <link rel="canonical" href="${escape(origin + page.path)}" />\n  </head>`);
    if (page.html) html = html.replace('<div id="root"></div>', `<div id="root"><header class="header"><a class="brand" href="/">erasebackround.com</a><nav aria-label="Main navigation"><a href="/guides">Guides</a><a href="/api">For developers</a></nav></header>${page.html}<footer class="footer"><a href="/guides">Guides</a> · <a href="/privacy">Privacy</a> · <a href="/api">API docs</a></footer></div>`);
    const directory = resolve('dist', '.' + page.path);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), html);
  }
  const urls = pages.filter(page => page.path !== '/privacy').map(page => `  <url><loc>${escape(origin + page.path)}</loc></url>`).join('\n');
  await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  console.log(`Generated ${pages.length} search-ready pages and sitemap for ${origin}`);
} finally {
  await rm(ssrDir, { recursive: true, force: true });
}
