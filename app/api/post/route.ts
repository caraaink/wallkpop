import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const data = await request.json();
  const permalink = `${data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${data.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const permalinkartist = data.artist.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const permalinktitle = data.title.toLowerCase().replace(/[^a-z0-9]/g, '-');

  try {
    await sql`
      INSERT INTO songs (
        coverurl, name, artist, title, album, genre, year, category, bitrate, bitrate320, bitrate192, bitrate128,
        size, size320, size192, size128, link, url, url320, url192, url128, duration, lyrics, lyricstimestamp,
        permalink, permalinkartist, permalinktitle, upl, view
      ) VALUES (
        ${data.coverurl}, ${data.name}, ${data.artist}, ${data.title}, ${data.album}, ${data.genre}, ${data.year},
        ${data.category}, ${data.bitrate}, ${data.bitrate320}, ${data.bitrate192}, ${data.bitrate128},
        ${data.size}, ${data.size320}, ${data.size192}, ${data.size128}, ${data.link}, ${data.url},
        ${data.url320}, ${data.url192}, ${data.url128}, ${data.duration}, ${data.lyrics}, ${data.lyricstimestamp},
        ${permalink}, ${permalinkartist}, ${permalinktitle}, NOW(), 0
      )
    `;
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to post song' }, { status: 500 });
  }
}
