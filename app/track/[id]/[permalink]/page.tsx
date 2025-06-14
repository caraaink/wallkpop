import { sql } from '@vercel/postgres';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function Track({ params }: { params: { id: string; permalink: string } }) {
  const { rows } = await sql`SELECT * FROM songs WHERE id = ${params.id}`;
  const song = rows[0];
  if (!song || song.permalink !== params.permalink) {
    notFound();
  }

  const { rows: related } = await sql`SELECT * FROM songs WHERE artist = ${song.artist} AND id != ${song.id} LIMIT 5`;

  await sql`UPDATE songs SET view = view + 1 WHERE id = ${song.id}`;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold">{song.artist} - {song.title}</h1>
      <img src={song.coverurl} alt="Cover" className="w-64 h-64 object-cover my-4" />
      <p><strong>Album:</strong> {song.album}</p>
      <p><strong>Genre:</strong> {song.genre}</p>
      <p><strong>Year:</strong> {song.year}</p>
      <p><strong>Category:</strong> {song.category}</p>
      <p><strong>Views:</strong> {song.view}</p>
      <p><strong>Uploaded:</strong> {new Date(song.upl).toLocaleDateString()}</p>
      <p><strong>Bitrate:</strong> {song.bitrate}</p>
      <p><strong>Size:</strong> {song.size}</p>
      <p><strong>Duration:</strong> {song.duration}</p>
      <p><strong>Download:</strong> <a href={song.url} className="text-blue-600">Default</a> | <a href={song.url320} className="text-blue-600">320kbps</a> | <a href={song.url192} className="text-blue-600">192kbps</a> | <a href={song.url128} className="text-blue-600">128kbps</a></p>
      <p><strong>Lyrics:</strong></p>
      <pre>{song.lyrics}</pre>
      <p><strong>Lyrics Timestamp:</strong></p>
      <pre>{song.lyricstimestamp}</pre>
      <h2 className="text-xl font-bold mt-8">Related Songs</h2>
      <ul className="list-disc pl-5">
        {related.map((rel) => (
          <li key={rel.id}>
            <Link href={`/track/${rel.id}/${rel.permalink}`} className="text-blue-600">
              {rel.artist} - {rel.title}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="block mt-4 text-blue-600">Back to Home</Link>
    </div>
  );
}
