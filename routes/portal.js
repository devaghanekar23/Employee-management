const express = require('express');
const { getPool } = require('../config/db');
const { requireAuth } = require('../utils/auth');
const { processAvatar } = require('./employees');

const router = express.Router();

// Helper to determine active employee ID (works for employee, and falls back gracefully for admin testing)
async function getEffectiveEmployeeId(req) {
  if (req.user && req.user.employee_id) {
    return req.user.employee_id;
  }
  // If an Admin/HR without an employee_id opens the portal, pick the first active employee for preview
  const pool = getPool();
  const [rows] = await pool.query("SELECT id FROM employees WHERE status IN ('Active', 'Probation') LIMIT 1");
  return rows.length ? rows[0].id : null;
}

// All portal routes require logged in user
router.use(requireAuth());

// GET /api/portal/summary (Dashboard Overview Widget Data)
router.get('/summary', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) {
      return res.status(404).json({ message: 'No employee record found for this account.' });
    }

    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);

    // 1. Employee Basic Info
    const [[emp]] = await pool.query(`
      SELECT e.id, e.emp_code, e.full_name, e.email, e.department, e.designation,
             e.salary, e.joining_date, e.avatar, e.status,
             m.full_name AS manager_name
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = ?
    `, [empId]);

    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // 2. Today's Attendance Punch Status
    const [[todayAtt]] = await pool.query(
      'SELECT id, date, status, check_in_time, check_out_time, work_hours, notes FROM attendance WHERE employee_id = ? AND date = ?',
      [empId, today]
    );

    // 3. Current Month Attendance Stats
    const [[attStats]] = await pool.query(`
      SELECT 
        COUNT(*) AS total_recorded,
        COALESCE(SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END), 0) AS present_days,
        COALESCE(SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent_days,
        COALESCE(SUM(CASE WHEN status = 'Half Day' THEN 1 ELSE 0 END), 0) AS half_days
      FROM attendance
      WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
    `, [empId, currentMonth]);

    const presentDays = Number(attStats.present_days) || 0;
    const halfDays = Number(attStats.half_days) || 0;
    const totalWorking = (Number(attStats.total_recorded) || 0) || 1;
    const attPct = Math.min(100, Math.round(((presentDays + halfDays * 0.5) / totalWorking) * 100));

    // 4. Leave Balance (Standard 18 days allowance per year)
    const annualAllowance = 18;
    const [[leaveStats]] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'Approved' THEN days ELSE 0 END), 0) AS used_days,
        COALESCE(SUM(CASE WHEN status = 'Pending' THEN days ELSE 0 END), 0) AS pending_days
      FROM leaves
      WHERE employee_id = ? AND YEAR(start_date) = YEAR(CURDATE())
    `, [empId]);

    const usedLeaves = Number(leaveStats.used_days) || 0;
    const pendingLeaves = Number(leaveStats.pending_days) || 0;
    const remainingLeaves = Math.max(0, annualAllowance - usedLeaves);

    // 5. Latest Payslip
    const [[latestPayslip]] = await pool.query(`
      SELECT month, gross_salary, net_salary, status, payment_date
      FROM payroll
      WHERE employee_id = ?
      ORDER BY month DESC
      LIMIT 1
    `, [empId]);

    // 6. Unread Notifications Count
    const [[notifStats]] = await pool.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE employee_id = ? AND is_read = FALSE',
      [empId]
    );

    res.json({
      employee: emp,
      today: {
        date: today,
        attendance: todayAtt || null,
        isCheckedIn: !!(todayAtt && todayAtt.check_in_time),
        isCheckedOut: !!(todayAtt && todayAtt.check_out_time),
        checkInTime: todayAtt ? todayAtt.check_in_time : null,
        checkOutTime: todayAtt ? todayAtt.check_out_time : null,
        workHours: todayAtt ? todayAtt.work_hours : null,
        status: todayAtt ? todayAtt.status : 'Not Marked'
      },
      monthlyAttendance: {
        month: currentMonth,
        present: presentDays,
        absent: Number(attStats.absent_days) || 0,
        halfDay: halfDays,
        attendanceRate: attPct
      },
      leaveBalance: {
        allowance: annualAllowance,
        used: usedLeaves,
        pending: pendingLeaves,
        remaining: remainingLeaves
      },
      latestPayslip: latestPayslip || null,
      unreadNotifications: Number(notifStats.unread_count) || 0
    });
  } catch (err) {
    console.error('Portal summary error:', err);
    res.status(500).json({ message: 'Could not fetch portal summary.' });
  }
});

// GET /api/portal/profile (Full My Profile View)
router.get('/profile', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const [[emp]] = await pool.query(`
      SELECT e.*, m.full_name AS manager_name, m.emp_code AS manager_code
      FROM employees e
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = ?
    `, [empId]);

    if (!emp) return res.status(404).json({ message: 'Employee not found.' });

    // Documents
    const [docs] = await pool.query(
      'SELECT id, doc_type, file_name, file_url, file_size, created_at FROM employee_documents WHERE employee_id = ? ORDER BY id DESC',
      [empId]
    );

    res.json({ employee: emp, documents: docs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load profile.' });
  }
});

// PUT /api/portal/profile (Self-Service Profile Updates: contact & address)
router.put('/profile', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const {
      phone = '',
      current_address = '',
      permanent_address = '',
      city = '',
      state = '',
      pincode = '',
      emergency_contact_name = '',
      emergency_contact_relation = '',
      emergency_contact_phone = ''
    } = req.body;

    const pool = getPool();
    await pool.query(`
      UPDATE employees
      SET phone = ?, current_address = ?, permanent_address = ?, city = ?, state = ?, pincode = ?,
          emergency_contact_name = ?, emergency_contact_relation = ?, emergency_contact_phone = ?
      WHERE id = ?
    `, [
      phone.trim(), current_address.trim(), permanent_address.trim(), city.trim(), state.trim(), pincode.trim(),
      emergency_contact_name.trim(), emergency_contact_relation.trim(), emergency_contact_phone.trim(),
      empId
    ]);

    res.json({ message: 'Profile contact details updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update profile.' });
  }
});

// POST /api/portal/avatar (Update Profile Photo)
router.post('/avatar', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ message: 'Image data is required.' });

    const pool = getPool();
    const [[old]] = await pool.query('SELECT avatar FROM employees WHERE id = ?', [empId]);
    const avatarUrl = await processAvatar(avatar, old ? old.avatar : null);

    await pool.query('UPDATE employees SET avatar = ? WHERE id = ?', [avatarUrl, empId]);
    res.json({ message: 'Profile photo updated.', avatar: avatarUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update photo.' });
  }
});

// POST /api/portal/check-in (Clock In)
router.post('/check-in', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Check if already exists for today
    const [[existing]] = await pool.query(
      'SELECT id, check_in_time FROM attendance WHERE employee_id = ? AND date = ?',
      [empId, today]
    );

    if (existing && existing.check_in_time) {
      return res.status(400).json({ message: `Already checked in today at ${existing.check_in_time}.` });
    }

    if (existing) {
      await pool.query(
        "UPDATE attendance SET status = 'Present', check_in_time = ?, notes = 'Self Web Check-in' WHERE id = ?",
        [timeStr, existing.id]
      );
    } else {
      await pool.query(
        "INSERT INTO attendance (employee_id, date, status, check_in_time, notes) VALUES (?, ?, 'Present', ?, 'Self Web Check-in')",
        [empId, today, timeStr]
      );
    }

    // Add notification
    await pool.query(
      "INSERT INTO notifications (employee_id, title, message, type) VALUES (?, 'Checked In', ?, 'attendance')",
      [empId, `You successfully clocked in today at ${timeStr}. Have a productive day!`]
    );

    res.json({
      message: `Checked in successfully at ${timeStr}!`,
      checkInTime: timeStr,
      status: 'Present'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not complete check-in.' });
  }
});

// POST /api/portal/check-out (Clock Out)
router.post('/check-out', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const [[record]] = await pool.query(
      'SELECT id, check_in_time, check_out_time, created_at FROM attendance WHERE employee_id = ? AND date = ?',
      [empId, today]
    );

    if (!record || !record.check_in_time) {
      return res.status(400).json({ message: 'You have not checked in yet today.' });
    }

    if (record.check_out_time) {
      return res.status(400).json({ message: `Already checked out today at ${record.check_out_time}.` });
    }

    // Calculate approximate work hours
    let hoursWorked = 8.0;
    try {
      const inParts = record.check_in_time.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
      if (inParts) {
        let inH = parseInt(inParts[1], 10);
        const inM = parseInt(inParts[2], 10);
        const isPM = inParts[4] && inParts[4].toUpperCase() === 'PM';
        const isAM = inParts[4] && inParts[4].toUpperCase() === 'AM';
        if (isPM && inH < 12) inH += 12;
        if (isAM && inH === 12) inH = 0;

        const checkInDate = new Date();
        checkInDate.setHours(inH, inM, 0, 0);
        const diffMs = Math.max(0, now - checkInDate);
        hoursWorked = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
      }
    } catch (_) {}

    await pool.query(
      'UPDATE attendance SET check_out_time = ?, work_hours = ? WHERE id = ?',
      [timeStr, hoursWorked, record.id]
    );

    await pool.query(
      "INSERT INTO notifications (employee_id, title, message, type) VALUES (?, 'Checked Out', ?, 'attendance')",
      [empId, `You checked out at ${timeStr}. Total time recorded: ${hoursWorked} hours.`]
    );

    res.json({
      message: `Checked out successfully at ${timeStr}! Total work: ${hoursWorked} hrs.`,
      checkOutTime: timeStr,
      workHours: hoursWorked
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not complete check-out.' });
  }
});

// GET /api/portal/attendance (History for Month)
router.get('/attendance', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const { month = new Date().toISOString().slice(0, 7) } = req.query;
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT id, date, status, check_in_time, check_out_time, work_hours, notes
       FROM attendance
       WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?
       ORDER BY date DESC`,
      [empId, month]
    );

    res.json({ month, records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch attendance history.' });
  }
});

