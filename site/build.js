/**
 * build.js — Static site builder for chandrasekharnoolu.com
 * Replaces Jekyll. Uses Node.js (built into Netlify — no Ruby needed).
 *
 * What it does:
 *  1. Reads markdown posts from _posts/
 *  2. Converts them to HTML using the _layouts/post.html template
 *  3. Copies all other static files (index.html, blog.html, etc.) to _site/
 *  4. Generates updated blog listing data
 *  5. Injects current year into footers
 */

const fs   = require('fs');
const path = require('path');

// ── Try to load deps, install hint if missing ──
let matter, marked;
try {
  matter = require('gray-matter');
  const { Marked } = require('marked');
  const m = new Marked();
  marked = (src) => m.parse(src);
} catch (e) {
  console.error('Run: npm install  before building.');
  process.exit(1);
}

// ── Config ──
const SRC   = __dirname;
const DEST  = path.join(__dirname, '_site');
const POSTS_DIR = path.join(SRC, '_posts');
const POST_TEMPLATE = path.join(SRC, '_layouts', 'post.html');

// Files/dirs to copy as-is (not processed by Jekyll liquid)
const STATIC_FILES = ['index.html','blog.html','projects.html','contact.html','assets'];
const YEAR = new Date().getFullYear();
const SITE_URL = 'https://chandrasekharnoolu.netlify.app';

// ── Helpers ──
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    fs.readdirSync(src).forEach(f => copyRecursive(path.join(src,f), path.join(dest,f)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'');
}

function readingTime(content) {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function catClass(cat) {
  const map = { 'scm':'scm','oracle scm':'scm','interview':'interview','projects':'projects','case studies':'projects','industry':'industry' };
  return map[(cat||'').toLowerCase()] || 'scm';
}

function catLabel(cat) {
  const map = { 'scm':'Oracle SCM','interview':'Interview Prep','projects':'Case Studies','industry':'Industry' };
  return map[catClass(cat)] || cat || 'Oracle SCM';
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

// Replace Jekyll-style liquid tags used in templates
function renderTemplate(html, vars) {
  return html
    .replace(/\{\{\s*page\.title\s*\}\}/g,       vars.title || '')
    .replace(/\{\{\s*page\.description[^}]*\}\}/g,vars.description || '')
    .replace(/\{\{\s*page\.date[^}]*\}\}/g,       vars.date || '')
    .replace(/\{\{\s*page\.category[^}]*\}\}/g,   vars.categoryLabel || '')
    .replace(/\{\{\s*content\s*\}\}/g,            vars.content || '')
    .replace(/\{\{[^}]*\}\}/g,                    '')   // strip remaining liquid
    .replace(/\{%[^%]*%\}/g,                      '')   // strip liquid blocks
    .replace(/\{\{\s*'now'[^}]*\}\}/g,            String(YEAR))
    .replace(/©.*?Chandra/g, `© ${YEAR} Chandra`)
    .replace(SITE_URL + '{{ page.url }}', '');
}

