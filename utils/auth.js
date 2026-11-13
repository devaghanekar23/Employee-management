const crypto = require('crypto');
const { getPool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'emp_manager_secure_jwt_secret_key_2026_super_safe';

// Hash a password with salt using PBKDF2
function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

// Verify a password
function verifyPassword(password, hash, salt) {
  const calculated = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(hash, 'hex'));
}

// Base64URL encode/decode helpers
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

// Generate JWT token
function generateToken(payload, expiresInSeconds = 7 * 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Verify JWT token
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  try {
    const isSigValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!isSigValid) return null;

    const data = JSON.parse(base64UrlDecode(payload));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return data;
  } catch (_) {
    return null;
  }
}

// Extract token from request (Header, Cookie, or Query)
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Cookie parsing (e.g. token=xxx in cookie header)
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  // Query parameter fallback
  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
}

// Express Middleware: Authenticate User
async function authenticateUser(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.employee_id, u.username, u.email, u.role,
              e.emp_code, e.full_name, e.department, e.designation, e.avatar, e.status
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = ?`,
      [decoded.userId]
    );

    if (rows.length) {
      req.user = rows[0];
    } else {
      req.user = null;
    }
  } catch (err) {
    console.error('Auth lookup error:', err);
    req.user = null;
  }

  next();
}

// Express Middleware: Require Authentication & Roles for APIs
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required. Please login.' });
    }

    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied: insufficient permissions.' });
    }

    next();
  };
}

// Express Middleware: Require Auth for HTML Pages (Redirect to /login if not authenticated)
function requirePageAuth(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }

    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      // If employee tries to view admin/hr pages, redirect to their ESS portal
      if (req.user.role === 'employee') {
        return res.redirect('/portal');
      }
      return res.redirect('/dashboard');
    }

    next();
  };
}

// Extract a clean, human-readable name from an email address or username
function formatNameFromEmail(email) {
  if (!email) return 'User';
  let local = String(email).trim().toLowerCase().split('@')[0];
  if (!local) return 'User';

  // Strip trailing numbers (e.g. devaghanekar23 -> devaghanekar)
  local = local.replace(/\d+$/, '');

  // Specific common cases
  if (/^deva$/i.test(local) || /^deva[._-]?ghanekar/i.test(local)) return 'Deva Ghanekar';
  if (/^ankur$/i.test(local) || /^ankur[._-]?mohite/i.test(local)) return 'Ankur Mohite';
  if (/^admin/i.test(local)) return 'System Administrator';
  if (/^hr/i.test(local)) return 'HR Manager';

  // If local starts with "deva" and continues (e.g. devaghanekar)
  if (local.startsWith('deva') && local.length > 4) {
    const surname = local.slice(4);
    return 'Deva ' + (surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase());
  }

  // Split on dots, hyphens, underscores or camelCase
  let parts = local
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._\-]+/g, ' ')
    .trim()
    .split(/\s+/);

  return parts
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ') || 'Employee';
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  authenticateUser,
  requireAuth,
  requirePageAuth,
  formatNameFromEmail
};

