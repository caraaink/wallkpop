const audio = document.getElementById('player');
const lyricsContainer = document.getElementById('lyrics');
const debugContainer = document.getElementById('debug');

const lyrics = lyricsText.split('<br>').map(line => {
  const match = line.match(/\[(\d{2}):(\d{2}\.\d{2})\](.*)/);
  if (match) {
    const minutes = parseInt(match[1]);
    const seconds = parseFloat(match[2]);
    const time = minutes * 60 + seconds;
    return { start: time, text: match[3].trim() };
  }
  return null;
}).filter(line => line !== null);

let player;
try {
  player = new Plyr('#player');
  debugContainer.textContent = 'Plyr initialized';
  console.log('Plyr initialized successfully');
} catch (e) {
  debugContainer.textContent = 'Plyr failed to load';
  console.error('Plyr initialization failed:', e);
}

audio.addEventListener('loadeddata', () => {
  debugContainer.textContent = 'Audio loaded successfully';
  console.log('Audio loaded');
});

audio.addEventListener('error', (e) => {
  debugContainer.textContent = 'Audio failed to load: ' + e.message;
  console.error('Audio error:', e);
});

audio.addEventListener('timeupdate', () => {
  const currentTime = audio.currentTime;
  const currentLyric = lyrics.find(lyric =>
    currentTime >= lyric.start &&
    (lyrics[lyrics.indexOf(lyric) + 1] ? currentTime < lyrics[lyrics.indexOf(lyric) + 1].start : true)
  );

  if (currentLyric) {
    lyricsContainer.textContent = currentLyric.text;
    lyricsContainer.classList.add('active');
    debugContainer.textContent = `Time: ${currentTime.toFixed(2)}s, Lyric: ${currentLyric.text}`;
  } else {
    lyricsContainer.textContent = '';
    lyricsContainer.classList.remove('active');
    debugContainer.textContent = `Time: ${currentTime.toFixed(2)}s, No lyric`;
  }
});

audio.addEventListener('ended', () => {
  lyricsContainer.textContent = '';
  lyricsContainer.classList.remove('active');
  debugContainer.textContent = 'Audio ended';
});

function testLyrics() {
  if (lyrics.length > 0) {
    lyricsContainer.textContent = lyrics[0].text;
    lyricsContainer.classList.add('active');
    debugContainer.textContent = 'Test: Displaying first lyric';
    setTimeout(() => {
      lyricsContainer.textContent = '';
      lyricsContainer.classList.remove('active');
    }, 2000);
  } else {
    debugContainer.textContent = 'Test: No lyrics available';
  }
}
