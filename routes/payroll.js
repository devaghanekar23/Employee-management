const express = require('express');
const { getPool } = require('../config/db');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();

function getCurrentMonthStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Helper to calculate salary structure
function calculateStructure(grossSalary, absentDays = 0, workingDays = 30) {
  const gross = Number(grossSalary || 0);
  const basic = Math.round(gross * 0.50);
  const hra = Math.round(gross * 0.25);
  const allowances = Math.max(0, gross - basic - hra);

  // Deductions
  const pf = Math.round(basic * 0.12);
  let tax = 0;
  if (gross >= 100000) tax = Math.round(gross * 0.10);
  else if (gross >= 50000) tax = Math.round(gross * 0.05);
  else if (gross >= 30000) tax = Math.round(gross * 0.02);

  // Loss of Pay (LOP) for unexcused/absent days
  const perDay = workingDays > 0 ? gross / workingDays : 0;
  const lop = Math.round(perDay * Math.max(0, absentDays));
  const paidDays = Math.max(0, workingDays - absentDays);

  const totalDeductions = pf + tax + lop;
  const netPay = Math.max(0, gross - totalDeductions);

  return {
    gross_salary: gross,
    basic,
    hra,
    allowances,
    pf_deduction: pf,
    tax_deduction: tax,
    lop_deduction: lop,
    total_deductions: totalDeductions,
    net_salary: netPay,
    working_days: workingDays,
    paid_days: paidDays
  };
}

// GET /api/payroll?month=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const month = (req.query.month || getCurrentMonthStr()).slice(0, 7);
    const pool = getPool();

    const sql = `
      SELECT p.*, 
             e.emp_code, e.full_name, e.email, e.phone, e.department, 
             e.designation, e.joining_date, e.avatar
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.month = ?
      ORDER BY e.full_name ASC
    `;
    const [rows] = await pool.query(sql, [month]);

    const totalGross = rows.reduce((s, r) => s + Number(r.gross_salary), 0);
    const totalDeductions = rows.reduce((s, r) => s + Number(r.pf_deduction) + Number(r.tax_deduction) + Number(r.lop_deduction), 0);
    const totalNet = rows.reduce((s, r) => s + Number(r.net_salary), 0);
    const paidCount = rows.filter(r => r.status === 'Paid').length;

    res.json({
      month,
      summary: {
        total_employees: rows.length,
        total_gross: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        paid_count: paidCount,
        generated_count: rows.length - paidCount
      },
      records: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch payroll records.' });
  }
});

// POST /api/payroll/run  (Monthly Payroll Run)
router.post('/run', async (req, res) => {
  try {
    const month = (req.body.month || getCurrentMonthStr()).slice(0, 7);
    const pool = getPool();

    // Fetch active employees
    const [employees] = await pool.query(`
      SELECT id, full_name, emp_code, salary 
      FROM employees 
      WHERE status = 'Active'
    `);

    if (!employees.length) {
      return res.status(400).json({ message: 'No active employees found to run payroll.' });
    }

    // Fetch attendance for this month to determine absent days
    const [attRows] = await pool.query(`
      SELECT employee_id, COUNT(*) AS absent_count
      FROM attendance
      WHERE DATE_FORMAT(date, '%Y-%m') = ? AND status = 'Absent'
      GROUP BY employee_id
    `, [month]);

    const absentMap = {};
    attRows.forEach(a => { absentMap[a.employee_id] = Number(a.absent_count); });

    let processedCount = 0;

    for (const emp of employees) {
      const absentDays = absentMap[emp.id] || 0;
      const calc = calculateStructure(emp.salary, absentDays, 30);

      await pool.query(`
        INSERT INTO payroll 
          (employee_id, month, gross_salary, basic, hra, allowances, pf_deduction, tax_deduction, lop_deduction, net_salary, working_days, paid_days, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Generated')
        ON DUPLICATE KEY UPDATE
          gross_salary = VALUES(gross_salary),
          basic = VALUES(basic),
          hra = VALUES(hra),
          allowances = VALUES(allowances),
          pf_deduction = VALUES(pf_deduction),
          tax_deduction = VALUES(tax_deduction),
          lop_deduction = VALUES(lop_deduction),
          net_salary = VALUES(net_salary),
          working_days = VALUES(working_days),
          paid_days = VALUES(paid_days)
      `, [
        emp.id, month, calc.gross_salary, calc.basic, calc.hra, calc.allowances,
        calc.pf_deduction, calc.tax_deduction, calc.lop_deduction, calc.net_salary,
        calc.working_days, calc.paid_days
      ]);
      processedCount++;
    }

    res.json({
      message: `Payroll processed successfully for ${processedCount} employees for ${month}.`,
      month,
      processed: processedCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not run monthly payroll.' });
  }
});

// GET /api/payroll/structure/:employee_id
router.get('/structure/:employee_id', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, emp_code, full_name, salary FROM employees WHERE id = ?', [req.params.employee_id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee not found.' });

    const calc = calculateStructure(rows[0].salary);
    res.json({ employee: rows[0], structure: calc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not calculate salary structure.' });
  }
});

