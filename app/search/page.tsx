import { sql } from '@vercel/postgres';
import Link from 'next/link';

export default async function Search({ searchParams }: { searchParams: { q: string } }) {
  const query = searchParams.q || '';
  const { rows } = await sql`SELECT * FROM songs WHERE artist ILIKE ${'%' + query + '%'} OR title ILIKE ${'%' + query + '%'} OR year ILIKE ${'%' + query + '%'} LIMIT 10`;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Search Results</h1>
      <form className="mb-4">
        <input type="text" name="q" defaultValue={query} placeholder="Search artist, title, or year" className="p-2 border rounded" />
        <button type="submit" className="p-2 bg-blue-600 text-white rounded ml-2">Search</button>
      </form>
      <ul className="list-disc pl-5">
        {rows.map((song) => (
          <li key={song.id}>
            <Link href={`/track/${song.id}/${song.permalink}`} className="text-blue-600">
              {song.artist} - {song.title} ({song.year})
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="block mt-4 text-blue-600">Back to Home</Link>
    </div>
  );
}
