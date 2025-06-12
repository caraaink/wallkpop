import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

function Track() {
  const { id, permalinkartist, permalinktitle } = useParams();
  const [song, setSong] = useState(null);
  const [relatedSongs, setRelatedSongs] = useState([]);

  useEffect(() => {
    const fetchSong = async () => {
      try {
        const response = await axios.get(`/api/songs/${id}`);
        setSong(response.data);
        // Increment view count
        await axios.put(`/api/songs/${id}/view`);
        // Fetch related songs by artist
        const relatedResponse = await axios.get(`/api/songs?artist=${response.data.artist}&excludeId=${id}`);
        setRelatedSongs(relatedResponse.data);
      } catch (error) {
        console.error('Error fetching song:', error);
      }
    };
    fetchSong();
  }, [id]);

  if (!song) return <div>Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold">{song.artist} - {song.title}</h1>
      <img src={song.coverurl} alt="Cover" className="w-full max-w-md my-4" />
      <p>ID: {song.id}</p>
      <p>Permalink: {song.permalink}</p>
      <p>Artist Permalink: {song.permalinkartist}</p>
      <p>Title Permalink: {song.permalinktitle}</p>
      <p>Album: {song.album}</p>
      <p>Genre: {song.genre}</p>
      <p>Year: {song.year}</p>
      <p>Category: {song.category}</p>
      <p>Views: {song.views}</p>
      <p>Upload Date: {new Date(song.upl).toLocaleDateString()}</p>
      <p>Bitrate: {song.bitrate}</p>
      <p>Size: {song.size}</p>
      <p>Duration: {song.duration}</p>
      <p>Links:</p>
      <ul>
        {song.url && <li><a href={song.url} className="text-blue-500">Default</a></li>}
        {song.url320 && <li><a href={song.url320} className="text-blue-500">320kbps</a></li>}
        {song.url192 && <li><a href={song.url192} className="text-blue-500">192kbps</a></li>}
        {song.url128 && <li><a href={song.url128} className="text-blue-500">128kbps</a></li>}
      </ul>
      <p>Lyrics:</p>
      <pre>{song.lyrics}</pre>
      <p>Lyrics Timestamp:</p>
      <pre>{song.lyricstimestamp}</pre>
      <h2 className="text-xl font-bold mt-4">Related Songs</h2>
      <ul>
        {relatedSongs.map((related) => (
          <li key={related.id}>
            <Link to={`/track/${related.id}/${related.permalinkartist}/${related.permalinktitle}`} className="text-blue-500">
              {related.artist} - {related.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Track
