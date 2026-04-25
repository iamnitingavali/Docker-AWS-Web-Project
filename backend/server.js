const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// =========================================
// DOCKER LEARNING NOTE:
// Environment variables come from docker-compose.yml
// They are injected at container startup.
// In production, use Docker secrets or AWS Secrets Manager.
// =========================================

// PostgreSQL connection (Docker service name = "db")
const pool = new Pool({
  host: process.env.DB_HOST || 'db',       // "db" = Docker service name in docker-compose
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dockerlearn',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10,                                  // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger (helpful for learning)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =========================================
// DATABASE SETUP
// Creates tables if they don't exist.
// Called once on startup.
// =========================================
async function setupDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(255) NOT NULL,
        email     VARCHAR(255) UNIQUE NOT NULL,
        password  VARCHAR(255) NOT NULL,
        role      VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(255),
        email     VARCHAR(255),
        subject   VARCHAR(255),
        message   TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Database tables ready');

    // Insert demo user if not exists
    const demo = await pool.query('SELECT id FROM users WHERE email=$1', ['demo@dockerlearn.com']);
    if (demo.rows.length === 0) {
      const hashed = await bcrypt.hash('demo1234', 10);
      await pool.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3)',
        ['Demo User', 'demo@dockerlearn.com', hashed]
      );
      console.log('✅ Demo user created: demo@dockerlearn.com / demo1234');
    }
  } catch (err) {
    console.error('❌ Database setup error:', err.message);
    // Retry after 3 seconds (DB might still be starting)
    setTimeout(setupDatabase, 3000);
  }
}

// =========================================
// JWT AUTH MIDDLEWARE
// =========================================
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// =========================================
// ROUTES
// =========================================

// Health check — used by Docker healthcheck and AWS ALB
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// --- AUTH ---

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashed]
    );

    res.status(201).json({ message: 'Account created successfully.', user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/auth/me — get current user (protected)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// --- CONTACT ---

// POST /api/contact
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Required fields missing.' });
  try {
    await pool.query(
      'INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4)',
      [name, email, subject || 'General', message]
    );
    res.json({ message: 'Message received. We will reply soon!' });
  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ error: 'Failed to save message.' });
  }
});

// --- ADMIN (protected) ---

// GET /api/admin/users
app.get('/api/admin/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });
  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// =========================================
// START SERVER
// =========================================
app.listen(PORT, async () => {
  console.log(`\n🚀 DockerLearn API running on port ${PORT}`);
  console.log(`📦 Container: Node.js ${process.version}`);
  console.log(`🗄️  Connecting to PostgreSQL at ${process.env.DB_HOST || 'db'}:5432\n`);
  await setupDatabase();
});
