const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentMonthStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// GET /api/attendance?date=YYYY-MM-DD
// Returns attendance for all employees on that specific date + day summary
router.get('/', async (req, res) => {
  try {
    const date = (req.query.date || getTodayStr()).slice(0, 10);
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT e.id AS employee_id, e.emp_code, e.full_name, e.department, e.designation, e.avatar,
              a.id AS attendance_id, COALESCE(a.status, 'Unmarked') AS status, a.notes, a.date
       FROM employees e
       LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = ?
       ORDER BY e.full_name ASC`,
      [date]
    );

    const summary = {
      date,
      total: rows.length,
      present: rows.filter(r => r.status === 'Present').length,
      absent: rows.filter(r => r.status === 'Absent').length,
      half_day: rows.filter(r => r.status === 'Half Day').length,
      unmarked: rows.filter(r => r.status === 'Unmarked').length
    };

    res.json({ date, summary, records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch attendance records.' });
  }
});

// POST /api/attendance
// Mark or update attendance for one employee
router.post('/', async (req, res) => {
  try {
    const { employee_id, date, status, notes } = req.body;
    const cleanDate = (date || getTodayStr()).slice(0, 10);

    if (!employee_id) {
      return res.status(400).json({ message: 'Employee ID is required.' });
    }
    const validStatuses = ['Present', 'Absent', 'Half Day'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO attendance (employee_id, date, status, notes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)`,
      [employee_id, cleanDate, status, notes || null]
    );

    res.json({ message: `Attendance marked as ${status}.`, employee_id, date: cleanDate, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not mark attendance.' });
  }
});

// POST /api/attendance/bulk
// Mark all employees (or multiple) as Present or Absent for a date
router.post('/bulk', async (req, res) => {
  try {
    const { date, status = 'Present' } = req.body;
    const cleanDate = (date || getTodayStr()).slice(0, 10);
    const validStatuses = ['Present', 'Absent', 'Half Day'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }

    const pool = getPool();
    const [employees] = await pool.query('SELECT id FROM employees');
    if (!employees.length) {
      return res.json({ message: 'No employees found to mark.' });
    }

    const values = employees.map(e => [e.id, cleanDate, status]);
    await pool.query(
      `INSERT INTO attendance (employee_id, date, status)
       VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [values]
    );

    res.json({ message: `Marked all ${employees.length} employees as ${status} for ${cleanDate}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not mark bulk attendance.' });
  }
});

// GET /api/attendance/summary?month=YYYY-MM
// Monthly summary for all employees
router.get('/summary', async (req, res) => {
  try {
    const month = (req.query.month || getCurrentMonthStr()).slice(0, 7);
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT e.id AS employee_id, e.emp_code, e.full_name, e.department, e.designation, e.avatar,
              COUNT(a.id) AS total_logged,
              COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) AS present_days,
              COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_days,
              COALESCE(SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END), 0) AS half_days
       FROM employees e
       LEFT JOIN attendance a ON e.id = a.employee_id AND DATE_FORMAT(a.date, '%Y-%m') = ?
       GROUP BY e.id, e.emp_code, e.full_name, e.department, e.designation, e.avatar
       ORDER BY e.full_name ASC`,
      [month]
    );

    const formatted = rows.map(r => {
      const present = Number(r.present_days);
      const half = Number(r.half_days);
      const absent = Number(r.absent_days);
      const total = Number(r.total_logged);
      const effectivePresent = present + (half * 0.5);
      const percentage = total > 0 ? Math.round((effectivePresent / total) * 100) : 0;
      return {
        ...r,
        present_days: present,
        absent_days: absent,
        half_days: half,
        total_logged: total,
        attendance_rate: percentage
      };
    });

    const companyTotal = formatted.reduce((acc, curr) => {
      acc.present += curr.present_days;
      acc.absent += curr.absent_days;
      acc.half += curr.half_days;
      acc.total += curr.total_logged;
      return acc;
    }, { present: 0, absent: 0, half: 0, total: 0 });

    const overallRate = companyTotal.total > 0
      ? Math.round(((companyTotal.present + companyTotal.half * 0.5) / companyTotal.total) * 100)
      : 0;

    res.json({
      month,
      summary: {
        total_employees: formatted.length,
        ...companyTotal,
        overall_rate: overallRate
      },
      employees: formatted
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch monthly attendance summary.' });
  }
});

// GET /api/attendance/employee/:id?month=YYYY-MM
// Single employee's attendance details for a month
router.get('/employee/:id', async (req, res) => {
  try {
    const month = (req.query.month || getCurrentMonthStr()).slice(0, 7);
    const empId = req.params.id;
    const pool = getPool();

    const [empRows] = await pool.query('SELECT * FROM employees WHERE id = ?', [empId]);
    if (!empRows.length) return res.status(404).json({ message: 'Employee not found.' });

    const [records] = await pool.query(
      `SELECT id, date, status, notes, created_at
       FROM attendance
       WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
       ORDER BY date DESC`,
      [empId, month]
    );

    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const half = records.filter(r => r.status === 'Half Day').length;
    const total = records.length;
    const rate = total > 0 ? Math.round(((present + half * 0.5) / total) * 100) : 0;

    res.json({
      employee: empRows[0],
      month,
      summary: { total, present, absent, half_day: half, rate },
      records
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch employee attendance.' });
  }
});

module.exports = router;

