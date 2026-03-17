/**
 * auth.js — Passport Google OAuth + session + RBAC middleware
 */
require('dotenv').config();
const passport      = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session       = require('express-session');
const crypto        = require('crypto');
const { get, run }  = require('./db');

// ── Passport strategy ──────────────────────────────────────────────────
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID     || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL:  process.env.GOOGLE_CALLBACK_URL  || 'http://localhost:8080/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId = profile.id;
    const email    = (profile.emails && profile.emails[0]) ? profile.emails[0].value : '';
    const name     = profile.displayName || email;
    const picture  = (profile.photos  && profile.photos[0])  ? profile.photos[0].value  : '';

    let user = await get('SELECT * FROM users WHERE google_id = ?', [googleId]);

    if (!user) {
      // First user ever → make admin, everyone else → user
      const count = await get('SELECT COUNT(*) as c FROM users');
      const role  = (count && count.c === 0) ? 'admin' : 'user';
      const id    = crypto.randomUUID();
      await run(
        `INSERT INTO users (id, google_id, email, name, picture, role, last_login)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, googleId, email, name, picture, role]
      );
      user = await get('SELECT * FROM users WHERE id = ?', [id]);
    } else {
      await run(`UPDATE users SET last_login = datetime('now'), name = ?, picture = ? WHERE id = ?`,
        [name, picture, user.id]);
      user.name    = name;
      user.picture = picture;
    }

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) console.error('[AUTH] deserializeUser: no user found for id', id);
    done(null, user || false);
  } catch (err) {
    console.error('[AUTH] deserializeUser error:', err.message);
    done(err);
  }
});

// ── Session middleware factory ─────────────────────────────────────────
function sessionMiddleware(app) {
  // Trust reverse-proxy (nginx/Cloudflare) for X-Forwarded-* headers
  app.set('trust proxy', 1);
  app.use(session({
    name:              'iqt.sid',
    secret:            process.env.SESSION_SECRET || 'iqt-secret-change-me',
    resave:            false,
    saveUninitialized: true,
    cookie: {
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure:   false, // nginx terminates SSL; Node gets plain HTTP from proxy
      sameSite: 'lax',
      domain:   process.env.COOKIE_DOMAIN || undefined,
    },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
}

// ── Auth guard middleware ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  // Always return 401 JSON for /api/* routes so fetch .catch works correctly
  if (req.path && req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/login.html');
}

function requireAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ error: 'Admin only' });
}

// ── Auth routes factory ────────────────────────────────────────────────
function authRoutes(app) {
  // Kick off Google login
  app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  // OAuth callback
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html?error=1' }),
    (req, res) => {
      // Explicitly save session before redirect to ensure cookie is written
      req.session.save((err) => {
        if (err) console.error('[AUTH] session save error:', err);
        res.redirect('/');
      });
    }
  );

  // Logout
  app.get('/auth/logout', (req, res, next) => {
    req.logout(err => {
      if (err) return next(err);
      req.session.destroy(() => res.redirect('/login.html'));
    });
  });

  // Current user info (used by frontend)
  app.get('/api/me', requireAuth, (req, res) => {
    const { id, email, name, picture, role } = req.user;
    res.json({ id, email, name, picture, role });
  });
}

module.exports = { sessionMiddleware, authRoutes, requireAuth, requireAdmin };
