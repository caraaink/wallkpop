const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const slugify = require('slugify');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize SQLite database with indexing for faster queries
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    console.error('Database initialization error:', err);
    process.exit(1); // Exit if database fails to initialize
  }
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
  )`, (err) => {
    if (err) console.error('Table creation error:', err);
  });
  db.run('CREATE INDEX idx_id ON posts(id)'); // Index for faster ID lookups
});

// Helper function to generate permalink with fallback
const generatePermalink = (artist, title) => {
  if (!artist || !title) return 'default-permalink';
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

// Meta header template
const getMetaHeader = (post = null, pageUrl = 'https://wallkpop.vercel.app/') => {
  const isTrackPage = post !== null;
  const title = isTrackPage ? `Download ${post.title} MP3 by ${post.artist} | Free Kpop Music` : 'Wallkpop | Download Latest K-Pop Music MP3';
  const description = isTrackPage
    ? `Download ${post.title} by ${post.artist} in MP3 format. Get the latest K-pop songs for free, only for promotional use. Support your favorite artist by buying the original track.`
    : 'We are K-Pop lovers who spread the love for k-music. The site does not store any files on its server. All contents are for promotion only. Please support the artists by purchasing their CDs.';
  const keywords = isTrackPage
    ? `download kpop mp3, ${post.artist}, ${post.title} mp3, free kpop song, kpop download, ${post.title} download, korean pop music`
    : 'KPop, Download KPop, KPop Music, KPop Songs, JPop, Download JPop, JPop Music, JPop Songs, CPop, Download CPop, CPop Music, CPop Songs, Ost KDrama, Lagu Soundtrack KDrama, Lagu Drama Korea, Lagu KPop Terbaru, Tangga Lagu KPop, Download K-Pop Latest Mp3';
  const og = isTrackPage ? `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="music.song">
    <meta property="og:title" content="Download ${post.title} MP3 by ${post.artist}">
    <meta property="og:description" content="Get ${post.title} MP3 by ${post.artist} for free. Listen before you buy.">
    <meta property="og:image" content="${post.thumb || 'https://via.placeholder.com/150'}">
    <meta property="og:url" content="${pageUrl}">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${post.title} MP3 by ${post.artist}">
    <meta name="twitter:description" content="Free download of ${post.title} by ${post.artist}. Support the artist.">
    <meta name="twitter:image" content="${post.thumb || 'https://via.placeholder.com/150'}">
    
    <!-- Structured Data: JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      "name": "${post.title}",
      "url": "${pageUrl}",
      "duration": "PT${post.duration || '0'}M",
      "inAlbum": {
        "@type": "MusicAlbum",
        "name": "${post.album || 'Unknown'}"
      },
      "byArtist": {
        "@type": "MusicGroup",
        "name": "${post.artist}"
      },
      "genre": "${post.genre || 'K-Pop'}",
      "image": "${post.thumb || 'https://via.placeholder.com/150'}",
      "datePublished": "${getFormattedDate('Y-m-d')}",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      }
    }
    </script>
  ` : '';

  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="${keywords}">
    <meta name="author" content="Wallkpop">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:site_name" content="Wallkpop">
    ${og}
    <link rel="stylesheet" href="https://rawcdn.githack.com/caraaink/otakudesu/1ff200e0bc05d43443b4944b46532c4b4c3cc275/plyr.css" />
    <script src="https://rawcdn.githack.com/caraaink/otakudesu/1ff200e0bc05d43443b4944b46532c4b4c3cc275/plyr.polyfilled.js"></script>
    <link href="https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" type="text/css" href="https://fastcdn.jdi5.com/css/wallkpop.wapkiz.com/style.css"/>
    <meta name="google-site-verification" content="9e9RaAsVDPAkag708Q30S8xSw8_qIMm87FJBoJWzink" />
    <meta name="yandex-verification" content="b507670596647101" />
  `;
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
      .replace(/%var-size192%/g, post.size192 || post.size || 'Unknown')
      .replace(/%var-size320%/g, post.size320 || post.size || 'Unknown')
      .replace(/%var-bitrate%/g, post.bitrate || '192')
      .replace(/%var-bitrate128%/g, post.bitrate128 || '128')
      .replace(/%var-bitrate192%/g, post.bitrate192 || '192')
      .replace(/%var-bitrate320%/g, post.bitrate320 || '320')
      .replace(/%var-thumb%/g, post.thumb || 'https://via.placeholder.com/150')
      .replace(/%var-link%/g, post.link || '#')
      .replace(/%var-link2%/g, post.link2 || '#')
      .replace(/%var-url128%/g, post.url128 || post.link || '#')
      .replace(/%var-url192%/g, post.url192 || post.link || '#')
      .replace(/%var-url320%/g, post.url320 || post.link || '#')
      .replace(/%hits%/g, post.hits || 0)
      .replace(/%var-lyricstimestamp%/g, post.lyricstimestamp || '')
      .replace(/%var-lyrics%/g, post.lyrics || '')
      .replace(/%var-name%/g, post.name || `${post.artist} - ${post.title}`)
      .replace(/%sn%/g, index + 1)
      .replace(/%date=Y-m-d%/g, getFormattedDate('Y-m-d'))
      .replace(/%text%/g, post.year || 'Unknown')
      .replace(/:url-1\(:to-file:\):/g, `/track/${post.id}/${generatePermalink(post.artist, post.title)}`)
      .replace(/:page_url:/g, `https://wallkpop.vercel.app/track/${post.id}/${generatePermalink(post.artist, post.title)}`);
    result += item;
  });
  return result;
};

