const express = require('express');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../config/db');
const { appendEmployeeToFile } = require('../utils/fileLogger');
const { saveDocument } = require('../utils/documentStorage');

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
  const validGenders = ['Male', 'Female', 'Other'];
  const validStatuses = ['Active', 'Probation', 'Resigned', 'Terminated'];

  const d = {
    emp_code: (body.emp_code || '').trim().toUpperCase(),
    full_name: (body.full_name || '').trim(),
    email: (body.email || '').trim().toLowerCase(),
    phone: (body.phone || '').trim(),
    department: (body.department || '').trim(),
    designation: (body.designation || '').trim(),
    gender: (body.gender || '').trim(),
    dob: (body.dob || '').trim() || null,
    salary: body.salary,
    joining_date: (body.joining_date || '').trim(),
    status: validStatuses.includes(body.status) ? body.status : 'Active',
    exit_date: (body.exit_date || '').trim() || null,
    avatar: (body.avatar || '').trim(),

    // Personal & Emergency Contact
    marital_status: (body.marital_status || '').trim() || null,
    blood_group: (body.blood_group || '').trim() || null,
    emergency_contact_name: (body.emergency_contact_name || '').trim() || null,
    emergency_contact_relation: (body.emergency_contact_relation || '').trim() || null,
    emergency_contact_phone: (body.emergency_contact_phone || '').trim() || null,

    // Address
    current_address: (body.current_address || '').trim() || null,
    permanent_address: (body.permanent_address || '').trim() || null,
    city: (body.city || '').trim() || null,
    state: (body.state || '').trim() || null,
    pincode: (body.pincode || '').trim() || null,

    // Bank Details
    bank_name: (body.bank_name || '').trim() || null,
    account_holder: (body.account_holder || '').trim() || null,
    account_number: (body.account_number || '').trim() || null,
    ifsc_code: (body.ifsc_code || '').trim().toUpperCase() || null,
    branch_name: (body.branch_name || '').trim() || null,

    // Hierarchy / Reporting Manager
    manager_id: body.manager_id ? Number(body.manager_id) : null
  };

  if (!/^[A-Z0-9-]{3,20}$/.test(d.emp_code)) e.emp_code = 'Employee ID: 3-20 letters/numbers (e.g. EMP101).';
  if (d.full_name.length < 3) e.full_name = 'Name must be at least 3 characters.';
  if (!emailRegex.test(d.email)) e.email = 'Enter a valid email.';
  if (!/^[0-9]{10}$/.test(d.phone)) e.phone = 'Phone must be 10 digits.';
  if (!d.department) e.department = 'Select a department.';
  if (d.designation.length < 2) e.designation = 'Enter designation.';
  if (!d.gender || !validGenders.includes(d.gender)) e.gender = 'Please select a gender (Male, Female, or Other).';
  const sal = Number(d.salary);
  if (!(sal > 0) || sal > 99999999) e.salary = 'Enter a valid salary.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.joining_date)) e.joining_date = 'Select joining date.';
  if (d.dob && !/^\d{4}-\d{2}-\d{2}$/.test(d.dob)) e.dob = 'Select a valid birth date.';
  d.salary = sal;

  return { data: d, errors: e };
}

