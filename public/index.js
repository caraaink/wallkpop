const express = require('express');
const bodyParser = require('body-parser');
const slugify = require('slugify');
const { Octokit } = require('@octokit/core');
const { kv } = require('@vercel/kv');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// GitHub API setup
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = 'wallkpop';
const repoName = 'database';
const branch = 'main';
const GOOGLE_DRIVE_API_KEY = 'AIzaSyD00uLzmHdXXCQzlA2ibiYg2bzdbl89JOM';

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

// Helper function to get file from GitHub
async function getGitHubFile(path) {
  try {
    const cacheKey = `github:${path}`;
    const cached = await kv.get(cacheKey);
    if (cached) return cached;

    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: repoOwner,
      repo: repoName,
      path: path,
      ref: branch
    });

    if (!response.data.content) {
      throw new Error(`No content found for ${path}`);
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    if (!content.trim()) {
      throw new Error(`Empty content for ${path}`);
    }

    let data;
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      console.error(`Invalid JSON in ${path}: ${content.slice(0, 100)}...`);
      throw new Error(`Invalid JSON in ${path}: ${parseError.message}`);
    }

    await kv.set(cacheKey, data, { ex: 3600 });
    return data;
  } catch (error) {
    console.error(`Error fetching GitHub file ${path}:`, error.message);
    throw error;
  }
}

// Helper function to update file on GitHub
async function updateGitHubFile(path, content, message, sha = null) {
  try {
    const response = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: repoOwner,
      repo: repoName,
      path: path,
      message: message,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      branch: branch,
      sha: sha || undefined
    });

    const cacheKey = `github:${path}`;
    await kv.set(cacheKey, content, { ex: 3600 });
    await kv.del('github:track_files');
    return response.data.commit.sha;
  } catch (error) {
    console.error(`Error updating GitHub file ${path}:`, error.response?.data || error.message);
    throw error;
  }
}

// Helper function to delete file from GitHub
async function deleteGitHubFile(path, sha, message) {
  try {
    const response = await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
      owner: repoOwner,
      repo: repoName,
      path: path,
      message: message,
      branch: branch,
      sha: sha
    });

    const cacheKey = `github:${path}`;
    await kv.del(cacheKey);
    await kv.del('github:track_files');
    return response.data.commit.sha;
  } catch (error) {
    console.error(`Error deleting GitHub file ${path}:`, error.response?.data || error.message);
    throw error;
  }
}

// Helper function to get all track files from GitHub
async function getAllTrackFiles() {
  try {
    const cacheKey = 'github:track_files';
    const cached = await kv.get(cacheKey);
    if (cached) return cached;

    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: repoOwner,
      repo: repoName,
      path: 'file',
      ref: branch
    });

    const files = [];
    const seenIds = new Set();
    for (const item of response.data) {
      if (item.type !== 'file' || !item.name.endsWith('.json')) continue;
      const id = parseInt(item.name.split('-')[0], 10);
      if (isNaN(id)) {
        console.warn(`Invalid ID in filename: ${item.name}`);
        continue;
      }
      if (seenIds.has(id)) {
        console.warn(`Duplicate ID ${id} found in filename: ${item.name}`);
        continue;
      }
      seenIds.add(id);
      files.push({
        id,
        slug: item.name.replace(/^\d+-/, '').replace(/\.json$/, ''),
        file: item.path,
        sha: item.sha
      });
    }

    await kv.set(cacheKey, files, { ex: 3600 });
    return files;
  } catch (error) {
    console.error('Error fetching track files:', error.response?.data || error.message);
    if (error.status === 404) return [];
    throw error;
  }
}

// Helper function to get latest ID from track files
async function getLatestId() {
  try {
    const files = await getAllTrackFiles();
    if (!files || files.length === 0) return 0;
    const ids = files.map(item => item.id);
    const maxId = Math.max(...ids);
    return maxId;
  } catch (error) {
    console.error('Error getting latest ID:', error.message);
    return 0;
  }
}