// ── Main build ──
function build() {
  console.log('\n🔨  Building site...\n');
  ensureDir(DEST);

  // 1. Copy static files
  STATIC_FILES.forEach(f => {
    const src = path.join(SRC, f);
    if (fs.existsSync(src)) {
      const dest = path.join(DEST, f);
      copyRecursive(src, dest);
      console.log(`  ✓ Copied ${f}`);
    }
  });

  // 2. Fix year and Hire Me link in copied HTML files
  ['index.html','blog.html','projects.html','contact.html'].forEach(f => {
    const fp = path.join(DEST, f);
    if (!fs.existsSync(fp)) return;
    let html = fs.readFileSync(fp, 'utf8');
    html = html.replace(/©\s*\{\{[^}]*\}\}/g, `© ${YEAR}`);
    html = html.replace(/©\s*\d{4}\s*Chandra/g, `© ${YEAR} Chandra`);
    fs.writeFileSync(fp, html);
  });

  // 3. Build posts
  if (!fs.existsSync(POSTS_DIR)) { console.log('  ℹ  No _posts/ folder found — skipping posts.'); return finalise(); }
  if (!fs.existsSync(POST_TEMPLATE)) { console.log('  ⚠  _layouts/post.html missing — skipping posts.'); return finalise(); }

  const templateRaw = fs.readFileSync(POST_TEMPLATE, 'utf8');
  const postFiles   = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts       = [];

  postFiles.forEach(filename => {
    // Parse filename: YYYY-MM-DD-slug.md
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
    if (!match) return;
    const [, dateStr, slug] = match;

    const raw    = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
    const parsed = matter(raw);
    const fm     = parsed.data;
    const body   = marked(parsed.content);

    const date        = fm.date ? new Date(fm.date) : new Date(dateStr);
    const title       = fm.title || slug.replace(/-/g,' ');
    const description = fm.description || '';
    const category    = fm.category || 'scm';
    const tags        = fm.tags || [];
    const rt          = readingTime(parsed.content);

    // Build post URL: /blog/YYYY/MM/DD/slug/
    const y = date.getFullYear(), mo = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
    const postUrl = `/blog/${y}/${mo}/${d}/${slug}/`;
    const outDir  = path.join(DEST, 'blog', String(y), mo, d, slug);

    // Build tags HTML
    const tagsHtml = tags.map(t => `<span class="ptag">${t}</span>`).join('');

    // Build sidebar: related posts (filled after all posts parsed — placeholder for now)
    const relatedHtml = `<div id="related-posts-placeholder"></div>`;

    // Assemble post page
    let postHtml = templateRaw;

    // Inject values — replace liquid vars
    postHtml = postHtml
      .replace(/\{\{\s*page\.title\s*\}\}/g, title)
      .replace(/\{\{\s*page\.description[^}]*\}\}/g, description)
      .replace(/\{\{\s*page\.date\s*\|[^}]*\}\}/g, formatDate(date))
      .replace(/\{\{\s*page\.date[^}]*\}\}/g, formatDate(date))
      .replace(/\{\{\s*page\.category[^}]*\}\}/g, catLabel(category))
      .replace(/cat cat-\{\{[^}]*\}\}/g, `cat cat-${catClass(category)}`)
      .replace(/\{\{\s*content\s*\}\}/g, body)
      .replace(/\{\{\s*content\s*\|\s*number_of_words[^}]*\}\}/g, String(rt))
      .replace(/\{\{\s*site\.url\s*\}\}\{\{\s*page\.url\s*\}\}/g, SITE_URL + postUrl)
      .replace(/\{\{ site\.url \}\}\{\{ page\.url \}\}/g, SITE_URL + postUrl)
      // Tags section
      .replace(/\{% if page\.tags %\}[\s\S]*?\{% endif %\}/g,
        tags.length ? `<div style="margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--border);">
          <p style="font-size:0.75rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:0.75rem;">Tags</p>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">${tagsHtml}</div></div>` : '')
      // More posts sidebar
      .replace(/\{% for post in site\.posts[\s\S]*?\{% endfor %\}/g, relatedHtml)
      // Clean up remaining liquid
      .replace(/\{%[^%]*%\}/g, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/©\s*\d{4}\s*Chandra/g, `© ${YEAR} Chandra`);

    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, 'index.html'), postHtml);
    console.log(`  ✓ Built post: ${postUrl}`);

    posts.push({ title, description, date, dateStr: formatDate(date), category: catClass(category), categoryLabel: catLabel(category), tags, url: postUrl, readingTime: rt });
  });

  // 4. Inject "More Posts" sidebar into each built post
  posts.sort((a,b) => b.date - a.date);
  posts.forEach(p => {
    const y = p.date.getFullYear(), mo = String(p.date.getMonth()+1).padStart(2,'0'), d = String(p.date.getDate()).padStart(2,'0');
    const slug = p.url.split('/').filter(Boolean).pop();
    const fp   = path.join(DEST, 'blog', String(y), mo, d, slug, 'index.html');
    if (!fs.existsSync(fp)) return;

    const relatedHtml = posts
      .filter(x => x.url !== p.url)
      .slice(0,4)
      .map(x => `<a href="${x.url}" style="text-decoration:none;display:block;margin-bottom:0.75rem;">
        <p style="font-size:0.82rem;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:0.2rem;">${x.title}</p>
        <p style="font-size:0.72rem;color:var(--light);">${x.dateStr}</p></a>`).join('');

    let html = fs.readFileSync(fp, 'utf8');
    html = html.replace('<div id="related-posts-placeholder"></div>', relatedHtml);
    fs.writeFileSync(fp, html);
  });

  // 5. Inject posts into blog.html (replace Jekyll liquid loop)
  const blogHtml = path.join(DEST, 'blog.html');
  if (fs.existsSync(blogHtml)) {
    let html = fs.readFileSync(blogHtml, 'utf8');

    // Replace post count
    html = html.replace(/\{\{\s*site\.posts\s*\|\s*size\s*\}\}/g, String(posts.length));

    // Build cards HTML
    const cardsHtml = posts.sort((a,b)=>b.date-a.date).map(p => {
      const tagsHtml = p.tags.slice(0,2).map(t=>`<span class="ptag" style="font-size:0.68rem;">${t}</span>`).join('');
      return `<a href="${p.url}" class="post-card" data-cat="${p.category}">
        <div class="post-card-top">
          <span class="cat cat-${p.category}">${p.categoryLabel}</span>
          <span style="font-size:0.72rem;color:var(--light);">${p.dateStr}</span>
        </div>
        <h3>${p.title}</h3>
        <p>${p.description || ''}</p>
        <div class="post-card-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          ${p.readingTime} min read
          <span>·</span>${tagsHtml}
          <span class="read-more" style="margin-left:auto;">Read →</span>
        </div>
      </a>`;
    }).join('\n');

    // Replace Jekyll liquid block for posts
    html = html.replace(/\{% if site\.posts\.size > 0 %\}[\s\S]*?\{% else %\}[\s\S]*?\{% endif %\}/g,
      `<div class="posts-grid" id="posts-grid">\n${cardsHtml}\n</div>`);
    // Also handle simpler for loop if else block was stripped
    html = html.replace(/\{% for post in site\.posts %\}[\s\S]*?\{% endfor %\}/g,
      `<div class="posts-grid" id="posts-grid">\n${cardsHtml}\n</div>`);

    html = html.replace(/\{%[^%]*%\}/g,'').replace(/\{\{[^}]*\}\}/g,'');
    fs.writeFileSync(blogHtml, html);
    console.log(`  ✓ Updated blog.html with ${posts.length} posts`);
  }

  finalise(posts.length);
}

function finalise(postCount = 0) {
  console.log(`\n✅  Build complete → _site/`);
  console.log(`   Pages built: index, blog, projects, contact`);
  console.log(`   Blog posts:  ${postCount}`);
  console.log(`   Deploy _site/ to Netlify\n`);
}

build();
