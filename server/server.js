require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { initDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

// Initialize database & seed admin if needed
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com'
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Auth rate limiter to protect against brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.'
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Explicit CSS Route Handlers to guarantee correct text/css MIME type
app.get(['/css/style.css', '/css/styles.css', '/style.css', '/styles.css'], (req, res) => {
  res.type('text/css');
  res.sendFile(path.join(__dirname, '../public/css/style.css'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback for HTML5 routing (exclude files with extensions)
app.get('*', (req, res) => {
  if (req.path.includes('.') && !req.path.endsWith('.html')) {
    return res.status(404).type('text/plain').send('Resource not found');
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  Secure AI Chatbot Application Running  `);
  console.log(`  URL: http://localhost:${PORT}          `);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=========================================`);
});