// Helper function to generate permalink
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
    <link rel="stylesheet" type="text/css" href="https://rawcdn.githack.com/caraaink/wallkpop/e24482dd4db4eb4b4645ed2538a36b33257e4d82/public/style.css"/>
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

// Parse [blog] tags with Google Drive link transformation
const parseBlogTags = (template, posts, options = {}) => {
  const { limit = 10, noMessage = '<center>No File</center>', to = ':url-1(:to-file:):' } = options;
  if (!posts || posts.length === 0) return noMessage;

  let result = '';
  posts.slice(0, limit).forEach((post, index) => {
    let item = template;
    const permalink = generatePermalink(post.artist, post.title);

    // Transform Google Drive link for %var-link2%
    let link2 = post.link2 || '#';
    const driveRegex = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/;
    const match = link2.match(driveRegex);
    if (match && match[1]) {
      link2 = `https://www.googleapis.com/drive/v3/files/${match[1]}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`;
    }

    item = item.replace(/%id%/g, post.id)
      .replace(/%var-artist%/g, post.artist)
      .replace(/%var-title%/g, post.title)
      .replace(/%title%/g, `${post.artist} - ${post.title}`)
      .replace(/%var-album%/g, post.album || 'Unknown')
      .replace(/%var-genre%/g, post.genre || 'K-Pop')
      .replace(/%var-category%/g, post.category || 'K-Pop')
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
      .replace(/%var-link2%/g, link2)
      .replace(/%var-url128%/g, post.url128 || post.link || '#')
      .replace(/%var-url192%/g, post.url192 || post.link || '#')
      .replace(/%var-url320%/g, post.url320 || post.link || '#')
      .replace(/%hits%/g, '')
      .replace(/%var-lyricstimestamp%/g, post.lyricstimestamp || '')
      .replace(/%var-lyrics%/g, post.lyrics || '')
      .replace(/%var-name%/g, post.name || `${post.artist} - ${post.title}`)
      .replace(/%sn%/g, index + 1)
      .replace(/%date=Y-m-d%/g, getFormattedDate('Y-m-d'))
      .replace(/%text%/g, post.year || 'Unknown')
      .replace(/:url-1\(:to-file:\):/g, `/track/${post.id}/${permalink}`)
      .replace(/:page_url:/g, `https://wallkpop.vercel.app/track/${post.id}/${permalink}`)
      .replace(/:permalink:/g, permalink);
    result += item;
  });
  return result;
};

