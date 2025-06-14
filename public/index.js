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
    album TEXT,
    genre TEXT,
    duration TEXT,
    size TEXT,
    size128 TEXT,
    size192 TEXT,
    size320 TEXT,
    bitrate TEXT,
    bitrate128 TEXT,
    bitrate192 TEXT,
    bitrate320 TEXT,
    thumb TEXT,
    link TEXT,
    link2 TEXT,
    url128 TEXT,
    url192 TEXT,
    url320 TEXT,
    hits INTEGER DEFAULT 0,
    lyricstimestamp TEXT,
    lyrics TEXT,
    name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Helper functions (same as before, not repeated)
const getFormattedDate = (format) => { /* ... */ };
const getMetaHeader = (post = null, pageUrl = 'https://wallkpop.vercel.app/') => { /* ... */ };
const getHeader = (searchQuery = '') => { /* ... */ };
const getFooter = (pageUrl) => { /* ... */ };
const parseBlogTags = (template, posts, options = {}) => { /* ... */ };
const generatePermalink = (artist, title) => { /* ... */ };

// Homepage route
app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      ${getMetaHeader()}
    </head>
    <body>
      ${getHeader()}
      <div id="content">
        <h1>Welcome to Wallkpop</h1>
        <p>Download the latest K-Pop music and soundtracks. Use the search or browse our collection!</p>
      </div>
      ${getFooter('https://wallkpop.vercel.app/')}
    </body>
    </html>
  `;
  res.send(html);
});

// Panel route
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel.html'));
});

// Handle post submission from panel
app.post('/panel', (req, res) => {
  const {
    'var-artist': artist,
    'var-title': title,
    'var-year': year,
    'var-album': album,
    'var-genre': genre,
    'var-duration': duration,
    'var-size': size,
    'var-size128': size128,
    'var-size192': size192,
    'var-size320': size320,
    'var-bitrate': bitrate,
    'var-bitrate128': bitrate128,
    'var-bitrate192': bitrate192,
    'var-bitrate320': bitrate320,
    'var-thumb': thumb,
    'var-link': link,
    'var-link2': link2,
    'var-url128': url128,
    'var-url192': url192,
    'var-url320': url320,
    'var-lyricstimestamp': lyricstimestamp,
    'var-lyrics': lyrics,
    'var-name': name
  } = req.body;

  db.run(
    `INSERT INTO posts (
      artist, title, year, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artist, title, year, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ],
    function(err) {
      if (err) return res.status(500).send('Error saving post');
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${this.lastID}/${permalink}`);
    }
  );
});

// Track, Search, and API routes (same as before, not repeated)
app.get('/track/:id/:permalink', (req, res) => { /* ... */ });
app.get('/search/:query', (req, res) => { /* ... */ });
app.post('/api/post', (req, res) => { /* ... */ });

module.exports = app;