// GET /api/portal/leaves (Leave Balance & Applications History)
router.get('/leaves', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const [applications] = await pool.query(
      `SELECT id, leave_type, start_date, end_date, days, reason, status, admin_remark, created_at
       FROM leaves
       WHERE employee_id = ?
       ORDER BY id DESC`,
      [empId]
    );

    // Leave Types Balance Calculations
    const totalAllowance = 18;
    const casualAllowance = 6;
    const sickAllowance = 6;
    const paidAllowance = 6;

    let casualUsed = 0, sickUsed = 0, paidUsed = 0;
    applications.forEach(app => {
      if (app.status === 'Approved') {
        const d = Number(app.days) || 1;
        if (app.leave_type === 'Casual Leave') casualUsed += d;
        else if (app.leave_type === 'Sick Leave') sickUsed += d;
        else paidUsed += d;
      }
    });

    res.json({
      balance: {
        total: totalAllowance,
        used: casualUsed + sickUsed + paidUsed,
        remaining: Math.max(0, totalAllowance - (casualUsed + sickUsed + paidUsed)),
        breakdown: [
          { type: 'Casual Leave', total: casualAllowance, used: casualUsed, remaining: Math.max(0, casualAllowance - casualUsed) },
          { type: 'Sick Leave', total: sickAllowance, used: sickUsed, remaining: Math.max(0, sickAllowance - sickUsed) },
          { type: 'Paid / Privilege Leave', total: paidAllowance, used: paidUsed, remaining: Math.max(0, paidAllowance - paidUsed) }
        ]
      },
      applications
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load leave records.' });
  }
});

