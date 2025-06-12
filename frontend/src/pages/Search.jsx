import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

function Search() {
  const { permalink } = useParams();
  const [results, setResults] = useState([]);
  const [timeframe, setTimeframe] = useState('all');

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await axios.get(`/api/songs/search/${permalink}?t=${timeframe}`);
        setResults(response.data);
      } catch (error) {
        console.error('Error searching songs:', error);
      }
    };
    fetchResults();
  }, [permalink, timeframe]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Search Results for "{permalink}"</h1>
      <div className="mb-4">
        <label className="mr-2">Sort by hits:</label>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="p-2 border rounded">
          <option value="all">All Time</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
        </select>
      </div>
      <ul>
        {results.map((song) => (
          <li key={song.id} className="mb-2">
            <Link to={`/track/${song.id}/${song.permalinkartist}/${song.permalinktitle}`} className="text-blue-500">
              {song.artist} - {song.title} ({song.year})
            </Link>
            <span className="ml-2">Views: {song.views}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Search
