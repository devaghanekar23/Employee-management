require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDatabase } = require('./config/db');
const { authenticateUser, requirePageAuth } = require('./utils/auth');
const authRoutes = require('./routes/auth');
const portalRoutes = require('./routes/portal');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leaves');
const payrollRoutes = require('./routes/payroll');

const app = express();
const PORT = process.env.PORT || 3000;

// Support photo upload payload (base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (including uploaded avatars and documents)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Global Authentication Middleware (Attaches req.user if token is present in cookie/header)
app.use(authenticateUser);

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);

// Auth Pages
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect(req.user.role === 'employee' ? '/portal' : '/dashboard');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.redirect('/login');
});

// Employee Self-Service (ESS) Portal
app.get('/portal', requirePageAuth(['employee', 'admin', 'hr']), (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'portal.html'));
});

// Admin / HR Management Pages
app.get('/', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.redirect(req.user.role === 'employee' ? '/portal' : '/dashboard');
});

app.get('/dashboard', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/attendance', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'attendance.html')));
app.get('/leaves', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'leaves.html')));
app.get('/payroll', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'payroll.html')));
app.get('/org-chart', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'org-chart.html')));
app.get('/report', requirePageAuth(['admin', 'hr']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'report.html')));

app.use((req, res) => res.status(404).send('404 - Page not found'));

initDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('\nDatabase connection failed:', err.message);
    console.error('Check .env file (DB_USER / DB_PASSWORD) and make sure MySQL is running.\n');
    process.exit(1);
  });
