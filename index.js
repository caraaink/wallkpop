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
    size320 TEXT,
    bitrate TEXT,
    bitrate128 TEXT,
    bitrate320 TEXT,
    availablebitrate128 TEXT,
    availablebitrate320 TEXT,
    thumb TEXT,
    link TEXT,
    link2 TEXT,
    url128 TEXT,
    url320 TEXT,
    hits INTEGER DEFAULT 0,
    lyricstimestamp TEXT,
    available TEXT,
    availabletimestamp TEXT,
    name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Helper function to generate permalink
const generatePermalink = (artist, title) => {
  return slugify(`${artist}-${title}`, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
};

// Helper function to get current date/time
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

// Header template
const getHeader = (searchQuery = '') => `
  <div>
    <header>
      <h1 title="title"><a href="/" title="Download K-Pop Music MP3">Wallkpop</a></h1>
      <h2 title="description">Download Latest K-Pop Music & Soundtrack K-Drama. in Small Size</h2>
      <nav>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="https://metrolagu.wapkiz.mobi/">K-Pop</a></li>
          <li><a href="/search/ost">OST</a></li>
          <li><a href="https://meownime.wapkizs.com/">Anime</a></li>
        </ul>
      </nav>
      <div id="search">
        <form action="/search" method="get">
          <input class="inp-text" type="text" maxlength="100" placeholder="Enter Music Keywords..." autocomplete="off" value="${searchQuery}" name="to-q">
          <input class="inp-btn" type="submit" value="Search">
        </form>
      </div>
    </header>
  </div>
`;

// Footer template
const getFooter = (pageUrl) => `
  <footer>
    <div class="footer">
      <div class="menufot">
        <p>We are <i>K-Pop lovers</i> who spread the love for k-music. The site does not store any files on its server. All contents are for promotion only. Please support the artists by purchasing their CDs.</p>
      </div>
      <div class="center">
        <a href="https://www.facebook.com/wallkpop.official" title="Follow Facebook" style="background:#1877F2;color:#fff;padding:3px 8px;margin:1px;border:1px solid #ddd;font-weight:bold;border-radius:4px;display:inline-block;" target="_blank">Facebook</a>
        <a href="https://www.instagram.com/wallkpop.official" title="Follow Instagram" style="background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);color:#ffffff;padding:3px 8px;margin:1px;font-weight:bold;border:1px solid #ddd;border-radius:4px;display:inline-block;" target="_blank">Instagram</a>
        <a href="https://x.com/wallkpop_mp3" title="Follow X" style="background:#000000;color:#ffffff;padding:3px 8px;margin:1px;font-weight:bold;border:1px solid #ddd;border-radius:4px;display:inline-block;" target="_blank">X</a>
        <a href="whatsapp://send?text=Wallkpop | Download Latest K-Pop Music MP3%0a%20${pageUrl}" title="Bagikan ke WhatsApp" style="background:#019C00;color:#ffffff;padding:3px 8px;margin:1px;font-weight:bold;border:1px solid #ddd;border-radius:4px;display:inline-block;">WA</a>
        <a href="https://t.me/wallkpopmp3" title="Join Telegram" style="background:#0088CC;color:#ffffff;padding:3px 8px;margin:1px;font-weight:bold;border:1px solid #ddd;border-radius:4px;display:inline-block;" target="_blank">Telegram</a>
        <a href="https://www.threads.com/@wallkpop.official" title="Follow Threads" style="background:#000000;color:#ffffff;padding:3px 8px;margin:1px;font-weight:bold;border:1px solid #ddd;border-radius:4px;display:inline-block;" target="_blank">Threads</a>
        <br><br>
        <div class="kiri">
          <a href="#">Disclaimer</a>
        </div>
        2019 - ${getFormattedDate('Y')} WALLKPOP Network.
        <div class="kanan">
          <a href="#" id="gotop" rel="nofollow" name="gotop">TOP</a>
        </div>
      </div>
      <br>
      <center><i>Ilkpop - Matikiri - Wallkpop</i></center>
    </div>
  </footer>
`;

// Parse [blog] tags
const parseBlogTags = (template, posts, options = {}) => {
  const { limit = 10, order = 'created_at DESC', noMessage = '<center>No File</center>', to = ':url-1(:to-file:):' } = options;
  if (!posts || posts.length === 0) return noMessage;

  let result = '';
  posts.slice(0, limit).forEach((post, index) => {
    let item = template;
    item = item.replace(/%id%/g, post.id)
      .replace(/%var-artist%/g, post.artist)
      .replace(/%var-title%/g, post.title)
      .replace(/%title%/g, `${post.artist} - ${post.title}`)
      .replace(/%var-album%/g, post.album || 'Unknown')
      .replace(/%var-genre%/g, post.genre || 'K-Pop')
      .replace(/%var-duration%/g, post.duration || 'Unknown')
      .replace(/%var-size%/g, post.size || 'Unknown')
      .replace(/%var-size128%/g, post.size128 || post.size || 'Unknown')
      .replace(/%var-size320%/g, post.size320 || post.size || 'Unknown')
      .replace(/%var-bitrate%/g, post.bitrate || '192')
      .replace(/%var-bitrate128%/g, post.bitrate128 || '128')
      .replace(/%var-bitrate320%/g, post.bitrate320 || '320')
      .replace(/%var-availablebitrate128%/g, post.availablebitrate128 || 'on')
      .replace(/%var-availablebitrate320%/g, post.availablebitrate320 || 'off')
      .replace(/%var-thumb%/g, post.thumb || 'https://via.placeholder.com/150')
      .replace(/%var-link%/g, post.link || '#')
      .replace(/%var-link2%/g, post.link2 || '#')
      .replace(/%var-url128%/g, post.url128 || post.link || '#')
      .replace(/%var-url320%/g, post.url320 || post.link || '#')
      .replace(/%hits%/g, post.hits || 0)
      .replace(/%var-lyricstimestamp%/g, post.lyricstimestamp || '')
      .replace(/%var-available%/g, post.available || 'off')
      .replace(/%var-availabletimestamp%/g, post.availabletimestamp || 'off')
      .replace(/%var-name%/g, post.name || `${post.artist} - ${post.title}`)
      .replace(/%sn%/g, index + 1)
      .replace(/%date=Y-m-d%/g, getFormattedDate('Y-m-d'))
      .replace(/%text%/g, post.year || 'Unknown')
      .replace(/:url-1\(:to-file:\):/g, `/track/${post.id}/${generatePermalink(post.artist, post.title)}`)
      .replace(/\[replace=\((.*?)\)\](.*?)\[\]/g, (match, condition, content) => {
        const [value, ...replacements] = condition.split('[]');
        return replacements.includes(post[value]) || !value ? content : '';
      });
    result += item;
  });
  return result;
};

// Root route
app.get('/', (req, res) => {
  db.all('SELECT * FROM posts ORDER BY created_at DESC LIMIT 40', (err, posts) => {
    if (err) return res.status(500).send('Error fetching posts');
    const featured = parseBlogTags(`
      <a href="/track/%id%/${generatePermalink('%var-artist%', '%var-title%')}">
        <div class="card">
          <div class="image-container">
            <img src="%var-thumb%" alt="%var-title% by %var-artist%" title="%var-title% by %var-artist%">
            <span class="views"><i class="fa fa-eye" aria-hidden="true"></i> %hits%</span>
          </div>
          <div class="card-content">
            <h3 style="font-size: 10px; margin: 0 0 8px 0; background: #1a594f; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px;">%var-artist% - %var-title%</h3>
            <p>Album: %var-album%</p>
            <div class="info-row">
              <span class="duration"><i class="fa fa-clock-o" aria-hidden="true"></i> %var-duration%</span>
              <span class="genre">[replace=(%var-genre%)]%var-genre%||<i class="fa fa-file-audio-o" aria-hidden="true"></i> %var-genre%[/replace]</span>
              <span class="lyrics">[replace=(%var-available%)]on[]off||<i class="fa fa-sticky-note-o" aria-hidden="true"></i> + Lyrics [][/replace]</span>
            </div>
          </div>
        </div>
      </a>`, posts.slice(0, 30), { limit: 30, order: 'hits DESC', noMessage: '<center>Page Limit</center>' });

    const top5 = parseBlogTags(`
      <div class="menu" style="margin-bottom: 8px; background: rgba(0,0,0,0.05); padding: 6px; border-radius: 6px; display: flex; align-items: center; transition: background 0.2s;">
        <div style="flex: 0 0 25px; text-align: center; font-size: 14px; color: #1e90ff; font-weight: bold;">
          <span>%sn%</span>
        </div>
        <div style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 8px;">
          <a href="/track/%id%/${generatePermalink('%var-artist%', '%var-title%')}" title="%var-artist% - %var-title%.mp3" rel="dofollow" style="color: #333; text-decoration: none; font-size: 12px;">
            %var-artist% - %var-title%
          </a>
        </div>
        <div style="flex: 0 0 40px;">
          <img src="%var-thumb%" width="40px" height="40px" alt="%var-artist% - %var-title%" style="border-radius: 4px; object-fit: cover;"/>
        </div>
      </div>`, posts.slice(0, 5), { limit: 5, order: 'hits DESC', noMessage: '<center style="color: #666; font-size: 12px; margin-bottom: 8px;">Page Limit</center>' });

    const newUpdate = parseBlogTags(`
      <div class="album-list">
        <table>
          <tbody>
            <tr valign="top">
              <td class="kpops-list-thumb" align="center">
                <div style="position: relative; display: inline-block; width: 60px; height: 55px;">
                  <img class="thumb" src="%var-thumb%" alt="%var-artist% - %var-title%.mp3" width="60px" height="55px" style="display: block;">
                  <span style="position: absolute; bottom: -4px; right: -4px; font-size: 8px; color: #ffffff; background: rgba(0, 0, 0, 0.4); padding: 1px 3px; border-radius: 1px; line-height: 1.2; max-width: 89%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <i class="fa fa-eye" aria-hidden="true"></i> %hits%
                  </span>
                </div>
              </td>
              <td align="left">
                <span>
                  <a title="Download %title% mp3" href="/track/%id%/${generatePermalink('%var-artist%', '%var-title%')}"><b>%var-artist% - %var-title%</b></a><br>
                  <font style="font-size:12px;line-height:2;"><i class="fa fa-audio-description" aria-hidden="true"></i> %var-album%</font><br>
                  <font style="font-size:11px;line-height:1.5;">
                    <i class="fa fa-hdd-o" aria-hidden="true"></i> %var-size% MB -
                    <i class="fa fa-clock-o" aria-hidden="true"></i> %var-duration% -
                    <i class="fa fa-calendar" aria-hidden="true"></i> %text%
                    [replace=(%var-genre%)]%var-genre%|| - <i class="fa fa-file-audio-o" aria-hidden="true"></i> %var-genre%[/replace]
                    [replace=(%var-available%)]on[]off|| - <i class="fa fa-sticky-note-o" aria-hidden="true"></i> + Lyrics [][/replace]
                  </font>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>`, posts, { limit: 40, noMessage: '<center>Page Limit</center>' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wallkpop | Download Latest K-Pop Music MP3</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
          header { text-align: center; padding: 20px; background: #f4f4f4; }
          header h1 a { color: #333; text-decoration: none; }
          header h2 { color: #666; font-size: 1.2rem; }
          nav ul { list-style: none; padding: 0; display: flex; justify-content: center; gap: 20px; }
          nav ul li a { color: #007bff; text-decoration: none; }
          #search { margin: 20px auto; max-width: 600px; }
          #search form { display: flex; gap: 10px; }
          .inp-text { padding: 8px; width: 80%; border: 1px solid #ddd; border-radius: 4px; }
          .inp-btn { padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
          .inp-btn:hover { background: #0056b3; }
          footer { text-align: center; padding: 20px; background: #f4f4f4; margin-top: 20px; }
          .footer .center { margin: 10px 0; }
          .kiri, .kanan { display: inline-block; margin: 0 10px; }
          h3 { color: #333; margin: 20px 0; font-size: 1.3rem; text-transform: uppercase; letter-spacing: 1px; }
          h3 a { float: right; font-size: 0.9rem; text-decoration: none; color: #ff4d94; }
          .carousel-container { width: 100%; margin: 0 auto; padding: 2px 0; position: relative; overflow: hidden; }
          .carousel { display: flex; overflow-x: auto; scroll-behavior: smooth; gap: 0px; padding: 0 20px 0 0; box-sizing: border-box; }
          .carousel::-webkit-scrollbar { height: 6px; }
          .carousel::-webkit-scrollbar-thumb { background: #ff4d94; border-radius: 10px; }
          .card { flex: 0 0 150px; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); transition: transform 0.3s ease; position: relative; height: 190px; display: flex; flex-direction: column; }
          .card:first-child { margin-left: 0; }
          .card:last-child { margin-right: 20px; }
          .card:hover { transform: translateY(-5px); }
          .card .image-container { width: 100%; height: 250px; overflow: hidden; position: relative; }
          .card img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
          .card .image-container .views { position: absolute; top: 5px; right: 5px; font-size: 0.65rem; color: #333; background: rgba(255, 255, 255, 0.9); padding: 1px 4px; border-radius: 3px; display: flex; align-items: center; }
          .card .image-container .views i { margin-right: 2px; }
          .card-content { padding: 3px; text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; height: 100%; overflow: hidden; }
          .card-content h3 { margin: 0; font-size: 0.75rem; color: #fff; background: rgba(0, 0, 0, 0.6); padding: 2px 4px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 171px; margin-left: auto; margin-right: auto; }
          .card-content p { margin: 2px 0 0; font-size: 0.7rem; color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 171px; margin-left: auto; margin-right: auto; }
          .info-row { display: flex; justify-content: space-between; flex-wrap: nowrap; margin-top: 5px; flex-grow: 1; overflow: hidden; gap: 2px; }
          .info-row span { font-size: 0.65rem; color: #333; background: rgba(255, 255, 255, 0.8); padding: 1px 3px; border-radius: 3px; margin: 2px 0; white-space: nowrap; flex: 1; min-width: 0; }
          .info-row i { margin-right: 2px; }
          @media (max-width: 768px) {
            .carousel { padding: 0 15px 0 0; }
            .card:last-child { margin-right: 15px; }
            .card { flex: 0 0 130px; height: 157px; }
            .card .image-container { height: 250px; }
            .card img { width: 100%; height: 100%; }
            .card .image-container .views { font-size: 0.6rem; padding: 1px 3px; }
            .card-content h3 { font-size: 0.65rem; max-width: 171px; }
            .card-content p { font-size: 0.6rem; max-width: 171px; }
            .info-row span { font-size: 0.6rem; padding: 1px 2px; }
          }
          .menu { margin-bottom: 8px; background: rgba(0,0,0,0.05); padding: 6px; border-radius: 6px; display: flex; align-items: center; transition: background 0.2s; }
          .album-list table { width: 100%; border-collapse: collapse; }
          .album-list td { padding: 5px; vertical-align: top; }
          .paging { text-align: center; margin: 20px 0; }
          .paging a { margin: 0 5px; text-decoration: none; color: #007bff; }
          .paging span { margin: 0 5px; }
        </style>
      </head>
      <body>
        ${getHeader()}
        <div id="content">
          <h3 style="font-size: 16px; margin: 0 0 8px 0; background: #d04e38; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px;">
            <span>Featured Track</span>
            <span style="background: #ffffff; color: #ba412c; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;">last week</span>
          </h3>
          <div class="carousel-container">
            <div class="carousel">
              ${featured}
            </div>
          </div>
          <h3 style="font-size: 16px; margin: 0 0 8px 0; background: #ba412c; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px;">
            <span>TOP 5 Daily Chart</span>
            <span style="background: #ffffff; color: #ba412c; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;"><i class="fa fa-calendar" aria-hidden="true"></i> ${getFormattedDate('H:i')} UTC</span>
          </h3>
          ${top5}
          <h3 style="font-size: 16px; margin: 0 0 8px 0; background: #ba412c; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px;">
            <span>New Update</span>
            <span style="background: #ffffff; color: #ba412c; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;"><i class="fa fa-calendar" aria-hidden="true"></i> ${getFormattedDate('Y-m-d')}</span>
          </h3>
          <div id="content">
            <div class="album">
              ${newUpdate}
              <div class="paging">
                <span>1 of 1</span> <!-- Simplified paging, can be enhanced -->
              </div>
            </div>
          </div>
        </div>
        ${getFooter('https://wallkpop.vercel.app/')}
      </body>
      </html>
    `;
    res.send(html);
  });
});

// Panel for manual input
app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    'var-size320': size320,
    'var-bitrate': bitrate,
    'var-bitrate128': bitrate128,
    'var-bitrate320': bitrate320,
    'var-availablebitrate128': availablebitrate128,
    'var-availablebitrate320': availablebitrate320,
    'var-thumb': thumb,
    'var-link': link,
    'var-link2': link2,
    'var-url128': url128,
    'var-url320': url320,
    'var-lyricstimestamp': lyricstimestamp,
    'var-available': available,
    'var-availabletimestamp': availabletimestamp,
    'var-name': name
  } = req.body;

  db.run(
    `INSERT INTO posts (
      artist, title, year, album, genre, duration, size, size128, size320,
      bitrate, bitrate128, bitrate320, availablebitrate128, availablebitrate320,
      thumb, link, link2, url128, url320, lyricstimestamp, available, availabletimestamp, name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artist, title, year, album, genre, duration, size, size128, size320,
      bitrate, bitrate128, bitrate320, availablebitrate128, availablebitrate320,
      thumb, link, link2, url128, url320, lyricstimestamp, available, availabletimestamp, name
    ],
    function(err) {
      if (err) return res.status(500).send('Error saving post');
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${this.lastID}/${permalink}`);
    }
  );
});

// Track page
app.get('/track/:id/:permalink', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
    if (err || !post) return res.status(404).send('Post not found');
    // Increment hits
    db.run('UPDATE posts SET hits = hits + 1 WHERE id = ?', [id]);
    // Fetch related songs (same artist, excluding current post)
    db.all('SELECT id, artist, title FROM posts WHERE artist = ? AND id != ? LIMIT 20', [post.artist, id], (err, related) => {
      if (err) related = [];
      const relatedContent = parseBlogTags(`
        <div class="lagu">
          <a title="Download %var-artist% - %var-title% Mp3" href="/track/%id%/${generatePermalink('%var-artist%', '%var-title%')}">%var-artist% - %var-title%</a>
        </div>`, related, { limit: 20, noMessage: '<center>No File</center>' });

      const content = parseBlogTags(`
        <div id="k">
          <div class="kpops-view">
            <div class="post-title">
              <div class="meta"><h1>Download %title% MP3</h1></div>
              <div class="autor"><span><b class="user"><em>%var-artist%</em></b>, <b class="add">%date=Y-m-d%</b></span></div>
            </div>
            <div class="cover-foto" align="center">
              <img class="art" src="%var-thumb%" alt="%var-title% MP3 by %var-artist%" title="%var-title% MP3 by %var-artist%" style="width: 100%; height: 80%; object-fit: cover;">
              <div id="lyrics" class="lyrics"></div>
            </div>
            <div class="kpops-view-atas">
              <p><strong>Listen and Download</strong> <b>%var-title% MP3</b> by <b>%var-artist%</b> for free at Wallkpop. This track is shared for promotional purposes only. Support the artist by purchasing the official version on music platforms like iTunes, Spotify, or Amazon Music.</p>
            </div>
            <div class="post-body">
              <table width="100%">
                <caption class="title">%var-name%.mp3</caption>
                <tbody>
                  <tr><td width="30%">Song Title</td><td>:</td><td>%var-title%</td></tr>
                  <tr><td>Artist</td><td>:</td><td>%var-artist%</td></tr>
                  <tr><td>Album</td><td>:</td><td>%var-album%</td></tr>
                  <tr><td>Genre</td><td>:</td><td>%var-genre%</td></tr>
                  <tr><td>Duration</td><td>:</td><td>%var-duration% minutes</td></tr>
                  <tr><td>Bitrate</td><td>:</td><td>128, 192, 320 Kbps</td></tr>
                  <tr><td>Lyrics</td><td>:</td><td>[replace=(%var-available%)]on[]off||<a href="/site-lyrics.html?to-file=%id%">View Lyrics</a>[]<del>Not Available</del>[/replace]</td></tr>
                  <tr><td>View</td><td>:</td><td>%hits%</td></tr>
                </tbody>
              </table>
            </div>
            <div class="container">
              <h2><center>↓↓ Download MP3 ~%var-bitrate% kb/s ↓↓</center></h2>
            </div>
            <audio id="player" controls>
              <source src="%var-link2%" type="audio/mp3">
            </audio>
            <div style="text-align: center;">
              <button style="background: #cf5117; color: white; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;" onclick="document.getElementById('player').src='%var-link%';">Play Audio from Wallkpop</button>
              <button style="background: #cf5117; color: white; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;" onclick="document.getElementById('player').src='%var-link2%';">Play Audio from GDrive</button>
            </div>
            <div id="debug" class="debug">Loading...</div>
            <script>const lyricsText = "%var-lyricstimestamp%";</script>
            <script src="https://cdn.jsdelivr.net/gh/caraaink/meownime@refs/heads/main/javascript/audio-lyrics-timestamp.js"></script>
            <div style="text-align: center;"><br>
              <div class="download-buttons">
                [replace=(%var-availablebitrate320%)]on[]off[]https:[]http:[]#||<a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size320%&to-link2=%var-url320%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size320%" target="_blank">
                  <button class="downd bitrate-320"><span class="hq-label">HQ</span><div class="title">Download Now</div><div class="size">(%var-size320%)</div><span class="bitrate">%var-bitrate320% kb/s</span></button></a>[][][][][/replace]
                <a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size%&to-link2=%var-link2%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size%" target="_blank">
                  <button class="downd bitrate-192"><span class="medium-label">MQ</span><div class="title">Download Now</div><div class="size">(%var-size%)</div><span class="bitrate">%var-bitrate% kb/s</span></button></a>
                [replace=(%var-availablebitrate128%)]on[]off[]https:[]http:[]#||<a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size128%&to-link2=%var-url128%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size128%" target="_blank">
                  <button class="downd bitrate-128"><span class="low-label">LQ</span><div class="title">Download Now</div><div class="size">(%var-size128%)</div><span class="bitrate">%var-bitrate128% kb/s</span></button></a>[][][][][/replace]
              </div>
            </div>
            <br>
            <div class="breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList">
              <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <a itemtype="https://schema.org/Thing" itemprop="item" href="/">
                  <span itemprop="name">Home</span>
                </a>
                <meta itemprop="position" content="1">
              </span> »
              <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <a itemtype="https://schema.org/Thing" itemprop="item" href="/site-allmusic.html">
                  <span itemprop="name">K-Pop</span>
                </a>
                <meta itemprop="position" content="2">
              </span> »
              <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <a itemtype="https://schema.org/Thing" itemprop="item" href="/search/%var-artist%">
                  <span itemprop="name">%var-artist%</span>
                </a>
                <meta itemprop="position" content="3">
              </span> »
              <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <span itemprop="name">%var-title%</span>
                <meta itemprop="position" content="4">
              </span>
            </div>
            <br>
            [replace=(%var-availabletimestamp%)]on[]off||<div class="note"><h3>Lyrics %var-name%</h3>%var-lyricstimestamp%</div>[]<div class="note"> Download the latest song <strong>%var-artist% - %var-title%.mp3</strong> for free from trusted sources like wallkpop, ilkpop, matikiri, StafaBand, Planetlagu, and others. This content is provided for preview and promotional use only. Please support the artist by buying the original track from official platforms such as iTunes, Spotify, or Amazon. We do not host any files and are not responsible for user downloads. </div>[/replace]
          </div>
        </div>`, [post], { noMessage: 'No Post' });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Download ${post.artist} - ${post.title} MP3 | Free Kpop Music</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            header { text-align: center; padding: 20px; background: #f4f4f4; }
            header h1 a { color: #333; text-decoration: none; }
            header h2 { color: #666; font-size: 1.2rem; }
            nav ul { list-style: none; padding: 0; display: flex; justify-content: center; gap: 20px; }
            nav ul li a { color: #007bff; text-decoration: none; }
            #search { margin: 20px auto; max-width: 600px; }
            #search form { display: flex; gap: 10px; }
            .inp-text { padding: 8px; width: 80%; border: 1px solid #ddd; border-radius: 4px; }
            .inp-btn { padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .inp-btn:hover { background: #0056b3; }
            footer { text-align: center; padding: 20px; background: #f4f4f4; margin-top: 20px; }
            .footer .center { margin: 10px 0; }
            .kiri, .kanan { display: inline-block; margin: 0 10px; }
            .lyrics { color: white; font-size: 24px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7); text-align: center; width: 93%; opacity: 0; transition: opacity 0.5s ease-in-out; z-index: 10; }
            @media (max-width: 767px) {
              .lyrics { position: absolute; top: 69%; left: 50%; transform: translate(-50%, -50%); }
            }
            @media (min-width: 768px) {
              .lyrics { position: absolute; top: 82%; left: 50%; transform: translate(-50%, -50%); font-size: 36px; overflow-y: auto; width: 36%; padding: 10px; box-sizing: border-box; }
            }
            .lyrics.active { opacity: 1; }
            audio { margin-top: 20px; width: 100%; max-width: 600px; }
            .debug { position: fixed; bottom: 30px; left: 10px; background: rgba(0, 0, 0, 0.7); color: white; padding: 10px; font-size: 14px; max-width: 560px; }
            .btn-download { background: #f4f4f4; color: #666; text-align: center; border: 1px solid #ddd; display: inline-block; border-radius: 3px; min-width: 78px; position: relative; padding: 5px 4px; margin: 2px 1px; font-size: 12px; }
            .download-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
            .downd { position: relative; padding: 18px 12px 12px 12px; font-size: 14px; border: none; border-radius: 6px; color: white; cursor: pointer; height: 63px; max-width: 135px; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform 0.2s; }
            .downd:hover { transform: scale(1.05); }
            .bitrate-320 { background: linear-gradient(135deg, #008000, #3ec752); }
            .bitrate-192 { background: linear-gradient(135deg, #FFA500, #e0d831); }
            .bitrate-128 { background: linear-gradient(135deg, #ff3333, #f2532c); }
            .bitrate { position: absolute; top: 6px; right: 6px; font-size: 10px; background: rgba(0, 0, 0, 0.25); padding: 2px 5px; border-radius: 3px; pointer-events: none; }
            .hq-label, .medium-label, .low-label { position: absolute; top: 6px; left: 6px; background: rgba(255, 255, 255, 0.7); font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 2px; pointer-events: none; }
            .hq-label { color: green; }
            .medium-label { color: orange; }
            .low-label { color: red; }
            .downd .title { font-weight: normal; margin-bottom: 2px; margin-top: 6px; }
            .downd .size { font-size: 15px; opacity: 0.9; margin-top: -1px; }
            .post-title { text-align: center; }
            .autor { margin: 10px 0; }
            .cover-foto { position: relative; }
            .post-body table { width: 100%; max-width: 600px; margin: 20px auto; border-collapse: collapse; }
            .post-body td { padding: 5px; }
            .container { text-align: center; }
            .list .lagu { margin: 10px 0; }
            .list .lagu a { color: #007bff; text-decoration: none; }
          </style>
        </head>
        <body>
          ${getHeader()}
          ${content}
          <div id="k">
            <h3 class="title">Related Update : <a href="/">More</a></h3>
            <div class="list">
              ${relatedContent}
            </div>
          </div>
          ${getFooter(`https://wallkpop.vercel.app/track/${id}/${req.params.permalink}`)}
        </body>
        </html>
      `;
      res.send(html);
    });
  });
});

// Search page
app.get('/search/:query', (req, res) => {
  const query = `%${req.params.query}%`;
  db.all('SELECT * FROM posts WHERE artist LIKE ? OR title LIKE ? OR year LIKE ?', [query, query, query], (err, posts) => {
    if (err) return res.status(500).send('Error searching');
    const searchResults = parseBlogTags(`
      <div class="album-list">
        <table>
          <tbody>
            <tr valign="top">
              <td class="kpops-list-thumb" align="center">
                <div style="position: relative; display: inline-block; width: 60px; height: 55px;">
                  <img class="thumb" src="%var-thumb%" alt="%var-artist% - %var-title%.mp3" width="60px" height="55px" style="display: block;">
                  <span style="position: absolute; bottom: -4px; right: -4px; font-size: 8px; color: #ffffff; background: rgba(0, 0, 0, 0.4); padding: 1px 3px; border-radius: 1px; line-height: 1.2; max-width: 89%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <i class="fa fa-eye" aria-hidden="true"></i> %hits%
                  </span>
                </div>
              </td>
              <td align="left">
                <span>
                  <a title="Download %title% mp3" href="/track/%id%/${generatePermalink('%var-artist%', '%var-title%')}"><b>%var-artist% - %var-title%</b></a><br>
                  <font style="font-size:12px;line-height:2;"><i class="fa fa-audio-description" aria-hidden="true"></i> %var-album%</font><br>
                  <font style="font-size:11px;line-height:1.5;">
                    <i class="fa fa-hdd-o" aria-hidden="true"></i> %var-size% MB -
                    <i class="fa fa-clock-o" aria-hidden="true"></i> %var-duration% -
                    <i class="fa fa-calendar" aria-hidden="true"></i> %text%
                    [replace=(%var-genre%)]%var-genre%|| - <i class="fa fa-file-audio-o" aria-hidden="true"></i> %var-genre%[/replace]
                    [replace=(%var-available%)]on[]off|| - <i class="fa fa-sticky-note-o" aria-hidden="true"></i> + Lyrics [][/replace]
                  </font>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>`, posts, { limit: 40, noMessage: '<center>No File</center>' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Search Results for "${req.params.query}" | Wallkpop</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
          header { text-align: center; padding: 20px; background: #f4f4f4; }
          header h1 a { color: #333; text-decoration: none; }
          header h2 { color: #666; font-size: 1.2rem; }
          nav ul { list-style: none; padding: 0; display: flex; justify-content: center; gap: 20px; }
          nav ul li a { color: #007bff; text-decoration: none; }
          #search { margin: 20px auto; max-width: 600px; }
          #search form { display: flex; gap: 10px; }
          .inp-text { padding: 8px; width: 80%; border: 1px solid #ddd; border-radius: 4px; }
          .inp-btn { padding: 8px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
          .inp-btn:hover { background: #0056b3; }
          footer { text-align: center; padding: 20px; background: #f4f4f4; margin-top: 20px; }
          .footer .center { margin: 10px 0; }
          .kiri, .kanan { display: inline-block; margin: 0 10px; }
          .album-list table { width: 100%; border-collapse: collapse; }
          .album-list td { padding: 5px; vertical-align: top; }
          .paging { text-align: center; margin: 20px 0; }
          .paging a { margin: 0 5px; text-decoration: none; color: #007bff; }
          .paging span { margin: 0 5px; }
        </style>
      </head>
      <body>
        ${getHeader(req.params.query)}
        <div id="content">
          <h1>Search Results for "${req.params.query}"</h1>
          <div class="album">
            ${searchResults}
            <div class="paging">
              <span>1 of 1</span> <!-- Simplified paging, can be enhanced -->
            </div>
          </div>
        </div>
        ${getFooter('https://wallkpop.vercel.app/search/' + req.params.query)}
      </body>
      </html>
    `;
    res.send(html);
  });
});

// API for posting
app.post('/api/post', (req, res) => {
  const {
    artist, title, year, album, genre, duration, size, size128, size320,
    bitrate, bitrate128, bitrate320, availablebitrate128, availablebitrate320,
    thumb, link, link2, url128, url320, lyricstimestamp, available, availabletimestamp, name
  } = req.body;
  if (!artist || !title || !year) return res.status(400).json({ error: 'Missing required fields' });
  db.run(
    `INSERT INTO posts (
      artist, title, year, album, genre, duration, size, size128, size320,
      bitrate, bitrate128, bitrate320, availablebitrate128, availablebitrate320,
      thumb, link, link2, url128, url320, lyricstimestamp, available, availabletimestamp, name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artist, title, year, album, genre, duration, size, size128, size320,
      bitrate, bitrate128, bitrate320, availablebitrate128, availablebitrate320,
      thumb, link, link2, url128, url320, lyricstimestamp, available, availabletimestamp, name
    ],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error saving post' });
      const permalink = generatePermalink(artist, title);
      res.json({ id: this.lastID, permalink: `/track/${this.lastID}/${permalink}` });
    }
  );
});

// Vercel serverless entry point
module.exports = app;
