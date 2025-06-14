const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const slugify = require('slugify');

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) console.error('Database error:', err);
  db.serialize(() => {
    db.run(`CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist TEXT,
      title TEXT,
      year INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE config (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);
    // Initialize default config values
    db.run(`INSERT OR IGNORE INTO config (key, value) VALUES
      ('meta', '<title>WallKpop</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">'),
      ('header', '<header><h1>WallKpop</h1><nav><a href="/">Home</a> | <a href="/panel">Panel</a></nav></header>'),
      ('index', '<h2>Recent Posts</h2>'),
      ('footer', '<footer><p>&copy; 2025 WallKpop</p></footer>'),
      ('css', 'body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; } a { color: #007bff; text-decoration: none; } a:hover { text-decoration: underline; } ul { list-style: none; padding: 0; } li { margin: 10px 0; }'),
      ('sitemap', '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://wallkpop.vercel.app/</loc></url></urlset>'),
      ('robots', 'User-agent: *\nDisallow: /panel\nAllow: /\nSitemap: https://wallkpop.vercel.app/sitemap.xml')
    `);
  });
});

// Helper function to generate permalink
const generatePermalink = (artist, title) => {
  return slugify(`${artist}-${title}`, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
};

// Fetch config values
const getConfig = (callback) => {
  db.all('SELECT key, value FROM config', (err, rows) => {
    if (err) return callback(err, {});
    const config = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    callback(null, config);
  });
};

// Root route
app.get('/', (req, res) => {
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching config');
    db.all('SELECT id, artist, title FROM posts ORDER BY created_at DESC LIMIT 10', (err, posts) => {
      if (err) return res.status(500).send('Error fetching posts');
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          ${config.meta || ''}
          <style>${config.css || ''}</style>
        </head>
        <body>
          ${config.header || ''}
          ${config.index || ''}
          <ul>
            ${posts.map(p => `<li><a href="/track/${p.id}/${generatePermalink(p.artist, p.title)}">${p.artist} - ${p.title}</a></li>`).join('')}
          </ul>
          ${config.footer || ''}
        </body>
        </html>
      `;
      res.send(html);
    });
  });
});

// Panel for management
app.get('/panel', (req, res) => {
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching config');
    db.all('SELECT id, artist, title, year FROM posts ORDER BY created_at DESC', (err, posts) => {
      if (err) return res.status(500).send('Error fetching posts');
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  });
});

// Handle post and config submissions
app.post('/panel', (req, res) => {
  const {
    'var-artist': artist, 'var-title': title, 'var-year': year,
    action, post_id, meta, header, index, footer, css, sitemap, robots
  } = req.body;

  if (action === 'create_post' && artist && title && year) {
    db.run('INSERT INTO posts (artist, title, year) VALUES (?, ?, ?)', [artist, title, year], function(err) {
      if (err) return res.status(500).send('Error saving post');
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${this.lastID}/${permalink}`);
    });
  } else if (action === 'edit_post' && post_id && artist && title && year) {
    db.run('UPDATE posts SET artist = ?, title = ?, year = ? WHERE id = ?', [artist, title, year, post_id], function(err) {
      if (err) return res.status(500).send('Error updating post');
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${post_id}/${permalink}`);
    });
  } else if (action === 'delete_post' && post_id) {
    db.run('DELETE FROM posts WHERE id = ?', [post_id], function(err) {
      if (err) return res.status(500).send('Error deleting post');
      res.redirect('/panel');
    });
  } else if (action === 'save_config') {
    db.serialize(() => {
      const updates = [
        ['meta', meta || ''],
        ['header', header || ''],
        ['index', index || ''],
        ['footer', footer || ''],
        ['css', css || ''],
        ['sitemap', sitemap || ''],
        ['robots', robots || '']
      ];
      updates.forEach(([key, value]) => {
        db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
      });
      res.redirect('/panel');
    });
  } else {
    res.status(400).send('Invalid request');
  }
});

// Track page
app.get('/track/:id/:permalink', (req, res) => {
  const { id } = req.params;
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching config');
    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
      if (err || !post) return res.status(404).send('Post not found');
      db.all('SELECT id, artist, title FROM posts WHERE artist = ? AND id != ? LIMIT 5', [post.artist, id], (err, related) => {
        if (err) related = [];
        let html = `
          <!DOCTYPE html>
          <html>
          <head>
            ${config.meta || ''}
            <style>${config.css || ''}</style>
          </head>
          <body>
            ${config.header || ''}
            <h1>${post.artist} - ${post.title}</h1>
            <p>Year: ${post.year}</p>
            <p>ID: %id%</p>
            <p>Permalink: wallkpop.vercel.app/track/%id%/${generatePermalink(post.artist, post.title)}</p>
            <h2>Related Songs</h2>
            <div class="related">
              <ul>
                ${related.map(r => `<li><a href="/track/${r.id}/${generatePermalink(r.artist, r.title)}">${r.artist} - ${r.title}</a></li>`).join('')}
              </ul>
            </div>
            <p><a href="/panel">Back to Panel</a></p>
            ${config.footer || ''}
          </body>
          </html>
        `;
        html = html.replace(/%id%/g, id).replace(/%var-artist%/g, post.artist).replace(/%var-title%/g, post.title);
        res.send(html);
      });
    });
  });
});

// Search page
app.get('/search/:query', (req, res) => {
  const query = `%${req.params.query}%`;
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching config');
    db.all('SELECT id, artist, title, year FROM posts WHERE artist LIKE ? OR title LIKE ? OR year LIKE ?', [query, query, query], (err, posts) => {
      if (err) return res.status(500).send('Error searching');
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          ${config.meta || ''}
          <style>${config.css || ''}</style>
        </head>
        <body>
          ${config.header || ''}
          <h1>Search Results for "${req.params.query}"</h1>
          <ul>
            ${posts.map(p => `<li><a href="/track/${p.id}/${generatePermalink(p.artist, p.title)}">${p.artist} - ${p.title} (${p.year})</a></li>`).join('')}
          </ul>
          <p><a href="/panel">Back to Panel</a></p>
          ${config.footer || ''}
        </body>
        </html>
      `;
      res.send(html);
    });
  });
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching sitemap');
    res.set('Content-Type', 'text/xml');
    res.send(config.sitemap || '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://wallkpop.vercel.app/</loc></url></urlset>');
  });
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
  getConfig((err, config) => {
    if (err) return res.status(500).send('Error fetching robots.txt');
    res.set('Content-Type', 'text/plain');
    res.send(config.robots || 'User-agent: *\nDisallow: /panel\nAllow: /\nSitemap: https://wallkpop.vercel.app/sitemap.xml');
  });
});

// API for posting
app.post('/api/post', (req, res) => {
  const { artist, title, year } = req.body;
  if (!artist || !title || !year) return res.status(400).json({ error: 'Missing required fields' });
  db.run('INSERT INTO posts (artist, title, year) VALUES (?, ?, ?)', [artist, title, year], function(err) {
    if (err) return res.status(500).json({ error: 'Error saving post' });
    const permalink = generatePermalink(artist, title);
    res.json({ id: this.lastID, permalink: `/track/${this.lastID}/${permalink}` });
  });
});

// Vercel serverless entry point
module.exports = app;