// Root route to list all posts, sorted by newest first
app.get('/', async (req, res) => {
  try {
    const files = await getAllTrackFiles();
    const posts = [];
    for (const item of files) {
      try {
        const post = await getGitHubFile(item.file);
        posts.push({ ...post, id: item.id, created_at: post.created_at });
      } catch (error) {
        console.error(`Skipping file ${item.file} due to error: ${error.message}`);
        continue;
      }
    }

    // Sort posts by created_at in descending order (newest first)
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const postList = parseBlogTags(`
      <div class="album-list">
        <table>
          <tbody>
            <tr valign="top">
              <td class="kpops-list-thumb" align="center">
                <div style="position: relative; display: inline-block; width: 60px; height: 55px;">
                  <img class="thumb" src="%var-thumb%" alt="%var-artist% - %var-title%.mp3" width="60px" height="55px" style="display: block;">
                </div>
              </td>
              <td align="left">
                <span>
                  <a title="Download %title% mp3" href="/track/%id%/:permalink:"><b>%var-artist% - %var-title%</b></a><br>
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
      </div>`, posts, { limit: 10, noMessage: '<center>No posts available</center>' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        ${getMetaHeader(null, 'https://wallkpop.vercel.app/')}
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
        </style>
      </head>
      <body>
        ${getHeader()}
        <div id="content">
          <h1>Latest Uploaded Tracks</h1>
          ${postList}
        </div>
        ${getFooter('https://wallkpop.vercel.app/')}
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).send('Error loading posts');
  }
});

// Panel route with checkbox delete feature
app.get('/panel', async (req, res) => {
  try {
    const files = await getAllTrackFiles();
    const posts = [];
    for (const item of files) {
      try {
        const post = await getGitHubFile(item.file);
        posts.push({ ...post, id: item.id, file: item.file, sha: item.sha });
      } catch (error) {
        console.error(`Skipping file ${item.file}: ${error.message}`);
        continue;
      }
    }

    // Sort posts by created_at in descending order
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const trackList = parseBlogTags(`
      <div class="track-item">
        <input type="checkbox" class="track-checkbox" data-file="%file%" data-sha="%sha%" data-id="%id%">
        <span>%var-artist% - %var-title% (%var-category%)</span>
        <button onclick="editTrack('%id%', '%var-artist%', '%var-title%', '%var-year%', '%var-album%', '%var-genre%', '%var-category%', '%var-duration%', '%var-size%', '%var-size128%', '%var-size192%', '%var-size320%', '%var-bitrate%', '%var-bitrate128%', '%var-bitrate192%', '%var-bitrate320%', '%var-thumb%', '%var-link%', '%var-link2%', '%var-url128%', '%var-url192%', '%var-url320%', '%var-lyricstimestamp%', '%var-lyrics%', '%var-name%', '%file%', '%sha%')">Edit</button>
        <button onclick="deleteTrack('%file%', '%sha%', '%id%')">Delete</button>
      </div>`, posts, { limit: 100 });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Upload Track | Wallkpop</title>
        <style>
          body { font-family: 'Lora', Arial, sans-serif; margin: 20px; }
          .form-container { max-width: 800px; margin: 0 auto; }
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; }
          .form-group input, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          .form-group textarea { height: 100px; }
          .submit-btn, .reset-btn, .delete-selected-btn { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
          .delete-selected-btn { background: #dc3545; }
          .submit-btn:hover, .reset-btn:hover { background: #0056b3; }
          .delete-selected-btn:hover { background: #c82333; }
          .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
          .tab { padding: 10px; cursor: pointer; border: 1px solid #ddd; border-radius: 4px; }
          .tab.active { background: #007bff; color: white; }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
          .track-item { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: center; gap: 10px; }
          .track-item button { padding: 5px 10px; }
          .track-item button:nth-child(3) { background: #007bff; color: white; }
          .track-item button:nth-child(4) { background: #dc3545; color: white; }
          .track-checkbox { margin-right: 10px; }
          .select-all-container { margin-bottom: 10px; }
        </style>
        <script>
          function toggleTab(tabId) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            document.getElementById(tabId + '-content').classList.add('active');
          }

          function editTrack(id, artist, title, year, album, genre, category, duration, size, size128, size192, size320, bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320, lyricstimestamp, lyrics, name, file, sha) {
            toggleTab('manual-tab');
            document.getElementById('var-id').value = id;
            document.getElementById('var-artist').value = artist;
            document.getElementById('var-title').value = title;
            document.getElementById('var-year').value = year;
            document.getElementById('var-album').value = album || '';
            document.getElementById('var-genre').value = genre || '';
            document.getElementById('var-category').value = category || '';
            document.getElementById('var-duration').value = duration || '';
            document.getElementById('var-size').value = size || '';
            document.getElementById('var-size128').value = size128 || '';
            document.getElementById('var-size192').value = size192 || '';
            document.getElementById('var-size320').value = size320 || '';
            document.getElementById('var-bitrate').value = bitrate || '192';
            document.getElementById('var-bitrate128').value = bitrate128 || '128';
            document.getElementById('var-bitrate192').value = bitrate192 || '192';
            document.getElementById('var-bitrate320').value = bitrate320 || '320';
            document.getElementById('var-thumb').value = thumb || '';
            document.getElementById('var-link').value = link || '';
            document.getElementById('var-link2').value = link2 || '';
            document.getElementById('var-url128').value = url128 || '';
            document.getElementById('var-url192').value = url192 || '';
            document.getElementById('var-url320').value = url320 || '';
            document.getElementById('var-lyricstimestamp').value = lyricstimestamp || '';
            document.getElementById('var-lyrics').value = lyrics || '';
            document.getElementById('var-name').value = name || '';
            document.getElementById('var-file').value = file;
            document.getElementById('var-sha').value = sha;
            document.getElementById('submit-btn').textContent = 'Update Track';
          }

          async function deleteTrack(file, sha, id) {
            if (confirm('Are you sure you want to delete this track?')) {
              try {
                const response = await fetch('/panel/delete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ file, sha })
                });
                const result = await response.json();
                if (response.ok) {
                  alert('Track deleted successfully');
                  location.reload();
                } else {
                  alert('Error deleting track: ' + result.error);
                }
              } catch (error) {
                alert('Error deleting track: ' + error.message);
              }
            }
          }

          async function deleteSelectedTracks() {
            const checkboxes = document.querySelectorAll('.track-checkbox:checked');
            if (checkboxes.length === 0) {
              alert('No tracks selected for deletion');
              return;
            }
            if (confirm(`Are you sure you want to delete ${checkboxes.length} track(s)?`)) {
              const tracks = Array.from(checkboxes).map(cb => ({
                file: cb.dataset.file,
                sha: cb.dataset.sha
              }));
              try {
                const response = await fetch('/panel/delete-multiple', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tracks })
                });
                const result = await response.json();
                if (response.ok) {
                  alert('Selected tracks deleted successfully');
                  location.reload();
                } else {
                  alert('Error deleting tracks: ' + result.error);
                }
              } catch (error) {
                alert('Error deleting tracks: ' + error.message);
              }
            }
          }

          function toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('select-all');
            const checkboxes = document.querySelectorAll('.track-checkbox');
            checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
          }

          async function resetForm() {
            document.getElementById('json-form').reset();
            document.getElementById('manual-form').reset();
            document.getElementById('var-id').value = '';
            document.getElementById('var-file').value = '';
            document.getElementById('var-sha').value = '';
            document.getElementById('submit-btn').textContent = 'Upload Track';
            try {
              const response = await fetch('/panel/reset-cache', { method: 'POST' });
              if (response.ok) {
                alert('Cache cleared successfully');
              } else {
                alert('Error clearing cache');
              }
            } catch (error) {
              alert('Error clearing cache: ' + error.message);
            }
          }
        </script>
      </head>
      <body>
        <div class="form-container">
          <h1>Manage Tracks</h1>
          <div class="tabs">
            <div class="tab active" id="json-tab" onclick="toggleTab('json-tab')">Upload JSON</div>
            <div class="tab" id="manual-tab" onclick="toggleTab('manual-tab')">Manual Input</div>
          </div>
          <div id="json-tab-content" class="tab-content active">
            <form id="json-form" action="/panel" method="POST" enctype="multipart/form-data">
              <div class="form-group">
                <label for="json-file">Upload JSON File</label>
                <input type="file" id="json-file" name="json-file" accept=".json" required>
              </div>
              <button type="submit" class="submit-btn">Upload JSON</button>
              <button type="button" class="reset-btn" onclick="resetForm()">Reset</button>
            </form>
          </div>
          <div id="manual-tab-content" class="tab-content">
            <form id="manual-form" action="/panel" method="POST">
              <input type="hidden" id="var-id" name="var-id">
              <input type="hidden" id="var-file" name="var-file">
              <input type="hidden" id="var-sha" name="var-sha">
              <div class="form-group">
                <label for="var-artist">Artist</label>
                <input type="text" id="var-artist" name="var-artist" required>
              </div>
              <div class="form-group">
                <label for="var-title">Title</label>
                <input type="text" id="var-title" name="var-title" required>
              </div>
              <div class="form-group">
                <label for="var-year">Year</label>
                <input type="number" id="var-year" name="var-year" required>
              </div>
              <div class="form-group">
                <label for="var-album">Album</label>
                <input type="text" id="var-album" name="var-album">
              </div>
              <div class="form-group">
                <label for="var-genre">Genre</label>
                <input type="text" id="var-genre" name="var-genre">
              </div>
              <div class="form-group">
                <label for="var-category">Category</label>
                <input type="text" id="var-category" name="var-category">
              </div>
              <div class="form-group">
                <label for="var-duration">Duration (e.g., 3:45)</label>
                <input type="text" id="var-duration" name="var-duration">
              </div>
              <div class="form-group">
                <label for="var-size">Size (MB)</label>
                <input type="text" id="var-size" name="var-size">
              </div>
              <div class="form-group">
                <label for="var-size128">Size 128kbps (MB)</label>
                <input type="text" id="var-size128" name="var-size128">
              </div>
              <div class="form-group">
                <label for="var-size192">Size 192kbps (MB)</label>
                <input type="text" id="var-size192" name="var-size192">
              </div>
              <div class="form-group">
                <label for="var-size320">Size 320kbps (MB)</label>
                <input type="text" id="var-size320" name="var-size320">
              </div>
              <div class="form-group">
                <label for="var-bitrate">Bitrate (kbps)</label>
                <input type="text" id="var-bitrate" name="var-bitrate" value="192">
              </div>
              <div class="form-group">
                <label for="var-bitrate128">Bitrate 128kbps</label>
                <input type="text" id="var-bitrate128" name="var-bitrate128" value="128">
              </div>
              <div class="form-group">
                <label for="var-bitrate192">Bitrate 192kbps</label>
                <input type="text" id="var-bitrate192" name="var-bitrate192" value="192">
              </div>
              <div class="form-group">
                <label for="var-bitrate320">Bitrate 320kbps</label>
                <input type="text" id="var-bitrate320" name="var-bitrate320" value="320">
              </div>
              <div class="form-group">
                <label for="var-thumb">Thumbnail URL</label>
                <input type="text" id="var-thumb" name="var-thumb">
              </div>
              <div class="form-group">
                <label for="var-link">Download Link</label>
                <input type="text" id="var-link" name="var-link">
              </div>
              <div class="form-group">
                <label for="var-link2">Alternative Download Link</label>
                <input type="text" id="var-link2" name="var-link2">
              </div>
              <div class="form-group">
                <label for="var-url128">Download URL (128kbps)</label>
                <input type="text" id="var-url128" name="var-url128">
              </div>
              <div class="form-group">
                <label for="var-url192">Download URL (192kbps)</label>
                <input type="text" id="var-url192" name="var-url192">
              </div>
              <div class="form-group">
                <label for="var-url320">Download URL (320kbps)</label>
                <input type="text" id="var-url320" name="var-url320">
              </div>
              <div class="form-group">
                <label for="var-lyricstimestamp">Lyrics Timestamp</label>
                <textarea id="var-lyricstimestamp" name="var-lyricstimestamp"></textarea>
              </div>
              <div class="form-group">
                <label for="var-lyrics">Lyrics</label>
                <textarea id="var-lyrics" name="var-lyrics"></textarea>
              </div>
              <div class="form-group">
                <label for="var-name">File Name</label>
                <input type="text" id="var-name" name="var-name">
              </div>
              <button type="submit" id="submit-btn" class="submit-btn">Upload Track</button>
              <button type="button" class="reset-btn" onclick="resetForm()">Reset</button>
            </form>
          </div>
          <h2>Existing Tracks</h2>
          <div class="select-all-container">
            <label><input type="checkbox" id="select-all" onclick="toggleSelectAll()"> Select All</label>
            <button class="delete-selected-btn" onclick="deleteSelectedTracks()">Delete Selected</button>
          </div>
          <div id="track-list">
            ${trackList}
          </div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Error loading panel:', error);
    res.status(500).send('Error loading panel');
  }
});

// Handle post submission from panel
app.post('/panel', upload.single('json-file'), async (req, res) => {
  try {
    let trackData;
    if (req.file) {
      // Handle JSON file upload
      const fileContent = await fs.readFile(req.file.path, 'utf-8');
      try {
        trackData = JSON.parse(fileContent);
        // Ensure year and id are numbers
        if (Array.isArray(trackData)) {
          trackData = trackData.map(track => ({
            ...track,
            year: parseInt(track.year, 10),
            id: track.id ? parseInt(track.id, 10) : undefined
          }));
        } else {
          trackData = [{
            ...trackData,
            year: parseInt(trackData.year, 10),
            id: trackData.id ? parseInt(trackData.id, 10) : undefined
          }];
        }
        const results = [];
        for (const track of trackData) {
          const result = await processTrack(track);
          results.push(result);
        }
        await fs.unlink(req.file.path);
        return res.json({ message: 'Tracks uploaded successfully', results });
      } catch (parseError) {
        await fs.unlink(req.file.path);
        return res.status(400).send('Invalid JSON file');
      }
    } else {
      // Handle manual form input
      const {
        'var-id': id,
        'var-file': file,
        'var-sha': sha,
        'var-artist': artist,
        'var-title': title,
        'var-year': year,
        'var-album': album,
        'var-genre': genre,
        'var-category': category,
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
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum)) {
        return res.status(400).send('Invalid year value');
      }

      trackData = [{
        artist,
        title,
        year: yearNum,
        album: album || null,
        genre: genre || null,
        category: category || null,
        duration: duration || null,
        size: size || null,
        size128: size128 || null,
        size192: size192 || null,
        size320: size320 || null,
        bitrate: bitrate || '192',
        bitrate128: bitrate128 || '128',
        bitrate192: bitrate192 || '192',
        bitrate320: bitrate320 || '320',
        thumb: thumb || null,
        link: link || null,
        link2: link2 || null,
        url128: url128 || null,
        url192: url192 || null,
        url320: url320 || null,
        lyricstimestamp: lyricstimestamp || null,
        lyrics: lyrics || null,
        name: name || `${artist} - ${title}`,
        id: id ? parseInt(id) : null,
        file,
        sha
      }];
    }

    const results = [];
    for (const track of trackData) {
      const result = await processTrack(track);
      results.push(result);
    }
    res.redirect(results[0].permalink);
  } catch (error) {
    console.error('Error uploading track:', error);
    res.status(500).send(`Error saving post: ${error.message}`);
  }
});

// Helper function to process a single track
async function processTrack(trackData) {
  // Validate required fields
  if (!trackData.artist || !trackData.title || !trackData.year) {
    throw new Error('Missing required fields in JSON: artist, title, or year');
  }
  const yearNum = parseInt(trackData.year, 10);
  if (isNaN(yearNum)) {
    throw new Error('Invalid year value in JSON');
  }

  // Generate ID and slug
  let newId = trackData.id;
  let filePath = trackData.file;
  let sha = trackData.sha;

  if (!newId) {
    const latestId = await getLatestId();
    newId = latestId + 1;
    const existingFiles = await getAllTrackFiles();
    if (existingFiles.some(file => file.id === newId)) {
      throw new Error(`ID ${newId} already exists`);
    }
    const slug = generatePermalink(trackData.artist, trackData.title);
    filePath = `file/${newId}-${slug}.json`;
  }

  // Finalize track data
  const finalTrackData = {
    id: newId,
    artist: trackData.artist,
    title: trackData.title,
    year: yearNum,
    album: trackData.album || null,
    genre: trackData.genre || null,
    category: trackData.category || null,
    duration: trackData.duration || null,
    size: trackData.size || null,
    size128: trackData.size128 || null,
    size192: trackData.size192 || null,
    size320: trackData.size320 || null,
    bitrate: trackData.bitrate || '192',
    bitrate128: trackData.bitrate128 || '128',
    bitrate192: trackData.bitrate192 || '192',
    bitrate320: trackData.bitrate320 || '320',
    thumb: trackData.thumb || null,
    link: trackData.link || null,
    link2: trackData.link2 || null,
    url128: trackData.url128 || null,
    url192: trackData.url192 || null,
    url320: trackData.url320 || null,
    lyricstimestamp: trackData.lyricstimestamp || null,
    lyrics: trackData.lyrics || null,
    name: trackData.name || `${trackData.artist} - ${trackData.title}`,
    created_at: new Date().toISOString()
  };

  // Save track
  const message = trackData.id
    ? `Update track ${newId}: ${trackData.artist} - ${trackData.title}`
    : `Add track ${newId}: ${trackData.artist} - ${trackData.title}`;
  await updateGitHubFile(filePath, finalTrackData, message, sha);

  // Force refresh track files cache
  await getAllTrackFiles();

  return { id: newId, permalink: `/track/${newId}/${generatePermalink(trackData.artist, trackData.title)}` };
}

// Handle single track deletion
app.post('/panel/delete', async (req, res) => {
  try {
    const { file, sha } = req.body;
    if (!file || !sha) {
      return res.status(400).json({ error: 'Missing file or sha' });
    }

    // Attempt to fetch file to verify existence
    await getGitHubFile(file);

    await deleteGitHubFile(file, sha, `Delete track: ${file}`);
    res.json({ message: 'Track deleted successfully' });
  } catch (error) {
    console.error('Error deleting track:', error);
    res.status(500).json({ error: `Error deleting track: ${error.message}` });
  }
});

// Handle multiple track deletion
app.post('/panel/delete-multiple', async (req, res) => {
  try {
    const { tracks } = req.body;
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: 'No tracks provided for deletion' });
    }

    const errors = [];
    for (const { file, sha } of tracks) {
      try {
        await getGitHubFile(file);
        await deleteGitHubFile(file, sha, `Delete track: ${file}`);
      } catch (error) {
        console.error(`Error deleting track ${file}:`, error.message);
        errors.push(`Failed to delete ${file}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(500).json({ error: `Some tracks failed to delete: ${errors.join('; ')}` });
    }

    res.json({ message: 'All selected tracks deleted successfully' });
  } catch (error) {
    console.error('Error deleting multiple tracks:', error);
    res.status(500).json({ error: `Error deleting tracks: ${error.message}` });
  }
});

// Handle cache reset
app.post('/panel/reset-cache', async (req, res) => {
  try {
    const files = await getAllTrackFiles();
    for (const file of files) {
      await kv.del(`github:${file.file}`);
    }
    await kv.del('github:track_files');
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error resetting cache:', error);
    res.status(500).json({ error: `Error resetting cache: ${error.message}` });
  }
});

// Track page
app.get('/track/:id/:permalink', async (req, res) => {
  try {
    const { id } = req.params;
    const files = await getAllTrackFiles();
    const trackItem = files.find(item => item.id === parseInt(id));
    if (!trackItem) {
      console.error(`Track with ID ${id} not found in files`);
      return res.status(404).send('Post not found');
    }

    const post = await getGitHubFile(trackItem.file);

    // Fetch related posts (same artist)
    const related = (await Promise.all(
      files
        .filter(item => item.id !== parseInt(id))
        .map(async (item) => {
          try {
            const track = await getGitHubFile(item.file);
            return { id: item.id, artist: track.artist, title: track.title };
          } catch (error) {
            console.error(`Skipping related file ${item.file}: ${error.message}`);
            return null;
          }
        })
    ))
      .filter(item => item !== null && item.artist === post.artist)
      .slice(0, 20);

    const relatedContent = parseBlogTags(`
      <div class="lagu">
        <a title="Download %var-artist% - %var-title% Mp3" href="/track/%id%/:permalink:">%var-artist% - %var-title%</a>
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
                <tr><td>Category</td><td>:</td><td>%var-category%</td></tr>
                <tr><td>Duration</td><td>:</td><td>%var-duration% minutes</td></tr>
                <tr><td>Bitrate</td><td>:</td><td>128, 192, 320 Kbps</td></tr>
              </tbody>
            </table>
          </div>
          <div class="container">
            <h2><center>â��â�� Download MP3 ~%var-bitrate% kb/s â��â��</center></h2>
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
            </span> Â»
            <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
              <a itemtype="https://schema.org/Thing" itemprop="item" href="/site-allmusic.html">
                <span itemprop="name">K-Pop</span>
              </a>
              <meta itemprop="position" content="2">
            </span> Â»
            <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
              <a itemtype="https://schema.org/Thing" itemprop="item" href="/search/%var-artist%">
                <span itemprop="name">%var-artist%</span>
              </a>
              <meta itemprop="position" content="3">
            </span> Â»
            <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
              <span itemprop="name">%var-title%</span>
              <meta itemprop="position" content="4">
            </span>
          </div>
          <br>
          <div class="note">
           %var-lyrics%
          </div>
        </div>
      </div>`, [post], { noMessage: 'No Post' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        ${getMetaHeader(post, `https://wallkpop.vercel.app/track/${id}/${req.params.permalink}`)}
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
  } catch (error) {
    console.error('Error fetching track:', error);
    res.status(500).send('Error fetching post');
  }
});

// Search page
app.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const files = await getAllTrackFiles();
    const posts = [];
    for (const item of files) {
      try {
        const track = await getGitHubFile(item.file);
        if (
          track.artist.toLowerCase().includes(query) ||
          track.title.toLowerCase().includes(query) ||
          track.year.toString().includes(query) ||
          track.category.toLowerCase().includes(query)
        ) {
          posts.push({ ...track, id: item.id });
        }
      } catch (error) {
        console.error(`Skipping search file ${item.file}: ${error.message}`);
        continue;
      }
    }
    // Sort search results by created_at in descending order
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const filteredPosts = posts.slice(0, 40);

    const searchResults = parseBlogTags(`
      <div class="album-list">
        <table>
          <tbody>
            <tr valign="top">
              <td class="kpops-list-thumb" align="center">
                <div style="position: relative; display: inline-block; width: 60px; height: 55px;">
                  <img class="thumb" src="%var-thumb%" alt="%var-artist% - %var-title%.mp3" width="60px" height="55px" style="display: block;">
                </div>
              </td>
              <td align="left">
                <span>
                  <a title="Download %title% mp3" href="/track/%id%/:permalink:"><b>%var-artist% - %var-title%</b></a><br>
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
      </div>`, filteredPosts, { limit: 40, noMessage: '<center>No File</center>' });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        ${getMetaHeader(null, `https://wallkpop.vercel.app/search/${req.params.query}`)}
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
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error searching');
  }
});

