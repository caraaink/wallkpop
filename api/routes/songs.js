const express = require('express');
const Song = require('../models/Song');

const router = express.Router();

// Post new song
router.post('/', async (req, res) => {
  try {
    const song = new Song(req.body);
    await song.save();
    res.status(201).json(song);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post song' });
  }
});

// Get song by ID
router.get('/:id', async (req, res) => {
  try {
    const song = await Song.findOne({ id: parseInt(req.params.id) });
    if (!song) return res.status(404).json({ error: 'Song not found' });
    res.json(song);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch song' });
  }
});

// Increment view count
router.put('/:id/view', async (req, res) => {
  try {
    const song = await Song.findOneAndUpdate(
      { id: parseInt(req.params.id) },
      { $inc: { views: 1 } },
      { new: true }
    );
    res.json(song);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update views' });
  }
});

// Get related songs by artist
router.get('/', async (req, res) => {
  try {
    const { artist, excludeId } = req.query;
    const query = { artist, id: { $ne: parseInt(excludeId) } };
    const songs = await Song.find(query).limit(5);
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch related songs' });
  }
});

// Search songs
router.get('/search/:permalink', async (req, res) => {
  try {
    const { t } = req.query; // timeframe: all, week, month
    const query = {
      $or: [
        { artist: new RegExp(req.params.permalink, 'i') },
        { title: new RegExp(req.params.permalink, 'i') },
        { year: new RegExp(req.params.permalink, 'i') }
      ]
    };

    if (t === 'week') {
      query.upl = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (t === 'month') {
      query.upl = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const songs = await Song.find(query).sort({ views: -1 }).limit(20);
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search songs' });
  }
});

module.exports = router
