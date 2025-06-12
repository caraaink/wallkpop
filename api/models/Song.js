const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  artist: String,
  title: String,
  album: String,
  genre: String,
  year: String,
  category: String,
  coverurl: String,
  bitrate: String,
  bitrate320: String,
  bitrate192: String,
  bitrate128: String,
  size: String,
  size320: String,
  size192: String,
  size128: String,
  url: String,
  url320: String,
  url192: String,
  url128: String,
  duration: String,
  lyrics: String,
  lyricstimestamp: String,
  permalink: String,
  permalinkartist: String,
  permalinktitle: String,
  upl: Date,
  views: { type: Number, default: 0 }
}, { timestamps: true });

songSchema.pre('save', async function (next) {
  if (this.isNew) {
    const lastSong = await mongoose.model('Song').findOne().sort({ id: -1 });
    this.id = lastSong ? lastSong.id + 1 : 1;
  }
  next();
});

module.exports = mongoose.model('Song', songSchema)
