const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    playtime: { type: Number, default: 0 }  // Playtime in seconds
});

const Player = mongoose.model('Player', playerSchema);

module.exports = Player;