// PUT /api/payroll/:id/pay  (Mark Single Record Paid)
router.put('/:id/pay', async (req, res) => {
  try {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const [result] = await pool.query(
      "UPDATE payroll SET status = 'Paid', payment_date = ? WHERE id = ?",
      [today, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Payroll record not found.' });
    res.json({ message: 'Payroll marked as Paid.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update payment status.' });
  }
});

// PUT /api/payroll/mark-all-paid
router.put('/mark-all-paid', async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ message: 'Month is required.' });
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);
    const [result] = await pool.query(
      "UPDATE payroll SET status = 'Paid', payment_date = ? WHERE month = ?",
      [today, month]
    );
    res.json({ message: `Marked all ${result.affectedRows} payroll records as Paid for ${month}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not mark payroll records as paid.' });
  }
});

// POST /api/payroll/:id/email  (Email Payslip to Employee)
router.post('/:id/email', async (req, res) => {
  try {
    const pool = getPool();
    const sql = `
      SELECT p.*, e.emp_code, e.full_name, e.email, e.department, e.designation
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.id = ?
    `;
    const [rows] = await pool.query(sql, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Payroll record not found.' });

    const p = rows[0];
    const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN');

    const subject = `Payslip for ${p.month} - ${p.full_name} (${p.emp_code})`;
    const textBody = `
Dear ${p.full_name},

Your monthly payslip for ${p.month} has been processed.

SALARY DETAILS:
------------------------------------------
Gross Salary:       ${fmt(p.gross_salary)}
Basic Salary:       ${fmt(p.basic)}
HRA:                ${fmt(p.hra)}
Allowances:         ${fmt(p.allowances)}
------------------------------------------
DEDUCTIONS:
PF (12%):           ${fmt(p.pf_deduction)}
TDS / Income Tax:   ${fmt(p.tax_deduction)}
LOP (Loss of Pay):  ${fmt(p.lop_deduction)}
Total Deductions:   ${fmt(Number(p.pf_deduction) + Number(p.tax_deduction) + Number(p.lop_deduction))}
------------------------------------------
NET PAYABLE:        ${fmt(p.net_salary)}
------------------------------------------
Working Days: ${p.working_days} | Paid Days: ${p.paid_days}
Payment Status: ${p.status}

Best regards,
HR & Payroll Department
Employee Data Manager
    `;

    const htmlBody = `
      <div style="font-family:'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#1f5fd6;color:#ffffff;padding:24px 28px">
          <h2 style="margin:0;font-size:20px">Employee Data Manager Pvt. Ltd.</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.9">Monthly Salary Payslip - ${p.month}</p>
        </div>
        <div style="padding:24px 28px">
          <p style="font-size:14px;color:#334155;margin-top:0">Dear <b>${p.full_name}</b> (<b>${p.emp_code}</b>),</p>
          <p style="font-size:13px;color:#64748b">Please find your salary breakdown for <b>${p.month}</b> below:</p>
          
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0">Earnings</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">Amount</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e2e8f0">Deductions</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0">Amount</th>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Basic Salary</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.basic)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Provident Fund (PF)</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.pf_deduction)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">HRA</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.hra)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">TDS / Tax</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.tax_deduction)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Allowances</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.allowances)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">Loss of Pay (LOP)</td>
              <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f1f5f9">${fmt(p.lop_deduction)}</td>
            </tr>
            <tr style="font-weight:700;background:#f8fafc">
              <td style="padding:10px 12px">Total Gross</td>
              <td style="padding:10px 12px;text-align:right">${fmt(p.gross_salary)}</td>
              <td style="padding:10px 12px">Total Deductions</td>
              <td style="padding:10px 12px;text-align:right;color:#dc2626">${fmt(Number(p.pf_deduction) + Number(p.tax_deduction) + Number(p.lop_deduction))}</td>
            </tr>
          </table>

          <div style="background:#e7f7ed;border-radius:8px;padding:14px 18px;margin-top:16px;text-align:center">
            <span style="font-size:12px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Net Take-Home Pay</span>
            <div style="font-size:24px;font-weight:700;color:#16a34a;margin-top:2px">${fmt(p.net_salary)}</div>
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:20px;text-align:center">This is a system generated confidential payslip.</p>
        </div>
      </div>
    `;

    const mailResult = await sendEmail({
      to: p.email,
      subject,
      text: textBody,
      html: htmlBody
    });

    res.json({
      message: mailResult.message,
      recipient: p.email,
      sentViaSmtp: mailResult.sentViaRealSmtp
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not send payslip email.' });
  }
});

module.exports = router;

