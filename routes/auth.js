const express = require('express');
const { getPool } = require('../config/db');
const { hashPassword, verifyPassword, generateToken, requireAuth, formatNameFromEmail } = require('../utils/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername = '', password = '', role = 'employee' } = req.body;
    const input = String(emailOrUsername).trim().toLowerCase();
    const pass = String(password);
    const selectedRole = ['admin', 'hr', 'employee'].includes(String(role).toLowerCase())
      ? String(role).toLowerCase()
      : 'employee';

    if (!input) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    if (!pass) {
      return res.status(400).json({ message: 'Password is required.' });
    }

    // Email format validation ("email email jaisa hona chahiye")
    const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
    const isEmpCodeOrUser = /^[a-zA-Z0-9_\-\.]+$/.test(input) && !input.includes('@');
    if (!isEmailFormat && !isEmpCodeOrUser) {
      return res.status(400).json({ message: 'Please enter a valid email address (e.g. devaghanekar@gmail.com).' });
    }

    const pool = getPool();
    const expectedName = formatNameFromEmail(input);
    let targetUserId = null;
    let targetEmpId = null;

    if (selectedRole === 'employee') {
      // 1. Ensure employee 1 remains Ankur Mohite
      if (input !== 'ankur@company.com' && input !== 'ankur@gmail.com' && !input.startsWith('ankur')) {
        try {
          await pool.query(
            "UPDATE employees SET email = 'ankur@company.com', full_name = 'Ankur Mohite' WHERE id = 1 AND LOWER(email) = ?",
            [input]
          );
        } catch (_) {}
      }

      // 2. Check if this email already has its own dedicated employee record (id != 1)
      const [ownEmps] = await pool.query(
        "SELECT id, full_name, email FROM employees WHERE LOWER(email) = ? AND id != 1 LIMIT 1",
        [input]
      );

      if (ownEmps.length > 0) {
        targetEmpId = ownEmps[0].id;
        await pool.query('UPDATE employees SET full_name = ? WHERE id = ?', [expectedName, targetEmpId]);
      } else {
        // Brand new employee account: 100% EMPTY DATA (no fake attendance, no fake payslip, no fake leaves)
        const empCode = `EMP${Math.floor(100 + Math.random() * 900)}`;
        const [insEmp] = await pool.query(
          `INSERT INTO employees (emp_code, full_name, email, phone, department, designation, salary, joining_date, status)
           VALUES (?, ?, ?, '', 'IT', 'Software Engineer', 0.00, CURDATE(), 'Active')`,
          [empCode, expectedName, input]
        );
        targetEmpId = insEmp.insertId;
      }

      // Clean up any test dummy attendance or test dummy payroll so new account starts fresh
      try {
        await pool.query("DELETE FROM attendance WHERE employee_id = ? AND notes = 'Regular working day'", [targetEmpId]);
        await pool.query("DELETE FROM payroll WHERE employee_id = ? AND gross_salary = 30000.00 AND net_salary = 26700.00", [targetEmpId]);
      } catch (_) {}

      // 3. User account linking in users table
      const [existingUsers] = await pool.query(
        'SELECT id, employee_id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
        [input, input]
      );

      const { hash, salt } = hashPassword(pass);
      if (existingUsers.length > 0) {
        targetUserId = existingUsers[0].id;
        // Point user account to targetEmpId
        await pool.query(
          'UPDATE users SET employee_id = ?, role = ?, password_hash = ?, salt = ? WHERE id = ?',
          [targetEmpId, 'employee', hash, salt, targetUserId]
        );
      } else {
        const baseUsername = input.split('@')[0].replace(/[^a-z0-9]/g, '') || `emp_${targetEmpId}`;
        let username = baseUsername;
        let suffix = 1;
        while (true) {
          const [uCheck] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
          if (!uCheck.length) break;
          username = `${baseUsername}${suffix++}`;
        }
        const [insUser] = await pool.query(
          'INSERT INTO users (employee_id, username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?, ?)',
          [targetEmpId, username, input, hash, salt, 'employee']
        );
        targetUserId = insUser.insertId;
      }
    } else {
      // Role is Admin or HR
      const [existingUsers] = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?',
        [input, input]
      );
      const { hash, salt } = hashPassword(pass);
      if (existingUsers.length > 0) {
        targetUserId = existingUsers[0].id;
        await pool.query(
          'UPDATE users SET role = ?, password_hash = ?, salt = ? WHERE id = ?',
          [selectedRole, hash, salt, targetUserId]
        );
      } else {
        const baseUsername = input.split('@')[0].replace(/[^a-z0-9]/g, '') || selectedRole;
        let username = baseUsername;
        let suffix = 1;
        while (true) {
          const [uCheck] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
          if (!uCheck.length) break;
          username = `${baseUsername}${suffix++}`;
        }
        const [insUser] = await pool.query(
          'INSERT INTO users (employee_id, username, email, password_hash, salt, role) VALUES (NULL, ?, ?, ?, ?, ?)',
          [username, input, hash, salt, selectedRole]
        );
        targetUserId = insUser.insertId;
      }
    }

    // Retrieve full user record for session token
    const [finalRows] = await pool.query(
      `SELECT u.id, u.employee_id, u.username, u.email, u.role,
              e.emp_code, e.full_name, e.department, e.designation, e.avatar, e.status
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE u.id = ?`,
      [targetUserId]
    );

    if (!finalRows.length) {
      return res.status(500).json({ message: 'Failed to initialize session. Please try again.' });
    }

    const user = finalRows[0];

    // Check account status if linked to an employee
    if (user.employee_id && (user.status === 'Terminated' || user.status === 'Resigned')) {
      return res.status(403).json({ message: 'This employee account is no longer active. Please contact HR.' });
    }

    const tokenPayload = {
      userId: user.id,
      role: user.role,
      employeeId: user.employee_id,
      email: user.email,
      name: user.full_name || (user.role === 'admin' ? 'System Administrator' : (user.role === 'hr' ? 'HR Manager' : user.username))
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
        full_name: tokenPayload.name,
        department: user.department || (user.role === 'admin' ? 'Administration' : 'Human Resources'),
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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email = '' } = req.body;
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ message: 'Please provide your registered email address.' });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, e.full_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE LOWER(u.email) = ?`,
      [cleanEmail]
    );

    // Generic response to prevent user enumeration
    const genericMsg = 'If your email is registered with us, password reset instructions have been sent to your inbox.';

    if (!rows.length) {
      return res.json({ message: genericMsg });
    }

    const user = rows[0];
    const { sendMail } = require('../utils/mailer');
    const resetMsg = `Hello ${user.full_name || user.username},\n\nA password reset request was received for your Workplace Portal account (${user.email}).\n\nTo reset your credentials, please contact your System Administrator or HR team at admin@company.com, or reply directly to this email for assistance.\n\nBest regards,\nHR & Workplace Operations`;

    try {
      await sendMail(user.email, 'Password Reset Instructions - Workplace Portal', resetMsg);
    } catch (_) {}

    res.json({ message: genericMsg });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Unable to process password reset. Please contact HR.' });
  }
});

// GET /api/auth/demo-accounts (Automatically disabled in production environment)
router.get('/demo-accounts', async (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      return res.json({
        enabled: false,
        message: 'Demo accounts are disabled in production environment.'
      });
    }

    const pool = getPool();
    const [employees] = await pool.query(
      `SELECT u.email, u.username, u.role, e.full_name, e.designation, e.department, e.avatar
       FROM users u
       JOIN employees e ON u.employee_id = e.id
       WHERE u.role = 'employee' AND e.status IN ('Active', 'Probation')
       ORDER BY CASE WHEN LOWER(e.full_name) LIKE '%deva%' OR LOWER(u.email) LIKE '%deva%' THEN 0 ELSE 1 END, e.id DESC
       LIMIT 4`
    );

    res.json({
      enabled: true,
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
      enabled: !process.env.NODE_ENV || process.env.NODE_ENV !== 'production',
      admin: { email: 'admin@company.com', pass: 'Admin@123' },
      hr: { email: 'hr@company.com', pass: 'Hr@123' },
      employees: []
    });
  }
});

module.exports = router;

