const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

// GET /api/leaves/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const [[stats]] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END), 0) AS rejected
      FROM leaves
    `);
    res.json(stats || { total: 0, pending: 0, approved: 0, rejected: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch leave statistics.' });
  }
});

// GET /api/leaves?status=&employee_id=
router.get('/', async (req, res) => {
  try {
    const { status = '', employee_id = '' } = req.query;
    const pool = getPool();
    const where = [];
    const params = [];

    if (status.trim()) {
      where.push('l.status = ?');
      params.push(status.trim());
    }
    if (employee_id.trim()) {
      where.push('l.employee_id = ?');
      params.push(employee_id.trim());
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `
      SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.days,
             l.reason, l.status, l.admin_remark, l.created_at,
             e.emp_code, e.full_name, e.department, e.designation, e.avatar
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      ${whereClause}
      ORDER BY l.id DESC
    `;

    const [rows] = await pool.query(sql, params);
    res.json({ leaves: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch leave records.' });
  }
});

// POST /api/leaves  (Apply Leave)
router.post('/', async (req, res) => {
  try {
    const { employee_id, leave_type, start_date, end_date, reason } = req.body;
    const errors = {};

    if (!employee_id) errors.employee_id = 'Please select an employee.';
    if (!leave_type) errors.leave_type = 'Please select a leave type.';
    if (!start_date) errors.start_date = 'Select start date.';
    if (!end_date) errors.end_date = 'Select end date.';
    if (!reason || reason.trim().length < 3) errors.reason = 'Please provide a valid reason (min 3 chars).';

    if (start_date && end_date) {
      const s = new Date(start_date);
      const e = new Date(end_date);
      if (e < s) {
        errors.end_date = 'End date cannot be earlier than start date.';
      }
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Please correct the errors.', errors });
    }

    const pool = getPool();
    const [emp] = await pool.query('SELECT id, full_name FROM employees WHERE id = ?', [employee_id]);
    if (!emp.length) {
      return res.status(404).json({ message: 'Selected employee does not exist.' });
    }

    const s = new Date(start_date);
    const e = new Date(end_date);
    const days = Math.round((e - s) / 864e5) + 1;

    const [result] = await pool.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [employee_id, leave_type, start_date, end_date, days, reason.trim()]
    );

    res.status(201).json({
      message: `Leave applied successfully for ${emp[0].full_name} (${days} day${days > 1 ? 's' : ''}).`,
      id: result.insertId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not apply leave.' });
  }
});

// PUT /api/leaves/:id/status  (Approve or Reject Leave)
router.put('/:id/status', async (req, res) => {
  try {
    const { status, admin_remark = '' } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: "Status must be 'Approved' or 'Rejected'." });
    }

    const pool = getPool();
    const [result] = await pool.query(
      'UPDATE leaves SET status = ?, admin_remark = ? WHERE id = ?',
      [status, admin_remark.trim() || null, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Leave record not found.' });
    }

    res.json({ message: `Leave application ${status.toLowerCase()} successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update leave status.' });
  }
});

// DELETE /api/leaves/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM leaves WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Leave record not found.' });
    }
    res.json({ message: 'Leave record deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not delete leave record.' });
  }
});

module.exports = router;

