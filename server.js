require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDatabase } = require('./config/db');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leaves');

const app = express();
const PORT = process.env.PORT || 3000;

// Support photo upload payload (base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (including uploaded avatars)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// API Endpoints
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);

// Pages
app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'views', 'dashboard.html')));
app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'views', 'attendance.html')));
app.get('/leaves', (req, res) => res.sendFile(path.join(__dirname, 'views', 'leaves.html')));
app.get('/report', (req, res) => res.sendFile(path.join(__dirname, 'views', 'report.html')));

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
