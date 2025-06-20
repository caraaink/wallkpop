const express = require('express');
const bodyParser = require('body-parser');
const slugify = require('slugify');
const { createClient } = require('@supabase/supabase-js');
const { kv } = require('@vercel/kv');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bkoouiocqfoubimtrode.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrb291aW9jcWZvdWJpbXRyb2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzOTMyMzgsImV4cCI6MjA2NTk2OTIzOH0.o4T65bB3vbtVXOydTvBO_tK4dm5uMvoLvLFEW4ER5gk';
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GOOGLE_DRIVE_API_KEY = 'AIzaSyD00uLzmHdXXCQzlA2ibiYg2bzdbl89JOM';
const PANEL_PASSWORD = 'eren19';

const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

async function getSupabaseFile(id, slug) {
  try {
    const cacheKey = `supabase:${id}-${slug}`;
    const cached = await kv.get(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase.storage
      .from('tracks')
      .download(`${id}-${slug}.json`);
    
    if (error) {
      throw new Error(`Error fetching file ${id}-${slug}: ${error.message}`);
    }

    const content = await data.text();
    let trackData;
    try {
      trackData = JSON.parse(content);
    } catch (parseError) {
      console.error(`Invalid JSON in ${id}-${slug}: ${content.slice(0, 100)}...`);
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }

    await kv.set(cacheKey, trackData, { ex: 604800 });
    return trackData;
  } catch (error) {
    console.error(`Error fetching Supabase file ${id}-${slug}:`, error.message);
    throw error;
  }
}

async function checkFileExists(id, slug) {
  try {
    const { data, error } = await supabase.storage
      .from('tracks')
      .list('', { search: `${id}-${slug}.json` });
    
    if (error) throw error;
    return data.length > 0 ? data[0].name : null;
  } catch (error) {
    console.error(`Error checking file existence ${id}-${slug}:`, error.message);
    throw error;
  }
}

async function updateSupabaseFile(id, slug, content, retries = 2, isAdmin = false) {
  const supabaseClient = isAdmin ? supabaseAdmin : supabase;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const filePath = `${id}-${slug}.json`;
      const { error } = await supabaseClient.storage
        .from('tracks')
        .upload(filePath, JSON.stringify(content, null, 2), {
          contentType: 'application/json',
          upsert: true
        });

      if (error) throw error;

      const cacheKey = `supabase:${id}-${slug}`;
      await kv.set(cacheKey, content, { ex: 604800 });
      await kv.del('supabase:track_files');
      await kv.del('latest_id');
      return filePath;
    } catch (error) {
      if (attempt < retries && error.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limit hit for ${id}-${slug}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      console.error(`Error updating Supabase file ${id}-${slug}:`, error.message);
      throw error;
    }
  }
}

async function getAllTrackFiles(page = null, perPage = null) {
  try {
    const cacheKey = 'supabase:track_files';
    let cached = await kv.get(cacheKey);
    if (cached && !page) return cached;

    const { data, error } = await supabase.storage
      .from('tracks')
      .list();

    if (error) throw error;

    const files = [];
    const seenIds = new Set();
    for (const item of data) {
      if (!item.name.endsWith('.json')) continue;
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
        file: item.name,
      });
    }

    files.sort((a, b) => b.id - a.id);

    let result = files;
    if (page && perPage) {
      const startIndex = (page - 1) * perPage;
      result = files.slice(startIndex, startIndex + perPage);
    }

    const fullData = [];
    for (const file of result) {
      try {
        const track = await getSupabaseFile(file.id, file.slug);
        fullData.push({ ...track, id: file.id, file: file.file });
      } catch (error) {
        console.error(`Skipping file ${file.file} due to error: ${error.message}`);
        continue;
      }
    }

    if (!page) {
      await kv.set(cacheKey, fullData, { ex: 604800 });
    }

    return fullData;
  } catch (error) {
    console.error('Error fetching track files:', error.message);
    if (error.status === 404) return [];
    throw error;
  }
}

async function getLatestId(force = false) {
  try {
    const cacheKey = 'latest_id';
    if (!force) {
      const cached = await kv.get(cacheKey);
      if (cached) return cached;
    }

    const files = await getAllTrackFiles();
    const latestId = files.length === 0 ? 10 : Math.max(...files.map(item => item.id));
    await kv.set(cacheKey, latestId, { ex: 604800 });
    return latestId;
  } catch (error) {
    console.error('Error getting latest ID:', error.message);
    return 10;
  }
}