// Root route
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

  // Validate required fields
  if (!artist || !title || !year) {
    return res.status(400).send('Missing required fields: artist, title, or year');
  }
  // Convert year to integer
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    return res.status(400).send('Invalid year value');
  }

  db.run(
    `INSERT INTO posts (
      artist, title, year, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artist, title, yearNum, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ],
    function(err) {
      if (err) {
        console.error('Database error during post insertion:', err.message);
        return res.status(500).send(`Error saving post: ${err.message}`);
      }
      const permalink = generatePermalink(artist, title);
      res.redirect(`/track/${this.lastID}/${permalink}`);
    }
  );
});

// Track page
app.get('/track/:id/:permalink', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM posts WHERE id = ?', [id], { timeout: 5000 }, (err, post) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).send('Error fetching post');
    }
    if (!post) return res.status(404).send('Post not found');
    db.run('UPDATE posts SET hits = hits + 1 WHERE id = ?', [id], (err) => {
      if (err) console.error('Error updating hits:', err);
    });
    db.all('SELECT id, artist, title FROM posts WHERE artist = ? AND id != ? LIMIT 20', [post.artist, id], { timeout: 5000 }, (err, related) => {
      if (err) {
        console.error('Related posts error:', err);
        related = [];
      }
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
                <a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size320%&to-link2=%var-url320%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size320%" target="_blank">
                  <button class="downd bitrate-320"><span class="hq-label">HQ</span><div class="title">Download Now</div><div class="size">(%var-size320%)</div><span class="bitrate">%var-bitrate320% kb/s</span></button>
                </a>
                <a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size192%&to-link2=%var-url192%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size192%" target="_blank">
                  <button class="downd bitrate-192"><span class="medium-label">MQ</span><div class="title">Download Now</div><div class="size">(%var-size192%)</div><span class="bitrate">%var-bitrate192% kb/s</span></button>
                </a>
                <a href="//meownime.wapkizs.com/page-convert.html?to-thumb=%var-thumb%&to-size=%var-size128%&to-link2=%var-url128%&to-artist=%var-artist%&to-title=%var-title%&to-link=%var-link%&to-sizeori=%var-size128%" target="_blank">
                  <button class="downd bitrate-128"><span class="low-label">LQ</span><div class="title">Download Now</div><div class="size">(%var-size128%)</div><span class="bitrate">%var-bitrate128% kb/s</span></button>
                </a>
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
            <div class="note">
              Download the latest song <strong>%var-artist% - %var-title%.mp3</strong> for free from trusted sources like wallkpop, ilkpop, matikiri, StafaBand, Planetlagu, and others. This content is provided for preview and promotional use only. Please support the artist by buying the original track from official platforms such as iTunes, Spotify, or Amazon. We do not host any files and are not responsible for user downloads.
            </div>
          </div>
        </div>`, [post], { noMessage: 'No Post' });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          ${getMetaHeader(post, `https://wallkpop.vercel.app/track/${id}/${req.params.permalink}`)}
          <style>
            body { font-family: 'Lora', Arial, sans-serif; margin: 0; padding: 0; }
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
            .note { margin: 20px auto; max-width: 600px; }
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
  db.all('SELECT * FROM posts WHERE artist LIKE ? OR title LIKE ? OR year LIKE ?', [query, query, query], { timeout: 5000 }, (err, posts) => {
    if (err) {
      console.error('Search error:', err);
      return res.status(500).send('Error searching');
    }
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
                    <i class="fa fa-calendar" aria-hidden="true"></i> %text% -
                    <i class="fa fa-file-audio-o" aria-hidden="true"></i> %var-genre%
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
        ${getMetaHeader(null, `https://wallkpop.vercel.app/search/${req.params.query}`)}
        <style>
          body { font-family: 'Lora', Arial, sans-serif; margin: 0; padding: 0; }
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
              <span>1 of 1</span>
            </div>
          </div>
        </div>
        ${getFooter(`https://wallkpop.vercel.app/search/${req.params.query}`)}
      </body>
      </html>
    `;
    res.send(html);
  });
});

// API for posting
app.post('/api/post', (req, res) => {
  const {
    artist, title, year, album, genre, duration, size, size128, size192, size320,
    bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
    lyricstimestamp, lyrics, name
  } = req.body;

  // Validate required fields
  if (!artist || !title || !year) {
    return res.status(400).json({ error: 'Missing required fields: artist, title, or year' });
  }
  // Convert year to integer
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum)) {
    return res.status(400).json({ error: 'Invalid year value' });
  }

  db.run(
    `INSERT INTO posts (
      artist, title, year, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artist, title, yearNum, album, genre, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    ],
    function(err) {
      if (err) {
        console.error('Database error during API post insertion:', err.message);
        return res.status(500).json({ error: `Error saving post: ${err.message}` });
      }
      const permalink = generatePermalink(artist, title);
      res.json({ id: this.lastID, permalink: `/track/${this.lastID}/${permalink}` });
    }
  );
});

module.exports = app;
