import { useState } from 'react';
import axios from 'axios';

function Panel() {
  const [formData, setFormData] = useState({
    artist: '', title: '', album: '', genre: '', year: '', category: '',
    coverurl: '', bitrate: '', bitrate320: '', bitrate192: '', bitrate128: '',
    size: '', size320: '', size192: '', size128: '',
    url: '', url320: '', url192: '', url128: '',
    duration: '', lyrics: '', lyricstimestamp: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/post', {
        ...formData,
        permalink: `${formData.artist}-${formData.title}`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        permalinkartist: formData.artist.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        permalinktitle: formData.title.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        upl: new Date().toISOString(),
        views: 0
      });
      alert('Song posted successfully!');
      setFormData({
        artist: '', title: '', album: '', genre: '', year: '', category: '',
        coverurl: '', bitrate: '', bitrate320: '', bitrate192: '', bitrate128: '',
        size: '', size320: '', size192: '', size128: '',
        url: '', url320: '', url192: '', url128: '',
        duration: '', lyrics: '', lyricstimestamp: ''
      });
    } catch (error) {
      console.error('Error posting song:', error);
      alert('Failed to post song.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Add New Song</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="text" name="artist" value={formData.artist} onChange={handleChange} placeholder="Artist" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Title" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="album" value={formData.album} onChange={handleChange} placeholder="Album" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="genre" value={formData.genre} onChange={handleChange} placeholder="Genre" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="year" value={formData.year} onChange={handleChange} placeholder="Year" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="category" value={formData.category} onChange={handleChange} placeholder="Category" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="coverurl" value={formData.coverurl} onChange={handleChange} placeholder="Cover URL" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="bitrate" value={formData.bitrate} onChange={handleChange} placeholder="Bitrate" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="bitrate320" value={formData.bitrate320} onChange={handleChange} placeholder="Bitrate 320" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="bitrate192" value={formData.bitrate192} onChange={handleChange} placeholder="Bitrate 192" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="bitrate128" value={formData.bitrate128} onChange={handleChange} placeholder="Bitrate 128" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="size" value={formData.size} onChange={handleChange} placeholder="Size" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="size320" value={formData.size320} onChange={handleChange} placeholder="Size 320" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="size192" value={formData.size192} onChange={handleChange} placeholder="Size 192" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="size128" value={formData.size128} onChange={handleChange} placeholder="Size 128" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="url" value={formData.url} onChange={handleChange} placeholder="URL" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="url320" value={formData.url320} onChange={handleChange} placeholder="URL 320" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="url192" value={formData.url192} onChange={handleChange} placeholder="URL 192" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="url128" value={formData.url128} onChange={handleChange} placeholder="URL 128" className="w-full p-2 border rounded" autocomplete="off" />
        <input type="text" name="duration" value={formData.duration} onChange={handleChange} placeholder="Duration" className="w-full p-2 border rounded" autocomplete="off" />
        <textarea name="lyrics" value={formData.lyrics} onChange={handleChange} placeholder="Lyrics" className="w-full p-2 border rounded" rows="5" />
        <textarea name="lyricstimestamp" value={formData.lyricstimestamp} onChange={handleChange} placeholder="Lyrics Timestamp" className="w-full p-2 border rounded" rows="5" />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded">Submit</button>
      </form>
    </div>
  );
}

export default Panel;