const generatePermalink = (artist, title) => {
  if (!artist || !title) return 'default-permalink';
  return slugify(`${artist}-${title}`, { lower: true, strict: true, remove: /[*+*~.()'"!:@]/g });
};

const getFormattedDate = (format) => {
  const date = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const formats = {
    'Y-m-d': `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    'd-m-Y': `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    'Y': `${date.getFullYear()}`
  };
  return formats[format] || date.toISOString().split('T')[0];
};

const getMetaHeader = (post = null, pageUrl = 'https://wallkpop.vercel.app/', query = '') => {
  const isTrackPage = post !== null;
  const isSearchPage = query !== '';
  let title, description, keywords;

  if (isSearchPage) {
    title = `Search: ${query} - Wallkpop`;
    description = `Download ${query} in MP3 format. Get the latest K-pop songs for free, only for promotional use. Support your favorite artist by buying the original track.`;
    keywords = `${query} Mp3, KPop, Download KPop, KPop Music, KPop Songs, JPop, Download JPop, JPop Music, JPop Songs, CPop, Download CPop, CPop Music, CPop Songs, Ost KDrama, Lagu Soundtrack KDrama, Lagu Drama Korea, Lagu KPop Terbaru, Tangga Lagu KPop, Download K-Pop Latest Mp3`;
  } else if (isTrackPage) {
    title = `Download ${post.title} MP3 by ${post.artist} | Free Kpop Music`;
    description = `Download ${post.title} by ${post.artist} in MP3 format. Get the latest K-pop songs for free, only for promotional use. Support your favorite artist by buying the original track.`;
    keywords = `download kpop mp3, ${post.artist}, ${post.title} mp3, free kpop song, kpop download, ${post.title} download, korean pop music`;
  } else {
    title = 'Wallkpop | Download Latest K-Pop Music MP3';
    description = 'We are K-Pop lovers who spread the love for k-music. The site does not store any files on its server. All contents are for promotion only. Please support the artists by purchasing their CDs.';
    keywords = 'KPop, Download KPop, KPop Music, KPop Songs, JPop, Download JPop, JPop Music, JPop Songs, CPop, Download CPop, CPop Music, CPop Songs, Ost KDrama, Lagu Soundtrack KDrama, Lagu Drama Korea, Lagu KPop Terbaru, Tangga Lagu KPop, Download K-Pop Latest Mp3';
  }

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
    <link rel="shortcut icon" type="image/x-icon" href="https://cdn.jsdelivr.net/gh/caraaink/meownime@main/wallkpop/favicon.ico">
    <link rel="canonical" href="${pageUrl}">
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/caraaink/meownime@main/wallkpop/style.css"/>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/caraaink/meownime@main/wallkpop/plyr.css" />
    <script src="https://cdn.jsdelivr.net/gh/caraaink/meownime@main/wallkpop/plyr.polyfilled.js"></script>
    <link href="https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" rel="stylesheet" integrity="sha384-wvfXpqpZZVQGK6TAh5PVlGOfQNHSoD2xbE+QkPxCAFlNEevoEH3Sl0sibVcOQVnN" crossorigin="anonymous">
    <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap" rel="stylesheet">
    <meta name="google-site-verification" content="9e9RaAsVDPAkag708Q30S8xSw8_qIMm87FJBoJWzink" />
    <meta name="yandex-verification" content="b507670596647101" />
    ${og}
  `;
};

const getHeader = (searchQuery = '') => `
  <div>
    <header>
      <h1 title="title"><a href="/" title="Download K-Pop Music MP3">Wallkpop</a></h1>
      <h2 title="description">Download Latest K-Pop Music & Soundtrack K-Drama. in Small Size</h2>
      <nav>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/search?q=Dance">Dance</a></li>
          <li><a href="/search?q=Ballad">Ballad</a></li>
          <li><a href="/search?q=Soundtrack">Soundtrack</a></li>
        </ul>
      </nav>
      <div id="search">
        <form action="/search" method="get">
          <input class="inp-text" type="text" maxlength="100" placeholder="Enter Music Keywords..." autocomplete="off" value="${searchQuery}" name="q">
          <input class="inp-btn" type="submit" value="Search">
        </form>
      </div>
    </header>
  </div>
`;

const getFooter = (pageUrl) => `
  <footer>
    <div class="footer">
      <div class="menufot">
        <p>We are <i>K-Pop lovers</i> who spread the love for k-music. The site does not store any files on its server. All contents are for promotion only. Please support the artists by purchasing their CDs.</p>
      </div>
      <div class="center">
        <a href="https://www.facebook.com/wallkpop_official" title="Follow Facebook" style="background:#1877F2;color:#fff;padding:3px 8px;margin:1px;border:1px solid #ddd;font-weight:bold;border-radius:4px;display:inline-block;" target="_blank">Facebook</a>
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

const generatePagination = (currentPage, totalPages, baseUrl, query = '') => {
  if (totalPages <= 1) return `<div class="paging"><span>1 of 1</span></div>`;

  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  let pagination = `<div class="paging"><span>${currentPage} of ${totalPages}</span>`;
  if (currentPage > 1) {
    pagination += ` <a href="${baseUrl}${currentPage - 1}${query ? `?q=${encodeURIComponent(query)}&page=${currentPage - 1}` : ''}">Prev</a>`;
  } else {
    pagination += ` <span>Prev</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    if (i === currentPage) {
      pagination += ` <span>${i}</span>`;
    } else {
      pagination += ` <a href="${baseUrl}${i}${query ? `?q=${encodeURIComponent(query)}&page=${i}` : ''}">${i}</a>`;
    }
  }

  if (endPage < totalPages) {
    pagination += ` <a href="${baseUrl}${totalPages}${query ? `?q=${encodeURIComponent(query)}&page=${totalPages}` : ''}">${totalPages}</a>`;
  }

  if (currentPage < totalPages) {
    pagination += ` <a href="${baseUrl}${currentPage + 1}${query ? `?q=${encodeURIComponent(query)}&page=${currentPage + 1}` : ''}">Next</a>`;
  } else {
    pagination += ` <span>Next</span>`;
  }

  pagination += `</div>`;
  return pagination;
};

const parseBlogTags = (template, posts, options = {}) => {
  const { limit = 40, noMessage = '<center>No File</center>', to = ':url-1(:to-file:):' } = options;
  if (!posts || posts.length === 0) return noMessage;

  const stripProtocol = (url) => url ? url.replace(/^https?:\/\//, '//') : '';

  let result = '';
  posts.slice(0, limit).forEach((post, index) => {
    let item = template;
    const permalink = generatePermalink(post.artist, post.title);

    let link2 = post.link2 || '#';
    const driveRegex = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/;
    const match = link2.match(driveRegex);
    if (match && match[1]) {
      link2 = `https://www.googleapis.com/drive/v3/files/${match[1]}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`;
    }

    const renderIfNotEmpty = (value, htmlTemplate) => value ? htmlTemplate.replace('%value%', value) : '';

    const escapeForJS = (str) => {
      if (!str) return '';
      return str.replace(/\\/g, '\\\\')
               .replace(/"/g, '\\"')
               .replace(/\n/g, '\\n')
               .replace(/\r/g, '\\r')
               .replace(/\t/g, '\\t');
    };

    const linkOriginal = `<a href="https://meownime.wapkizs.com/page-convert.html?to-thumb=${encodeURIComponent(stripProtocol(post.thumb || ''))}&to-size=${encodeURIComponent(post.size || '')}&to-link2=${encodeURIComponent(stripProtocol(post.link2 || ''))}&to-artist=${encodeURIComponent(post.artist || '')}&to-title=${encodeURIComponent(post.title || '')}&to-link=${encodeURIComponent(stripProtocol(post.link || ''))}&to-sizeori=${encodeURIComponent(post.size || '')}" target="_blank">
      <button class="downd bitrate-192"><span class="medium-label">MQ</span><div class="title">Download Now</div><div class="size">(${post.size || ''})</div><span class="bitrate">${post.bitrate || '192'} kb/s</span></button>
    </a>`;

    const link320 = post.url320 ? `<a href="https://meownime.wapkizs.com/page-convert.html?to-thumb=${encodeURIComponent(stripProtocol(post.thumb || ''))}&to-size=${encodeURIComponent(post.size320 || '')}&to-link2=${encodeURIComponent(stripProtocol(post.url320 || ''))}&to-artist=${encodeURIComponent(post.artist || '')}&to-title=${encodeURIComponent(post.title || '')}&to-link=${encodeURIComponent(stripProtocol(post.link || ''))}&to-sizeori=${encodeURIComponent(post.size320 || '')}" target="_blank">
      <button class="downd bitrate-320"><span class="hq-label">HQ</span><div class="title">Download Now</div><div class="size">(${post.size320 || ''})</div><span class="bitrate">${post.bitrate320 || '320'} kb/s</span></button>
    </a>` : '';

    const link192 = post.url192 ? `<a href="https://meownime.wapkizs.com/page-convert.html?to-thumb=${encodeURIComponent(stripProtocol(post.thumb || ''))}&to-size=${encodeURIComponent(post.size192 || '')}&to-link2=${encodeURIComponent(stripProtocol(post.url192 || ''))}&to-artist=${encodeURIComponent(post.artist || '')}&to-title=${encodeURIComponent(post.title || '')}&to-link=${encodeURIComponent(stripProtocol(post.link || ''))}&to-sizeori=${encodeURIComponent(post.size192 || '')}" target="_blank">
      <button class="downd bitrate-192"><span class="medium-label">MQ</span><div class="title">Download Now</div><div class="size">(${post.size192 || ''})</div><span class="bitrate">${post.bitrate192 || '192'} kb/s</span></button>
    </a>` : '';

    const link128 = post.url128 ? `<a href="https://meownime.wapkizs.com/page-convert.html?to-thumb=${encodeURIComponent(stripProtocol(post.thumb || ''))}&to-size=${encodeURIComponent(post.size128 || '')}&to-link2=${encodeURIComponent(stripProtocol(post.url128 || ''))}&to-artist=${encodeURIComponent(post.artist || '')}&to-title=${encodeURIComponent(post.title || '')}&to-link=${encodeURIComponent(stripProtocol(post.link || ''))}&to-sizeori=${encodeURIComponent(post.size128 || '')}" target="_blank">
      <button class="downd bitrate-128"><span class="low-label">LQ</span><div class="title">Download Now</div><div class="size">(${post.size128 || ''})</div><span class="bitrate">${post.bitrate128 || '128'} kb/s</span></button>
    </a>` : '';

    let downloadButtons = link320 || link192 || link128
      ? `<div class="download-buttons">${link320}${link192}${link128}</div>`
      : `<div class="download-buttons">${linkOriginal}</div>`;

    item = item.replace(/%id%/g, post.id)
      .replace(/%var-artist%/g, post.artist)
      .replace(/%var-title%/g, post.title)
      .replace(/%title%/g, `${post.artist} - ${post.title}`)
      .replace(/%var-album%/g, post.album || '')
      .replace(/%var-genre%/g, post.genre || '')
      .replace(/%var-category%/g, post.category || '')
      .replace(/%var-duration%/g, post.duration || '')
      .replace(/%var-size%/g, post.size || '')
      .replace(/%var-size128%/g, post.size128 || '')
      .replace(/%var-size192%/g, post.size192 || '')
      .replace(/%var-size320%/g, post.size320 || '')
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
      .replace(/%hits%/g, post.hits || '0')
      .replace(/%var-lyricstimestamp%/g, escapeForJS(post.lyricstimestamp || ''))
      .replace(/%var-lyrics%/g, post.lyrics || '')
      .replace(/%var-name%/g, post.name || `${post.artist} - ${post.title}`)
      .replace(/%sn%/g, index + 1)
      .replace(/%date=Y-m-d%/g, getFormattedDate('Y-m-d'))
      .replace(/%text%/g, post.year || '')
      .replace(/:url-1\(:to-file:\):/g, `/track/${post.id}/${permalink}`)
      .replace(/:page_url:/g, `https://wallkpop.vercel.app/track/${post.id}/${permalink}`)
      .replace(/:permalink:/g, permalink)
      .replace(/%var-link_original%/g, linkOriginal)
      .replace(/%var-link320%/g, link320)
      .replace(/%var-link192%/g, link192)
      .replace(/%var-link128%/g, link128)
      .replace(/%download-buttons%/g, downloadButtons);

    item = item.replace(/<tr><td width="30%">Album<\/td><td>:<\/td><td>%var-album%<\/td><\/tr>/g, 
      renderIfNotEmpty(post.album, '<tr><td width="30%">Album</td><td>:</td><td>%value%</td></tr>'))
      .replace(/<tr><td>Genre<\/td><td>:<\/td><td>%var-genre%<\/td><\/tr>/g, 
      renderIfNotEmpty(post.genre, '<tr><td>Genre</td><td>:</td><td>%value%</td></tr>'))
      .replace(/<tr><td>Category<\/td><td>%var-category%<\/td>/g, 
      renderIfNotEmpty(post.category, '<tr><td>Category</td><td>:</td><td>%value%</td></tr>'))
      .replace(/<tr><td>Duration<\/td><td>:<\/td><td>%var-duration% minutes<\/td><\/tr>/g, 
      renderIfNotEmpty(post.duration, '<tr><td>Duration</td><td>:</td><td>%value% minutes</td></tr>'));

    result += item;
  });
  return result;
};

const getPostListTemplate = () => `
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
  </div>`;

app.get(['/', '/page/:page'], async (req, res) => {
  try {
    const page = parseInt(req.params.page || req.query.page || 1);
    if (page < 1) return res.redirect('/');
    const postsPerPage = 40;

    const cacheKey = `index:page:${page}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      return res.send(cached);
    }

    const posts = await getAllTrackFiles(page, postsPerPage);
    const totalPosts = (await getAllTrackFiles()).length;
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (page > totalPages && totalPosts > 0) return res.redirect(`/page/${totalPages}`);

    const postList = parseBlogTags(getPostListTemplate(), posts, { limit: postsPerPage, noMessage: '<center>No posts available</center>' });
    const pagination = generatePagination(page, totalPages, '/page/');

    const pageUrl = `https://wallkpop.vercel.app${page > 1 ? `/page/${page}` : ''}`;
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        ${getMetaHeader(null, pageUrl)}
      </head>
      <body>
        ${getHeader()}
        <div id="content">
          <div class="album">
            <h3 style="font-size: 16px; margin: 0 0 8px 0; background: #ba412c; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 4px;">
              <span>Latest Uploaded Tracks</span>
              <span style="background: #ffffff; color: #ba412c; font-size: 12px; padding: 2px 6px; border-radius: 3px; display: inline-block;">
                <i class="fa fa-calendar" aria-hidden="true"></i> ${getFormattedDate('d-m-Y')}
              </span>
            </h3>
            ${postList}
            ${pagination}
          </div>
        </div>
        ${getFooter(pageUrl)}
      </body>
    </html>`;

    await kv.set(cacheKey, html, { ex: 604800 });
    res.send(html);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).send('Error loading posts');
  }
});

app.get('/sitemap.xml', async (req, res) => {
  try {
    const posts = await getAllTrackFiles();
    const limitedPosts = posts.slice(0, 500);
    const postsPerPage = 40;
    const totalPages = Math.ceil(posts.length / postsPerPage);

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://wallkpop.vercel.app/</loc>
    <lastmod>${getFormattedDate('Y-m-d')}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    for (const post of limitedPosts) {
      const permalink = generatePermalink(post.artist, post.title);
      sitemap += `
  <url>
    <loc>https://wallkpop.vercel.app/track/${post.id}/${permalink}</loc>
    <lastmod>${post.created_at ? new Date(post.created_at).toISOString().split('T')[0] : getFormattedDate('Y-m-d')}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    for (let page = 1; page <= totalPages; page++) {
      sitemap += `
  <url>
    <loc>https://wallkpop.vercel.app/page/${page}</loc>
    <lastmod>${getFormattedDate('Y-m-d')}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`;
    }

    sitemap += `
</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', (req, res) => {
  const robotsTxt = `
User-agent: *
Allow: /
Allow: /track/
Allow: /page/
Allow: /search
Disallow: /panel
Sitemap: https://wallkpop.vercel.app/sitemap.xml
`;
  res.header('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

app.get('/panel', async (req, res) => {
  try {
    const loginPage = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Panel Login | Wallkpop</title>
        <style>
          body { font-family: 'Lora', Arial, sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; min-height: 100vh; background: #f4f4f4; box-sizing: border-box; }
          .login-container { max-width: 400px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin: 20px auto; box-sizing: border-box; }
          .form-container { max-width: 900px; margin: 40px auto; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; padding-top: 20px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; margin-bottom: 8px; font-weight: bold; }
          .form-group input, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          .form-group textarea { height: 120px; }
          .submit-btn { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
          .submit-btn:hover { background: #0056b3; }
          .error { color: red; text-align: center; margin-top: 10px; }
          .button-group { display: flex; gap: 10px; }
          .submit-btn, .reset-btn { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; flex: 1; }
          .submit-btn:hover, .reset-btn:hover { background: #0056b3; }
          .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
          .tab { padding: 10px; cursor: pointer; border: 1px solid #ddd; border-radius: 4px; }
          .tab.active { background: #007bff; color: white; }
          .tab-content { display: none; }
          .tab-content.active { display: block; }
        </style>
        <script>
          function checkLogin() {
            const loginData = localStorage.getItem('panelLogin');
            if (loginData) {
              const { timestamp } = JSON.parse(loginData);
              const now = new Date().getTime();
              const twentyFourHours = 24 * 60 * 60 * 1000;
              if (now - timestamp < twentyFourHours) {
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('panel-content').style.display = 'block';
                return;
              } else {
                localStorage.removeItem('panelLogin');
              }
            }
          }

          function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            fetch('/panel/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                localStorage.setItem('panelLogin', JSON.stringify({ timestamp: new Date().getTime() }));
                document.getElementById('login-form').style.display = 'none';
                document.getElementById('panel-content').style.display = 'block';
              } else {
                document.getElementById('error').textContent = 'Invalid password';
              }
            })
            .catch(error => {
              document.getElementById('error').textContent = 'Error logging in';
              console.error('Login error:', error);
            });
          }

          function toggleTab(tabId) {
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            document.getElementById(tabId + '-content').classList.add('active');
            const formContainer = document.querySelector('.form-container');
            if (formContainer) {
              window.scrollTo({ top: formContainer.offsetTop - 20, behavior: 'smooth' });
            }
          }

          function resetForm() {
            document.getElementById('json-form').reset();
            document.getElementById('manual-form').reset();
            document.getElementById('submit-btn').textContent = 'Upload Track';
            fetch('/panel/reset-cache', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            })
              .then(response => response.json())
              .then(result => {
                if (result.message) alert('Cache cleared successfully');
                else alert('Error clearing cache: ' + (result.error || 'Unknown error'));
              })
              .catch(error => {
                console.error('Reset cache error:', error);
                alert('Error clearing cache: ' + error.message);
              });
          }

          window.onload = checkLogin;
        </script>
      </head>
      <body>
        <div class="login-container">
          <h2 style="text-align: center;">Admin Panel Login</h2>
          <form id="login-form" onsubmit="handleLogin(event)">
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="submit-btn">Login</button>
            <div id="error" class="error"></div>
          </form>
          <div id="panel-content" style="display: none;">
            <h1>Upload Track</h1>
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
                <div class="button-group">
                  <button type="submit" id="submit-btn" class="submit-btn">Upload Track</button>
                  <button type="button" class="reset-btn" onclick="resetForm()">Reset</button>
                </div>
              </form>
            </div>
            <div id="manual-tab-content" class="tab-content">
              <form id="manual-form" action="/panel" method="POST">
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
                  <input type="number" id="var-year" name="var-year">
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
                <div class="button-group">
                  <button type="submit" id="submit-btn" class="submit-btn">Upload Track</button>
                  <button type="button" class="reset-btn" onclick="resetForm()">Reset</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </body>
    </html>`;
    res.send(loginPage);
  } catch (error) {
    console.error('Error loading panel:', error);
    res.status(500).send('Error loading panel');
  }
});

app.post('/panel/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (password === PANEL_PASSWORD) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/panel', upload.single('json-file'), async (req, res) => {
  try {
    let trackData;
    if (req.file) {
      const fileContent = await fs.readFile(req.file.path, 'utf-8');
      try {
        trackData = JSON.parse(fileContent);
        if (!Array.isArray(trackData)) trackData = [trackData];
        trackData = trackData.map(track => {
          const yearNum = parseInt(track.year, 10);
          if (isNaN(yearNum) || yearNum === 0) throw new Error('Invalid year value in JSON');
          return {
            ...track,
            year: yearNum,
            artist: track.artist?.trim() || '',
            title: track.title?.trim() || '',
            album: track.album?.trim() || '',
            genre: track.genre?.trim() || '',
            category: track.category?.trim() || '',
            duration: track.duration?.trim() || '',
            size: track.size?.trim() || '',
            size128: track.size128?.trim() || '',
            size192: track.size192?.trim() || '',
            size320: track.size320?.trim() || '',
            bitrate: track.bitrate?.trim() || '',
            bitrate128: track.bitrate128?.trim() || '',
            bitrate192: track.bitrate192?.trim() || '',
            bitrate320: track.bitrate320?.trim() || '',
            thumb: track.thumb?.trim() || '',
            link: track.link?.trim() || '',
            link2: track.link2?.trim() || '',
            url128: track.url128?.trim() || '',
            url192: track.url192?.trim() || '',
            url320: track.url320?.trim() || '',
            lyricstimestamp: track.lyricstimestamp?.trim() || '',
            lyrics: track.lyrics?.trim() || '',
            name: track.name?.trim() || `${track.artist?.trim() || ''} - ${track.title?.trim() || ''}`,
            hits: track.hits?.trim() || '0'
          };
        });
      } catch (parseError) {
        await fs.unlink(req.file.path);
        return res.status(400).send('Invalid JSON file: ' + parseError.message);
      }
      await fs.unlink(req.file.path);
    } else {
      const {
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
        'var-name': name,
        'var-hits': hits
      } = req.body;

      if (!artist || !title || !year) return res.status(400).send('Missing required fields: artist, title, or year');
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum === 0) return res.status(400).send('Invalid year value');

      trackData = [{
        artist: artist.trim(),
        title: title.trim(),
        year: yearNum,
        album: album?.trim() || '',
        genre: genre?.trim() || '',
        category: category?.trim() || '',
        duration: duration?.trim() || '',
        size: size?.trim() || '',
        size128: size128?.trim() || '',
        size192: size192?.trim() || '',
        size320: size320?.trim() || '',
        bitrate: bitrate?.trim() || '192',
        bitrate128: bitrate128?.trim() || '128',
        bitrate192: bitrate192?.trim() || '192',
        bitrate320: bitrate320?.trim() || '320',
        thumb: thumb?.trim() || '',
        link: link?.trim() || '',
        link2: link2?.trim() || '',
        url128: url128?.trim() || '',
        url192: url192?.trim() || '',
        url320: url320?.trim() || '',
        lyricstimestamp: lyricstimestamp?.trim() || '',
        lyrics: lyrics?.trim() || '',
        name: name?.trim() || `${artist.trim()} - ${title.trim()}`,
        hits: hits?.trim() || '0'
      }];
    }

    const existingFiles = await getAllTrackFiles();
    let latestId = await getLatestId(true);

    const idAssignments = trackData.map((_, index) => latestId + index + 1);
    const conflicts = idAssignments.filter(id => existingFiles.some(file => file.id === id));
    if (conflicts.length > 0) {
      await kv.del('latest_id');
      await kv.del('supabase:track_files');
      latestId = await getLatestId(true);
      const newIdAssignments = trackData.map((_, index) => latestId + index + 1);
      const newConflicts = newIdAssignments.filter(id => existingFiles.some(file => file.id === id));
      if (newConflicts.length > 0) {
        throw new Error(`ID conflicts detected: ${newConflicts.join(', ')}. Clear cache or check storage.`);
      }
      idAssignments.splice(0, idAssignments.length, ...newIdAssignments);
    }

    const results = [];
    const errors = [];

    for (let index = 0; index < trackData.length; index++) {
      try {
        const result = await processTrack(trackData[index], existingFiles, idAssignments[index]);
        results.push(result);
        existingFiles.push({
          id: idAssignments[index],
          slug: generatePermalink(trackData[index].artist, trackData[index].title),
          file: `${idAssignments[index]}-${generatePermalink(trackData[index].artist, trackData[index].title)}.json`
        });
      } catch (error) {
        errors.push({
          track: `${trackData[index].artist} - ${trackData[index].title}`,
          error: error.message
        });
        console.error(`Failed to process track ${trackData[index].artist} - ${trackData[index].title}:`, error.message);
      }
    }

    if (results.length === 0) {
      throw new Error(`No tracks uploaded successfully. Errors: ${errors.map(e => `${e.track}: ${e.error}`).join('; ')}`);
    }

    await kv.del('supabase:track_files');
    await kv.del('latest_id');

    res.redirect(results[0].permalink);
  } catch (error) {
    console.error('Error uploading track:', error);
    res.status(500).send(`Error saving post: ${error.message}`);
  }
});

async function processTrack(trackData, existingFiles, newId) {
  if (!trackData.artist || !trackData.title || trackData.year === 0) {
    throw new Error('Missing or invalid required fields: artist, title, or year');
  }
  const yearNum = parseInt(trackData.year, 10);
  if (isNaN(yearNum) || yearNum === 0) {
    throw new Error('Invalid year value in JSON');
  }

  if (existingFiles.some(file => file.id === newId)) {
    throw new Error(`ID ${newId} already exists`);
  }

  const slug = generatePermalink(trackData.artist, trackData.title);

  const finalTrackData = {
    id: String(newId),
    artist: trackData.artist,
    title: trackData.title,
    year: String(yearNum),
    album: trackData.album || '',
    genre: trackData.genre || '',
    category: trackData.category || '',
    duration: trackData.duration || '',
    size: trackData.size || '',
    size128: trackData.size128 || '',
    size192: trackData.size192 || '',
    size320: trackData.size320 || '',
    bitrate: trackData.bitrate || '',
    bitrate128: trackData.bitrate128 || '',
    bitrate192: trackData.bitrate192 || '',
    bitrate320: trackData.bitrate320 || '',
    thumb: trackData.thumb || '',
    link: trackData.link || '',
    link2: trackData.link2 || '',
    url128: trackData.url128 || '',
    url192: trackData.url192 || '',
    url320: trackData.url320 || '',
    lyricstimestamp: trackData.lyricstimestamp || '',
    lyrics: trackData.lyrics || '',
    name: trackData.name || `${trackData.artist} - ${trackData.title}`,
    created_at: new Date().toISOString(),
    hits: trackData.hits || '0'
  };

  await updateSupabaseFile(newId, slug, finalTrackData, 2, true);

  return { id: newId, permalink: `/track/${newId}/${slug}` };
}

app.post('/panel/reset-cache', async (req, res) => {
  try {
    const files = await getAllTrackFiles();
    await Promise.all(files.map(file => kv.del(`supabase:${file.file}`)));
    await kv.del('supabase:track_files');
    await kv.del('latest_id');
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error resetting cache:', error.message);
    res.status(500).json({ error: `Error resetting cache: ${error.message}` });
  }
});

app.get('/track/:id/:permalink', async (req, res) => {
  try {
    const { id, permalink } = req.params;
    const files = await getAllTrackFiles();
    const trackItem = files.find(item => item.id === parseInt(id) && item.slug === permalink);
    if (!trackItem) {
      console.error(`Track with ID ${id} and permalink ${permalink} not found`);
      return res.status(404).send('Post not found');
    }

    const post = await getSupabaseFile(trackItem.id, trackItem.slug);

    const related = files
      .filter(item => item.id !== parseInt(id) && item.artist === post.artist)
      .slice(0, 20)
      .map(item => ({ id: item.id, artist: item.artist, title: item.title }));

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
          <script src="https://cdn.jsdelivr.net/gh/caraaink/meownime@main/wallkpop/audio-lyrics-timestamp.js"></script>
          <div style="text-align: center;"><br>
            %download-buttons%
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
              <a itemtype="https://schema.org/Thing" itemprop="item" href="/search?q=%var-category%">
                <span itemprop="name">%var-category%</span>
              </a>
              <meta itemprop="position" content="2">
            </span> » 
            <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
              <a itemtype="https://schema.org/Thing" itemprop="item" href="/search?q=%var-artist%">
                <span itemprop="name">%var-artist%</span>
              </a>
              <meta itemprop="position" content="3">
            </span> » 
            <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
              <span itemprop="name">%var-title%</span>
              <meta itemprop="position" content="4">
            </span>
          </div>
          <div class="note">
            %var-lyrics%
          </div>
        </div>
      </div>`, [post], { noMessage: 'No Post' });

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        ${getMetaHeader(post, `https://wallkpop.vercel.app/track/${id}/${req.params.permalink}`)}
      </head>
      <body>
        ${getHeader()}
        ${content}
        <div id="k">
          <h3 class="title">Related Songs : <a href="/search?q=${post.artist}">More</a></h3>
          <div class="list">
            ${relatedContent}
          </div>
        </div>
        ${getFooter(`https://wallkpop.vercel.app/track/${id}/${req.params.permalink}`)}
      </body>
    </html>`;
    res.send(html);
  } catch (error) {
    console.error('Error fetching track:', error);
    res.status(500).send('Error fetching post');
  }
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const page = parseInt(req.query.page || 1);
    const postsPerPage = 40;

    const cacheKey = `search:${query}:page:${page}`;
    const cached = await kv.get(cacheKey);
    if (cached) return res.send(cached);

    const files = await getAllTrackFiles();
    const filteredFiles = files.filter(file => 
      file.artist.toLowerCase().includes(query) ||
      file.title.toLowerCase().includes(query) ||
      file.year.toString().includes(query) ||
      (file.genre && file.genre.toLowerCase().includes(query))
    );

    filteredFiles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const totalPosts = filteredFiles.length;
    const totalPages = Math.ceil(totalPosts / postsPerPage);

    if (page > totalPages && totalPosts > 0) return res.redirect(`/search?q=${encodeURIComponent(query)}&page=${totalPages}`);

    const startIndex = (page - 1) * postsPerPage;
    const paginatedPosts = filteredFiles.slice(startIndex, startIndex + postsPerPage);

    const searchResults = parseBlogTags(getPostListTemplate(), paginatedPosts, { limit: postsPerPage, noMessage: '<center>No File</center>' });
    const pagination = generatePagination(page, totalPages, '/search', query);

    const pageUrl = `https://wallkpop.vercel.app/search?q=${encodeURIComponent(req.query.q || '')}${page > 1 ? `&page=${page}` : ''}`;
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        ${getMetaHeader(null, pageUrl, req.query.q || '')}
      </head>
      <body>
        ${getHeader(req.query.q || '')}
        <div id="content">
          <h1>Search Results for "${req.query.q || ''}"</h1>
          <div class="album">
            ${searchResults}
            ${pagination}
          </div>
        </div>
        ${getFooter(pageUrl)}
      </body>
    </html>`;

    await kv.set(cacheKey, html, { ex: 604800 });
    res.send(html);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).send('Error performing search');
  }
});

module.exports = app;
