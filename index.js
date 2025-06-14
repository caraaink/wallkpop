const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const slugify = require('slugify');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) console.error('Database error:', err);
  db.run(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT,
    title TEXT,
    year INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Helper function to generate permalink
const generatePermalink = (artist, title) => {
  return slugify(`${artist}-${title}`, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
};

// Panel for manual input
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle post submission from panel
app.post('/panel', (req, res) => {
  const { 'var-artist': artist, 'var-title': title, 'var-year': year } = req.body;
  db.run('INSERT INTO posts (artist, title, year) VALUES (?, ?, ?)', [artist, title, year], function(err) {
    if (err) return res.status(500).send('Error saving post');
    const permalink = generatePermalink(artist, title);
    res.redirect(`/track/${this.lastID}/${permalink}`);
  });
});

// Track page
app.get('/track/:id/:permalink', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
    if (err || !post) return res.status(404).send('Post not found');
    // Fetch related songs (same artist, excluding current post)
    db.all('SELECT id, artist, title FROM posts WHERE artist = ? AND id != ? LIMIT 5', [post.artist, id], (err, related) => {
      if (err) related = [];
      // Replace template variables
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${post.artist} - ${post.title}</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .related { margin-top: 20px; }
            .related ul { list-style: none; padding: 0; }
            .related li { margin: 10px 0; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
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
        </body>
        </html>
      `;
      html = html.replace(/%id%/g, id).replace(/%var-artist%/g, post.artist).replace(/%var-title%/g, post.title);
      res.send(html);
    });
  });
});

// Search page
app.get('/search/:query', (req, res) => {
  const query = `%${req.params.query}%`;
  db.all('SELECT id, artist, title, year FROM posts WHERE artist LIKE ? OR title LIKE ? OR year LIKE ?', [query, query, query], (err, posts) => {
    if (err) return res.status(500).send('Error searching');
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Search Results</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          ul { list-style: none; padding: 0; }
          li { margin: 10px 0; }
          a { color: #007bff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Search Results for "${req.params.query}"</h1>
        <ul>
          ${posts.map(p => `<li><a href="/track/${p.id}/${generatePermalink(p.artist, p.title)}">${p.artist} - ${p.title} (${p.year})</a></li>`).join('')}
        </ul>
        <p><a href="/panel">Back to Panel</a></p>
      </body>
      </html>
    `;
    res.send(html);
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
