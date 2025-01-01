const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
    businessName: String,
    location: String,
    businessType: String,
    description: String,
    contactInfo: String,
    facebookLink: String,
    image: String,
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

const Business = mongoose.model('Business', businessSchema);
module.exports = Business;

