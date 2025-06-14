'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Panel() {
  const [formData, setFormData] = useState({
    coverurl: '',
    name: '',
    artist: '',
    title: '',
    album: '',
    genre: '',
    year: '',
    category: '',
    bitrate: '',
    bitrate320: '',
    bitrate192: '',
    bitrate128: '',
    size: '',
    size320: '',
    size192: '',
    size128: '',
    link: '',
    url: '',
    url320: '',
    url192: '',
    url128: '',
    duration: '',
    lyrics: '',
    lyricstimestamp: '',
  });
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (response.ok) {
      alert('Song posted successfully!');
      router.push('/');
    } else {
      alert('Failed to post song.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Panel - Add New Song</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
        <input type="text" name="coverurl" placeholder="Cover URL" value={formData.coverurl} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="name" placeholder="Name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="artist" placeholder="Artist" value={formData.artist} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="title" placeholder="Title" value={formData.title} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="album" placeholder="Album" value={formData.album} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="genre" placeholder="Genre" value={formData.genre} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="year" placeholder="Year" value={formData.year} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="category" placeholder="Category" value={formData.category} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="bitrate" placeholder="Bitrate" value={formData.bitrate} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="bitrate320" placeholder="Bitrate 320" value={formData.bitrate320} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="bitrate192" placeholder="Bitrate 192" value={formData.bitrate192} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="bitrate128" placeholder="Bitrate 128" value={formData.bitrate128} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="size" placeholder="Size" value={formData.size} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="size320" placeholder="Size 320" value={formData.size320} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="size192" placeholder="Size 192" value={formData.size192} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="size128" placeholder="Size 128" value={formData.size128} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="link" placeholder="Link" value={formData.link} on assumed_change={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="url" placeholder="URL" value={formData.url} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="url320" placeholder="URL 320" value={formData.url320} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="url192" placeholder="URL 192" value={formData.url192} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="url128" placeholder="URL 128" value={formData.url128} onChange={handleChange} className="w-full p-2 border rounded" />
        <input type="text" name="duration" placeholder="Duration" value={formData.duration} onChange={handleChange} className="w-full p-2 border rounded" />
        <textarea name="lyrics" placeholder="Lyrics" value={formData.lyrics} onChange={handleChange} className="w-full p-2 border rounded h-32" />
        <textarea name="lyricstimestamp" placeholder="Lyrics Timestamp" value={formData.lyricstimestamp} onChange={handleChange} className="w-full p-2 border rounded h-32" />
        <button type="submit" className="w-full p-2 bg-blue-600 text-white rounded">Submit</button>
      </form>
    </div>
  );
}