// API for posting
app.post('/api/post', async (req, res) => {
  try {
    const {
      artist, title, year, album, genre, category, duration, size, size128, size192, size320,
      bitrate, bitrate128, bitrate192, bitrate320, thumb, link, link2, url128, url192, url320,
      lyricstimestamp, lyrics, name
    } = req.body;

    // Validate required fields
    if (!artist || !title || !year) {
      return res.status(400).json({ error: 'Missing required fields: artist, title, or year' });
    }
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) {
      return res.status(400).json({ error: 'Invalid year value' });
    }

    // Generate ID and slug
    const latestId = await getLatestId();
    const newId = latestId + 1;
    const existingFiles = await getAllTrackFiles();
    if (existingFiles.some(file => file.id === newId)) {
      console.error(`ID ${newId} already exists`);
      return res.status(400).json({ error: 'ID conflict detected' });
    }
    const slug = generatePermalink(artist, title);
    const filePath = `file/${newId}-${slug}.json`;

    // Create track data
    const trackData = {
      id: newId,
      artist,
      title,
      year: yearNum,
      album: album || null,
      genre: genre || null,
      category: category || null,
      duration: duration || null,
      size: size || null,
      size128: size128 || null,
      size192: size192 || null,
      size320: size320 || null,
      bitrate: bitrate || '192',
      bitrate128: bitrate128 || '128',
      bitrate192: bitrate192 || '192',
      bitrate320: bitrate320 || '320',
      thumb: thumb || null,
      link: link || null,
      link2: link2 || null,
      url128: url128 || null,
      url192: url192 || null,
      url320: url320 || null,
      lyricstimestamp: lyricstimestamp || null,
      lyrics: lyrics || null,
      name: name || `${artist} - ${title}`,
      created_at: new Date().toISOString()
    };

    // Save track
    await updateGitHubFile(filePath, trackData, `Add track ${newId}: ${artist} - ${title}`);

    // Force refresh track files cache
    await getAllTrackFiles();

    res.json({ id: newId, permalink: `/track/${newId}/${slug}` });
  } catch (error) {
    console.error('Error uploading track:', error);
    res.status(500).json({ error: `Error saving post: ${error.message}` });
  }
});

module.exports = app;
