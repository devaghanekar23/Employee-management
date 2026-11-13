const express = require('express');
const { getPool } = require('../config/db');
const { hashPassword, verifyPassword, generateToken, requireAuth } = require('../utils/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername = '', password = '' } = req.body;
    const input = String(emailOrUsername).trim().toLowerCase();
    const pass = String(password);

    if (!input || !pass) {
      return res.status(400).json({ message: 'Email/Username and password are required.' });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.employee_id, u.username, u.email, u.password_hash, u.salt, u.role,
              e.emp_code, e.full_name, e.department, e.designation, e.avatar, e.status
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE LOWER(u.email) = ? OR LOWER(u.username) = ?`,
      [input, input]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid credentials. User not found.' });
    }

    const user = rows[0];

    // Check account status if linked to an employee
    if (user.employee_id && (user.status === 'Terminated' || user.status === 'Resigned')) {
      return res.status(403).json({ message: 'This employee account is no longer active.' });
    }

    const isMatch = verifyPassword(pass, user.password_hash, user.salt);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password. Please try again.' });
    }

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      employeeId: user.employee_id,
      email: user.email,
      name: user.full_name || user.username
    };

    const token = generateToken(tokenPayload);

    // Set cookie for browser navigation
    res.cookie('auth_token', token, {
      maxAge: 7 * 86400 * 1000,
      httpOnly: false, // Accessible to client-side scripts
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: user.full_name || (user.role === 'admin' ? 'System Administrator' : 'HR Manager'),
        department: user.department || 'Administration',
        designation: user.designation || (user.role === 'admin' ? 'Administrator' : 'HR Officer'),
        avatar: user.avatar || null,
        emp_code: user.emp_code || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not logged in.' });
  }

  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth(), async (req, res) => {
  try {
    const { currentPassword = '', newPassword = '' } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const pool = getPool();
    const [[user]] = await pool.query('SELECT password_hash, salt FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const isMatch = verifyPassword(currentPassword, user.password_hash, user.salt);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password.' });
    }

    const { hash, salt } = hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [hash, salt, req.user.id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update password.' });
  }
});

// GET /api/auth/demo-accounts (Useful for seamless 1-click test login)
router.get('/demo-accounts', async (req, res) => {
  try {
    const pool = getPool();
    const [employees] = await pool.query(
      `SELECT u.email, u.username, u.role, e.full_name, e.designation, e.department, e.avatar
       FROM users u
       JOIN employees e ON u.employee_id = e.id
       WHERE u.role = 'employee' AND e.status IN ('Active', 'Probation')
       LIMIT 4`
    );

    res.json({
      admin: { email: 'admin@company.com', pass: 'Admin@123', role: 'admin' },
      hr: { email: 'hr@company.com', pass: 'Hr@123', role: 'hr' },
      employees: employees.map(e => ({
        email: e.email,
        pass: 'Emp@123',
        name: e.full_name,
        role: 'employee',
        designation: e.designation,
        department: e.department
      }))
    });
  } catch (err) {
    res.json({
      admin: { email: 'admin@company.com', pass: 'Admin@123' },
      hr: { email: 'hr@company.com', pass: 'Hr@123' },
      employees: []
    });
  }
});

module.exports = router;