// Helper for upcoming dates (within next 30 days)
function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today.getFullYear(), m - 1, d);
  let nextYear = today.getFullYear();
  if (target < today) {
    nextYear = today.getFullYear() + 1;
    target = new Date(nextYear, m - 1, d);
  }
  const diffDays = Math.round((target - today) / 864e5);
  return { diffDays, targetYear: nextYear, day: d, month: m };
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// GET /api/employees?q=&department=&status=
router.get('/', async (req, res) => {
  try {
    const { q = '', department = '', status = '' } = req.query;
    const where = [];
    const params = [];
    if (q.trim()) {
      where.push('(e.full_name LIKE ? OR e.emp_code LIKE ? OR e.email LIKE ? OR e.designation LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like, like, like);
    }
    if (department.trim()) {
      where.push('e.department = ?');
      params.push(department.trim());
    }
    if (status.trim()) {
      where.push('e.status = ?');
      params.push(status.trim());
    }
    const sql = `
      SELECT e.*, m.full_name AS manager_name, m.emp_code AS manager_code
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.id DESC
    `;
    const [rows] = await getPool().query(sql, params);
    res.json({ employees: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch employees.' });
  }
});

// GET /api/employees/org-chart  (Reporting Hierarchy)
router.get('/org-chart', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT e.id, e.emp_code, e.full_name, e.email, e.phone, e.department,
             e.designation, e.gender, e.salary, e.joining_date, e.status, e.avatar,
             e.manager_id, m.full_name AS manager_name, m.emp_code AS manager_code
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.status IN ('Active', 'Probation')
      ORDER BY e.department, e.full_name
    `);

    // Build hierarchy
    const empMap = {};
    rows.forEach(r => {
      empMap[r.id] = { ...r, children: [], directReportsCount: 0 };
    });

    const roots = [];
    rows.forEach(r => {
      if (r.manager_id && empMap[r.manager_id] && r.manager_id !== r.id) {
        empMap[r.manager_id].children.push(empMap[r.id]);
        empMap[r.manager_id].directReportsCount++;
      } else {
        roots.push(empMap[r.id]);
      }
    });

    res.json({ roots, all: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch org chart.' });
  }
});

// POST /api/employees/bulk-import  (Bulk Excel/CSV Import)
router.post('/bulk-import', async (req, res) => {
  try {
    const { employees: list = [], updateExisting = false } = req.body;
    if (!Array.isArray(list) || !list.length) {
      return res.status(400).json({ message: 'No employee records provided in import payload.' });
    }

    const pool = getPool();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    const validStatuses = ['Active', 'Probation', 'Resigned', 'Terminated'];
    const validGenders = ['Male', 'Female', 'Other'];

    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      const rowNum = i + 2; // considering header is line 1

      const empCode = String(row.emp_code || row.emp_id || row['Employee ID'] || row['Emp ID'] || '').trim().toUpperCase();
      const fullName = String(row.full_name || row.name || row['Full Name'] || row['Name'] || '').trim();
      const email = String(row.email || row['Email'] || '').trim().toLowerCase();
      const phone = String(row.phone || row.mobile || row['Phone'] || row['Phone Number'] || '').replace(/[^0-9]/g, '');
      const department = String(row.department || row.dept || row['Department'] || 'General').trim();
      const designation = String(row.designation || row.role || row['Designation'] || 'Staff').trim();
      const rawGender = String(row.gender || row['Gender'] || 'Male').trim();
      const gender = validGenders.includes(rawGender) ? rawGender : 'Male';
      const salary = Number(row.salary || row['Salary'] || row['Monthly Salary'] || 0);

      // Date parsing
      let rawJoining = row.joining_date || row['Joining Date'] || new Date().toISOString().slice(0, 10);
      if (typeof rawJoining === 'number') {
        // Excel serial date number conversion
        const d = new Date((rawJoining - 25569) * 86400 * 1000);
        rawJoining = d.toISOString().slice(0, 10);
      }
      const joiningDate = String(rawJoining).slice(0, 10);

      const rawStatus = String(row.status || row['Status'] || 'Active').trim();
      const status = validStatuses.includes(rawStatus) ? rawStatus : 'Active';

      // Validation
      if (!empCode || !fullName || !email) {
        errors.push(`Row ${rowNum}: Employee ID, Name, and Email are required.`);
        skipped++;
        continue;
      }
      if (!emailRegex.test(email)) {
        errors.push(`Row ${rowNum}: Invalid email (${email}).`);
        skipped++;
        continue;
      }

      // Check duplicates
      const [existing] = await pool.query(
        'SELECT id FROM employees WHERE emp_code = ? OR email = ?',
        [empCode, email]
      );

      const empRecord = {
        emp_code: empCode,
        full_name: fullName,
        email,
        phone: phone.slice(-10) || '9876543210',
        department,
        designation,
        gender,
        dob: row.dob ? String(row.dob).slice(0, 10) : null,
        salary: salary > 0 ? salary : 30000,
        joining_date: joiningDate,
        status,
        exit_date: row.exit_date ? String(row.exit_date).slice(0, 10) : null,
        marital_status: row.marital_status || null,
        blood_group: row.blood_group || null,
        emergency_contact_name: row.emergency_contact_name || null,
        emergency_contact_relation: row.emergency_contact_relation || null,
        emergency_contact_phone: row.emergency_contact_phone || null,
        current_address: row.current_address || null,
        permanent_address: row.permanent_address || null,
        city: row.city || null,
        state: row.state || null,
        pincode: row.pincode || null,
        bank_name: row.bank_name || null,
        account_holder: row.account_holder || fullName,
        account_number: row.account_number || null,
        ifsc_code: row.ifsc_code ? String(row.ifsc_code).toUpperCase() : null,
        branch_name: row.branch_name || null
      };

      if (existing.length) {
        if (updateExisting) {
          await pool.query(`
            UPDATE employees SET
              full_name = ?, phone = ?, department = ?, designation = ?,
              gender = ?, salary = ?, status = ?
            WHERE id = ?
          `, [empRecord.full_name, empRecord.phone, empRecord.department, empRecord.designation,
              empRecord.gender, empRecord.salary, empRecord.status, existing[0].id]);
          updated++;
        } else {
          skipped++;
        }
      } else {
        await Promise.all([
          appendEmployeeToFile(empRecord),
          pool.query(`
            INSERT INTO employees
              (emp_code, full_name, email, phone, department, designation, gender, dob, salary, joining_date, status, exit_date,
               marital_status, blood_group, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
               current_address, permanent_address, city, state, pincode, bank_name, account_holder, account_number, ifsc_code, branch_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            empRecord.emp_code, empRecord.full_name, empRecord.email, empRecord.phone,
            empRecord.department, empRecord.designation, empRecord.gender, empRecord.dob,
            empRecord.salary, empRecord.joining_date, empRecord.status, empRecord.exit_date,
            empRecord.marital_status, empRecord.blood_group, empRecord.emergency_contact_name,
            empRecord.emergency_contact_relation, empRecord.emergency_contact_phone,
            empRecord.current_address, empRecord.permanent_address, empRecord.city,
            empRecord.state, empRecord.pincode, empRecord.bank_name, empRecord.account_holder,
            empRecord.account_number, empRecord.ifsc_code, empRecord.branch_name
          ])
        ]);
        imported++;
      }
    }

    res.json({
      message: `Bulk import completed: ${imported} added, ${updated} updated, ${skipped} skipped.`,
      imported,
      updated,
      skipped,
      errors
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing bulk import.' });
  }
});