// POST /api/portal/leaves (Apply for Leave)
router.post('/leaves', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date || !reason || !reason.trim()) {
      return res.status(400).json({ message: 'Please fill in all leave application fields.' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start) || isNaN(end) || end < start) {
      return res.status(400).json({ message: 'End date must be on or after start date.' });
    }

    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [empId, leave_type, start_date, end_date, diffDays, reason.trim()]
    );

    // Notification for employee
    await pool.query(
      `INSERT INTO notifications (employee_id, title, message, type)
       VALUES (?, 'Leave Submitted', ?, 'leave')`,
      [empId, `Your ${leave_type} request for ${diffDays} day(s) (${start_date} to ${end_date}) has been submitted for HR approval.`]
    );

    res.status(201).json({
      message: `Leave application for ${diffDays} day(s) submitted successfully.`,
      leaveId: result.insertId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not submit leave application.' });
  }
});

// GET /api/portal/payslips (My Payslips History)
router.get('/payslips', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT p.*, e.emp_code, e.full_name, e.department, e.designation, e.bank_name, e.account_number, e.ifsc_code
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.employee_id = ?
       ORDER BY p.month DESC`,
      [empId]
    );

    res.json({ payslips: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch payslips.' });
  }
});

// GET /api/portal/payslips/:month (Specific Payslip Details)
router.get('/payslips/:month', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const [[payslip]] = await pool.query(
      `SELECT p.*, e.emp_code, e.full_name, e.email, e.department, e.designation,
              e.joining_date, e.bank_name, e.account_number, e.ifsc_code, e.branch_name
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.employee_id = ? AND p.month = ?`,
      [empId, req.params.month]
    );

    if (!payslip) return res.status(404).json({ message: 'Payslip for this month not found.' });
    res.json({ payslip });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load payslip.' });
  }
});

// GET /api/portal/notifications (My Notifications)
router.get('/notifications', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    if (!empId) return res.status(404).json({ message: 'Employee record not found.' });

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, title, message, type, is_read, link_url, created_at FROM notifications WHERE employee_id = ? ORDER BY id DESC LIMIT 25',
      [empId]
    );

    res.json({ notifications: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch notifications.' });
  }
});

// PUT /api/portal/notifications/:id/read
router.put('/notifications/:id/read', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    const pool = getPool();
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND employee_id = ?', [req.params.id, empId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error marking notification read.' });
  }
});

// PUT /api/portal/notifications/read-all
router.put('/notifications/read-all', async (req, res) => {
  try {
    const empId = await getEffectiveEmployeeId(req);
    const pool = getPool();
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE employee_id = ?', [empId]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ message: 'Error marking notifications read.' });
  }
});

module.exports = router;

