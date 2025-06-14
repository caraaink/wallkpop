const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const slugify = require('slugify');
const fs = require('fs').promises;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize SQLite database with file persistence
const dbPath = path.join(__dirname, 'posts.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    fs.access(dbPath).catch(() => {
      console.log('Database file not found, initializing...');
      db.run(`CREATE TABLE IF NOT EXISTS posts (
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
  }
});

// Helper functions
const getFormattedDate = (format) => {
  const date = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const formats = {
    'Y-m-d': `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    'Y': `${date.getFullYear()}`,
    'H:i': `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
  return formats[format] || date.toISOString().split('T')[0];
};

const generatePermalink = (artist, title) => {
  return slugify(`${artist}-${title}`, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
};

const readFile = async (filePath) => {
  try {
    return await fs.readFile(path.join(__dirname, 'public', filePath), 'utf-8');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return '';
  }
};

const parseBlogTags = async (template) => {
  const regex = /\[blog\](.*?)\[\/blog\]/g;
  let match;
  let result = template;

  while ((match = regex.exec(template)) !== null) {
    const content = match[1];
    const params = content.split(',').reduce((acc, param) => {
      const [key, value] = param.split('=');
      acc[key] = value || true;
      return acc;
    }, {});
    const { bid, o, t, l, v, s, no } = params;

    let query = 'SELECT * FROM posts';
    const conditions = [];
    if (bid) conditions.push(`genre LIKE '%${bid}%'`);
    if (o) conditions.push(`ORDER BY ${o === 'h' ? 'hits' : o === 'u' ? 'created_at' : 'id'} ${t === 'week' || t === 'month' ? 'DESC' : ''}`);
    if (l) conditions.push(`LIMIT ${l}`);
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    const posts = await new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => (err ? reject(err) : resolve(rows)));
    }).catch(err => {
      console.error('Database query error:', err);
      return [];
    });

    let blogContent = '';
    if (posts.length > 0) {
      posts.forEach((post, index) => {
        let item = no || '';
        const permalink = generatePermalink(post.artist, post.title);
        item = item.replace(/%id%/g, post.id)
                  .replace(/%var-artist%/g, post.artist || '')
                  .replace(/%var-title%/g, post.title || '')
                  .replace(/%var-album%/g, post.album || '')
                  .replace(/%var-genre%/g, post.genre || '')
                  .replace(/%var-duration%/g, post.duration || '')
                  .replace(/%var-size%/g, post.size || '')
                  .replace(/%var-thumb%/g, post.thumb || 'https://via.placeholder.com/60')
                  .replace(/%hits%/g, post.hits || 0)
                  .replace(/%sn%/g, index + 1)
                  .replace(/::date::/g, getFormattedDate('Y-m-d'))
                  .replace(/::date=H:i::/g, getFormattedDate('H:i') + ' UTC')
                  .replace(/\/site-track\.html\?to-file=%id%/g, `/track/${post.id}/${permalink}`);
        blogContent += item;
      });
    } else {
      blogContent = no || '<center>No posts available</center>';
    }
    result = result.replace(match[0], blogContent);
  }
  return result;
};

// Homepage and index.html route
app.get(['/', '/index.html'], async (req, res) => {
  const metaheader = await readFile('metaheader');
  const header = await readFile('header').then(headerContent => headerContent.replace('<ul>', '<ul><li><a href="/">Home</a></li><li><a href="/search/ost">OST</a></li><li><a href="https://meownime.wapkizs.com/">Anime</a></li>'));
  const footer = await readFile('footer');
  const style = await readFile('style.css');
  let content = await readFile('index.html');
  content = await parseBlogTags(content);
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      ${metaheader}
      <style>${style}</style>
    </head>
    <body>
      ${header}
      ${content}
      ${footer}
    </body>
    </html>
  `;
  res.send(html);
});

// Panel route
app.get('/panel', async (req, res) => {
  const metaheader = await readFile('metaheader');
  const panel = await readFile('panel.html');
  const style = await readFile('style.css');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      ${metaheader}
      <style>${style}</style>
    </head>
    <body>
      ${panel}
    </body>
    </html>
  `;
  res.send(html);
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
      if (err) {
        console.error('POST error:', err);
        return res.status(500).send(`Error saving post: ${err.message}`);
      }
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${this.lastID}/${permalink}`);
    }
  );
});

// Track route
app.get('/track/:id/:permalink', async (req, res) => {
  const { id, permalink } = req.params;
  const post = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, row) => (err ? reject(err) : resolve(row)));
  }).catch(err => {
    console.error('Track query error:', err);
    return null;
  });
  if (post && generatePermalink(post.artist, post.title) === permalink) {
    res.send(`Track: ${post.artist} - ${post.title}`);
  } else {
    res.status(404).send('Track not found');
  }
});

module.exports = app;