// GET /api/employees/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const { start_date = '', end_date = '' } = req.query;

    // 1. Overall Headcount & Salary Totals
    const [[totals]] = await pool.query(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Probation') THEN 1 ELSE 0 END), 0) AS active_total,
        COALESCE(SUM(CASE WHEN status = 'Probation' THEN 1 ELSE 0 END), 0) AS probation_total,
        COALESCE(SUM(CASE WHEN status IN ('Resigned', 'Terminated') THEN 1 ELSE 0 END), 0) AS departed_total,
        COALESCE(AVG(CASE WHEN status IN ('Active', 'Probation') THEN salary ELSE NULL END), 0) AS avg_salary,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Probation') THEN salary ELSE 0 END), 0) AS total_salary
      FROM employees
    `);

    // 2. Gender Ratio Breakdown
    const [[genderStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN gender = 'Male' THEN 1 ELSE 0 END), 0) AS male,
        COALESCE(SUM(CASE WHEN gender = 'Female' THEN 1 ELSE 0 END), 0) AS female,
        COALESCE(SUM(CASE WHEN gender = 'Other' THEN 1 ELSE 0 END), 0) AS other,
        COUNT(*) AS total_count
      FROM employees
    `);

    const gTotal = genderStats.total_count || 1;
    const genderRatio = {
      male: Number(genderStats.male),
      female: Number(genderStats.female),
      other: Number(genderStats.other),
      malePct: Math.round((Number(genderStats.male) / gTotal) * 100),
      femalePct: Math.round((Number(genderStats.female) / gTotal) * 100),
      otherPct: Math.round((Number(genderStats.other) / gTotal) * 100)
    };

    // 3. Department-wise Headcount & Salary
    const [byDept] = await pool.query(`
      SELECT 
        department,
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Probation') THEN 1 ELSE 0 END), 0) AS active_count,
        ROUND(COALESCE(AVG(salary), 0)) AS avg_salary,
        ROUND(COALESCE(SUM(salary), 0)) AS total_salary
      FROM employees
      GROUP BY department
      ORDER BY total_count DESC
    `);

    const departments = byDept.map(d => ({
      department: d.department,
      count: Number(d.total_count) || 0,
      total_count: Number(d.total_count) || 0,
      active_count: Number(d.active_count) || 0,
      avg_salary: Number(d.avg_salary) || 0,
      total_salary: Number(d.total_salary) || 0
    }));

    // 4. Joining Trend (With optional date range filter)
    const trendParams = [];
    let trendWhere = '';
    if (start_date && end_date) {
      trendWhere = 'WHERE joining_date >= ? AND joining_date <= ?';
      trendParams.push(start_date, end_date);
    } else if (start_date) {
      trendWhere = 'WHERE joining_date >= ?';
      trendParams.push(start_date);
    } else if (end_date) {
      trendWhere = 'WHERE joining_date <= ?';
      trendParams.push(end_date);
    }

    const [rawTrend] = await pool.query(`
      SELECT 
        DATE_FORMAT(joining_date, '%Y-%m') AS ym,
        COUNT(*) AS joiners,
        COALESCE(SUM(salary), 0) AS added_payroll
      FROM employees
      ${trendWhere}
      GROUP BY ym
      ORDER BY ym ASC
    `, trendParams);

    let cumulativeHeadcount = 0;
    const joiningTrend = rawTrend.map(t => {
      const j = Number(t.joiners) || 0;
      cumulativeHeadcount += j;
      return {
        ym: t.ym,
        month: t.ym,
        joiners: j,
        count: j,
        cumulative_headcount: cumulativeHeadcount,
        added_payroll: Number(t.added_payroll) || 0
      };
    });

    // 5. Attrition Rate Calculation
    const [[attritionStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN status IN ('Resigned', 'Terminated') THEN 1 ELSE 0 END), 0) AS departed,
        COUNT(*) AS total_ever,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Probation') THEN 1 ELSE 0 END), 0) AS current_active
      FROM employees
    `);
    const totalEver = attritionStats.total_ever || 1;
    const departed = attritionStats.departed || 0;
    const attritionRate = totalEver > 0 ? ((departed / totalEver) * 100).toFixed(1) : 0;

    // 6. Upcoming Birthdays and Work Anniversaries (Next 30 days)
    const [allActiveEmps] = await pool.query(`
      SELECT id, emp_code, full_name, department, designation, dob, joining_date, avatar
      FROM employees
      WHERE status IN ('Active', 'Probation')
    `);

    const upcomingBirthdays = [];
    const upcomingAnniversaries = [];

    for (const emp of allActiveEmps) {
      if (emp.dob) {
        const b = getDaysUntil(emp.dob);
        if (b && b.diffDays >= 0 && b.diffDays <= 30) {
          upcomingBirthdays.push({
            id: emp.id,
            emp_code: emp.emp_code,
            full_name: emp.full_name,
            department: emp.department,
            designation: emp.designation,
            avatar: emp.avatar,
            date_str: `${b.day} ${MONTH_NAMES[b.month - 1]}`,
            days_left: b.diffDays
          });
        }
      }

      if (emp.joining_date) {
        const a = getDaysUntil(emp.joining_date);
        const joinYear = Number(String(emp.joining_date).slice(0, 4));
        if (a && a.diffDays >= 0 && a.diffDays <= 30) {
          const years = a.targetYear - joinYear;
          if (years >= 1) {
            upcomingAnniversaries.push({
              id: emp.id,
              emp_code: emp.emp_code,
              full_name: emp.full_name,
              department: emp.department,
              designation: emp.designation,
              avatar: emp.avatar,
              years,
              date_str: `${a.day} ${MONTH_NAMES[a.month - 1]}`,
              days_left: a.diffDays
            });
          }
        }
      }
    }

    upcomingBirthdays.sort((a, b) => a.days_left - b.days_left);
    upcomingAnniversaries.sort((a, b) => a.days_left - b.days_left);

    // 7. Pending Leave Requests Widget Data
    const [pendingLeaves] = await pool.query(`
      SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.days,
             l.reason, l.status, l.created_at,
             e.emp_code, e.full_name, e.department, e.designation, e.avatar
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      WHERE l.status = 'Pending'
      ORDER BY l.id DESC
      LIMIT 6
    `);

    res.json({
      ...totals,
      attrition_rate: attritionRate,
      genderRatio,
      departments,
      joiningTrend,
      upcomingBirthdays,
      upcomingAnniversaries,
      pendingLeaves
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch statistics.' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const sql = `
      SELECT e.*, m.full_name AS manager_name, m.emp_code AS manager_code
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = ?
    `;
    const [rows] = await getPool().query(sql, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found.' });

    // Also get documents
    const [docs] = await getPool().query(
      'SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC',
      [req.params.id]
    );

    res.json({ employee: rows[0], documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch employee.' });
  }
});

// GET /api/employees/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const [docs] = await getPool().query(
      'SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY id DESC',
      [req.params.id]
    );
    res.json({ documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch documents.' });
  }
});

// POST /api/employees/:id/documents  (Upload Document: Aadhaar, PAN, Offer Letter, Resume)
router.post('/:id/documents', async (req, res) => {
  try {
    const { doc_type, file_name, base64 } = req.body;
    if (!doc_type || !base64) {
      return res.status(400).json({ message: 'Document type and file content are required.' });
    }
    const pool = getPool();
    const [emp] = await pool.query('SELECT id, full_name FROM employees WHERE id = ?', [req.params.id]);
    if (!emp.length) return res.status(404).json({ message: 'Employee not found.' });

    const saved = await saveDocument({
      base64,
      originalName: file_name || `${doc_type}.pdf`,
      docType: doc_type,
      employeeId: req.params.id
    });

    const [insertResult] = await pool.query(`
      INSERT INTO employee_documents (employee_id, doc_type, file_name, file_url, file_size, storage_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.params.id, doc_type, saved.file_name, saved.file_url, saved.file_size, saved.storage_type]);

    res.status(201).json({
      message: `${doc_type} uploaded successfully.`,
      document: {
        id: insertResult.insertId,
        employee_id: req.params.id,
        doc_type,
        file_name: saved.file_name,
        file_url: saved.file_url,
        file_size: saved.file_size,
        storage_type: saved.storage_type
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Could not upload document.' });
  }
});

