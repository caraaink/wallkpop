const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const songsRouter = require('./routes/songs');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'));

app.use('/api/songs', songsRouter);

module.exports = app;
