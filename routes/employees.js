const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../config/db');
const { appendEmployeeToFile } = require('../utils/fileLogger');

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'avatars');

async function processAvatar(avatarInput, oldAvatar = null) {
  if (!avatarInput || typeof avatarInput !== 'string') {
    return oldAvatar;
  }
  if (avatarInput === 'REMOVE' || avatarInput.trim() === '') {
    return null;
  }
  if (avatarInput.startsWith('/uploads/avatars/')) {
    return avatarInput;
  }
  const match = avatarInput.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (match) {
    await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
    let ext = match[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';
    const filename = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(match[2], 'base64');
    await fs.promises.writeFile(filePath, buffer);
    return `/uploads/avatars/${filename}`;
  }
  return oldAvatar;
}

function validate(body) {
  const e = {};
  const d = {
    emp_code: (body.emp_code || '').trim().toUpperCase(),
    full_name: (body.full_name || '').trim(),
    email: (body.email || '').trim().toLowerCase(),
    phone: (body.phone || '').trim(),
    department: (body.department || '').trim(),
    designation: (body.designation || '').trim(),
    salary: body.salary,
    joining_date: (body.joining_date || '').trim(),
    avatar: (body.avatar || '').trim()
  };

  if (!/^[A-Z0-9-]{3,20}$/.test(d.emp_code)) e.emp_code = 'Employee ID: 3-20 letters/numbers (e.g. EMP101).';
  if (d.full_name.length < 3) e.full_name = 'Name must be at least 3 characters.';
  if (!emailRegex.test(d.email)) e.email = 'Enter a valid email.';
  if (!/^[0-9]{10}$/.test(d.phone)) e.phone = 'Phone must be 10 digits.';
  if (!d.department) e.department = 'Select a department.';
  if (d.designation.length < 2) e.designation = 'Enter designation.';
  const sal = Number(d.salary);
  if (!(sal > 0) || sal > 99999999) e.salary = 'Enter a valid salary.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.joining_date)) e.joining_date = 'Select joining date.';
  d.salary = sal;

  return { data: d, errors: e };
}

// GET /api/employees?q=&department=
router.get('/', async (req, res) => {
  try {
    const { q = '', department = '' } = req.query;
    const where = [];
    const params = [];
    if (q.trim()) {
      where.push('(full_name LIKE ? OR emp_code LIKE ? OR email LIKE ? OR designation LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like, like, like);
    }
    if (department.trim()) {
      where.push('department = ?');
      params.push(department.trim());
    }
    const sql = `SELECT * FROM employees ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
    const [rows] = await getPool().query(sql, params);
    res.json({ employees: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch employees.' });
  }
});

// GET /api/employees/stats (Summary + Department Analytics + Joining Trend)
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const [[totals]] = await pool.query(
      'SELECT COUNT(*) AS total, COALESCE(AVG(salary),0) AS avg_salary, COALESCE(SUM(salary),0) AS total_salary FROM employees'
    );
    const [byDept] = await pool.query(
      `SELECT department, 
              COUNT(*) AS count, 
              COALESCE(AVG(salary), 0) AS avg_salary, 
              COALESCE(SUM(salary), 0) AS total_salary 
       FROM employees 
       GROUP BY department 
       ORDER BY count DESC`
    );
    const [joiningTrend] = await pool.query(
      `SELECT DATE_FORMAT(joining_date, '%Y-%m') AS month, COUNT(*) AS count
       FROM employees
       GROUP BY month
       ORDER BY month ASC`
    );
    const [salaryRanges] = await pool.query(
      `SELECT
         SUM(CASE WHEN salary < 30000 THEN 1 ELSE 0 END) AS under_30k,
         SUM(CASE WHEN salary >= 30000 AND salary < 60000 THEN 1 ELSE 0 END) AS k30_to_60k,
         SUM(CASE WHEN salary >= 60000 AND salary < 100000 THEN 1 ELSE 0 END) AS k60_to_100k,
         SUM(CASE WHEN salary >= 100000 THEN 1 ELSE 0 END) AS over_100k
       FROM employees`
    );
    res.json({
      ...totals,
      departments: byDept,
      joiningTrend,
      salaryRanges: salaryRanges[0] || {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch statistics.' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ employee: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch employee.' });
  }
});

// POST /api/employees/:id/avatar  (Quick Avatar Upload)
router.post('/:id/avatar', async (req, res) => {
  try {
    const { avatar } = req.body;
    const pool = getPool();
    const [rows] = await pool.query('SELECT avatar FROM employees WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found.' });

    const avatarUrl = await processAvatar(avatar, rows[0].avatar);
    await pool.query('UPDATE employees SET avatar = ? WHERE id = ?', [avatarUrl, req.params.id]);

    res.json({ message: 'Profile photo updated.', avatar: avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update profile photo.' });
  }
});

// POST /api/employees  -> text file + MySQL dono me CONCURRENTLY save
router.post('/', async (req, res) => {
  try {
    const { data, errors } = validate(req.body);
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the errors.', errors });

    const pool = getPool();
    const [dup] = await pool.query(
      'SELECT emp_code, email FROM employees WHERE emp_code = ? OR email = ?',
      [data.emp_code, data.email]
    );
    if (dup.length) {
      const msg = dup[0].emp_code === data.emp_code
        ? 'Employee ID already exists.' : 'Email already exists.';
      return res.status(409).json({ message: msg });
    }

    const avatarUrl = await processAvatar(data.avatar, null);
    data.avatar = avatarUrl;

    // Concurrent processing: file append + DB insert ek saath
    const [, dbResult] = await Promise.all([
      appendEmployeeToFile(data),
      pool.query(
        `INSERT INTO employees
         (emp_code, full_name, email, phone, department, designation, salary, joining_date, avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.emp_code, data.full_name, data.email, data.phone, data.department,
         data.designation, data.salary, data.joining_date, data.avatar]
      )
    ]);

    res.status(201).json({
      message: 'Employee saved to text file and MySQL database.',
      id: dbResult[0].insertId,
      avatar: avatarUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not save employee.' });
  }
});

// PUT /api/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const { data, errors } = validate(req.body);
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please fix the errors.', errors });

    const pool = getPool();
    const [dup] = await pool.query(
      'SELECT id FROM employees WHERE (emp_code = ? OR email = ?) AND id <> ?',
      [data.emp_code, data.email, req.params.id]
    );
    if (dup.length)
      return res.status(409).json({ message: 'Another employee already has this ID or email.' });

    const [existing] = await pool.query('SELECT avatar FROM employees WHERE id = ?', [req.params.id]);
    const oldAvatar = existing.length ? existing[0].avatar : null;
    const avatarUrl = await processAvatar(data.avatar, oldAvatar);

    const [result] = await pool.query(
      `UPDATE employees SET emp_code=?, full_name=?, email=?, phone=?, department=?,
       designation=?, salary=?, joining_date=?, avatar=? WHERE id=?`,
      [data.emp_code, data.full_name, data.email, data.phone, data.department,
       data.designation, data.salary, data.joining_date, avatarUrl, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Employee updated successfully.', avatar: avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update employee.' });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await getPool().query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Employee not found.' });
    res.json({ message: 'Employee deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not delete employee.' });
  }
});

module.exports = router;