// DELETE /api/employees/:id/documents/:docId
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const pool = getPool();
    const [result] = await pool.query(
      'DELETE FROM employee_documents WHERE id = ? AND employee_id = ?',
      [req.params.docId, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Document not found.' });
    res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not delete document.' });
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
         (emp_code, full_name, email, phone, department, designation, gender, dob, salary, joining_date, status, exit_date, avatar,
          marital_status, blood_group, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
          current_address, permanent_address, city, state, pincode, bank_name, account_holder, account_number, ifsc_code, branch_name, manager_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.emp_code, data.full_name, data.email, data.phone, data.department,
         data.designation, data.gender, data.dob, data.salary, data.joining_date,
         data.status, data.exit_date, data.avatar,
         data.marital_status, data.blood_group, data.emergency_contact_name, data.emergency_contact_relation, data.emergency_contact_phone,
         data.current_address, data.permanent_address, data.city, data.state, data.pincode,
         data.bank_name, data.account_holder, data.account_number, data.ifsc_code, data.branch_name, data.manager_id]
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
      `UPDATE employees SET 
         emp_code=?, full_name=?, email=?, phone=?, department=?,
         designation=?, gender=?, dob=?, salary=?, joining_date=?,
         status=?, exit_date=?, avatar=?,
         marital_status=?, blood_group=?, emergency_contact_name=?, emergency_contact_relation=?, emergency_contact_phone=?,
         current_address=?, permanent_address=?, city=?, state=?, pincode=?,
         bank_name=?, account_holder=?, account_number=?, ifsc_code=?, branch_name=?, manager_id=?
       WHERE id=?`,
      [data.emp_code, data.full_name, data.email, data.phone, data.department,
       data.designation, data.gender, data.dob, data.salary, data.joining_date,
       data.status, data.exit_date, avatarUrl,
       data.marital_status, data.blood_group, data.emergency_contact_name, data.emergency_contact_relation, data.emergency_contact_phone,
       data.current_address, data.permanent_address, data.city, data.state, data.pincode,
       data.bank_name, data.account_holder, data.account_number, data.ifsc_code, data.branch_name, data.manager_id,
       req.params.id]
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
