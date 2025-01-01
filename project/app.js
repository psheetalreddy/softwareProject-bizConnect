// app.js

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // Import User model
const Business = require('./models/business'); // Import Business model
const Message = require('./models/Message'); // Import Message model
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const methodOverride = require('method-override');
const fetch = require("node-fetch");

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Set up express-session
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

mongoose.connect('mongodb://127.0.0.1:27017/userAuthDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected');
}).catch((err) => {
    console.log('MongoDB connection error: ', err);
});

app.set('view engine', 'ejs');

// Home page route
app.get('/', (req, res) => {
    res.render('home');
});

// Register route
app.get('/register', (req, res) => {
    res.render('register');
});

// Handle registration
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        username: username,
        email: email,
        password: hashedPassword
    });

    try {
        await newUser.save();
        res.redirect('/login'); // Redirect to the login page after successful registration
    } catch (err) {
        res.status(500).send('Error registering user: ' + err.message);
    }
});

// Login route
app.get('/login', (req, res) => {
    res.render('login'); 
});

// Handle login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email });

    if (!user) {
        return res.status(400).send('User not found');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).send('Invalid password');
    }

    req.session.userId = user._id;
    req.session.username = user.username;

    res.redirect('/landing');
});

// landing page route to display ads after login
app.get('/landing', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const ads = await Business.find({});
        res.render('landing', { username: req.session.username, ads: ads, userId: req.session.userId }); // Render landing.ejs and pass ads data
    } catch (err) {
        res.status(500).send('Error fetching ads.');
    }
});

// Submit Ads route
app.get('/submitads', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('submitads');
});

// Handle Ad submission
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
app.post('/submitads', upload.single('image'), async (req, res) => {
    const { title, description, contactInfo, businessName, location, businessType, facebookLink } = req.body;
    const adImageUrl = req.file ? `/uploads/${req.file.filename}` : null; // Store relative path

    const newAd = new Business({
        title,
        description,
        contactInfo,
        businessName,
        location,
        businessType,
        facebookLink,
        image: adImageUrl,
        ownerId: req.session.userId,
    });

    try {
        await newAd.save();
        res.redirect('/landing');
    } catch (err) {
        res.status(500).send('Error submitting ad: ' + err.message);
    }
});

app.use('/uploads', express.static('uploads'));
app.post('/ads/:id', async (req, res) => {
    const adId = req.params.id;

    try {
        await Business.findByIdAndDelete(adId); // Delete the ad from the database
        res.status(200).send('Ad deleted successfully');
    } catch (err) {
        res.status(500).send('Error deleting ad: ' + err.message);
    }
});

// Chat route
app.get('/chat', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        // Fetch messages involving the logged-in user
        const messages = await Message.find({
            $or: [
                { sender: req.session.userId },
                { receiver: req.session.userId }
            ]
        }).populate('sender receiver', 'username'); // Assuming 'username' is the field for the user's name

        res.render('chat', { username: req.session.username, messages: messages }); // Pass messages to the chat view
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).send('Error fetching messages');
    }
});


// Route to send a message
app.post('/chat/send-message', async (req, res) => {
    if (!req.session.userId) {
        return res.status(403).send('Unauthorized');
    }

    const { receiverId, content } = req.body;
    const senderId = req.session.userId; // Use session user ID

    const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content
    });

    try {
        await message.save();
        res.json({ success: true, message });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});

// Route to get messages between two users
app.get('/chat/messages/:userId', async (req, res) => {
    if (!req.session.userId) {
        return res.status(403).send('Unauthorized');
    }

    const userId = req.params.userId;
    const loggedUserId = req.session.userId; // Get the logged-in user's ID

    try {
        const messages = await Message.find({
            $or: [
                { sender: loggedUserId, receiver: userId },
                { sender: userId, receiver: loggedUserId }
            ]
        }).populate('sender receiver', 'name');

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to retrieve messages.' });
    }
});

app.get('/bizzy', (req, res) => {
    res.render('bizzy', { welcomeMessage: "Hello! Welcome to BizConnect. How can I assist you today?" });
});

const WIT_SERVER_TOKEN = 'MVVB52F3KTUHJ7JS4QO4M4BRSN6GR4NL';

app.post("/bizzy", async (req, res) => {
    const userMessage = req.body.message;

    try {
        const witResponse = await fetch(`https://api.wit.ai/message?v=20230401&q=${encodeURIComponent(userMessage)}`, {
            headers: {
                Authorization: `Bearer ${WIT_SERVER_TOKEN}`, // Ensure this is the correct token
            },
        });

        const witData = await witResponse.json();
        
        console.log('Wit.ai response:', witData);

        const intent = witData.intents[0]?.name || null;
        const entities = witData.entities || {};

        let reply;
        if (intent === "advertisement_tips") {
            reply = "Here are some ideas for making advertisements for your business: Try engaging storytelling, include customer testimonials, or create promotional offers!";
        } else if (intent === "about_website") {
            reply = "Our website connects local businesses with users by allowing businesses to post advertisements, share promotions, and interact through comments and messages.";
        } else if (intent === "greeting") {
            reply = "Hello! Welcome to BizConnect. How can I assist you today?";
        } else if (intent === "advertising_tips" && entities["ad_type"]) {
            const adType = entities["ad_type"][0].value;
            reply = `For ${adType} advertisements, focus on visual appeal and clear messaging to attract your target audience.`;
        } else {
            reply = "I'm here to help! Feel free to ask questions about our platform or advertising tips.";
        }

        res.send(reply);
    } catch (error) {
        console.error("Error communicating with Wit.ai:", error);
        res.status(500).send("There was an error processing your request.");
    }
});

app.get('/data-deletion', (req, res) => {
    res.render('data-deletion');
});

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy(); // Destroy the session
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
});
