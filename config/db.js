const mysql = require('mysql2/promise');

let pool;

async function initDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'employee_manager';

  // 1) Database create karo (agar nahi hai)
  const conn = await mysql.createConnection({ host, port, user, password });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await conn.end();

  // 2) Connection pool (concurrent requests ke liye)
  pool = mysql.createPool({
    host, port, user, password, database,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
  });

  // 3) Tables create karo
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      emp_code VARCHAR(20) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      phone VARCHAR(15) NOT NULL,
      department VARCHAR(50) NOT NULL,
      designation VARCHAR(80) NOT NULL,
      gender VARCHAR(10) NOT NULL DEFAULT 'Male',
      dob DATE DEFAULT NULL,
      salary DECIMAL(10,2) NOT NULL,
      joining_date DATE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Active',
      exit_date DATE DEFAULT NULL,
      avatar VARCHAR(255) DEFAULT NULL,
      marital_status VARCHAR(20) DEFAULT NULL,
      blood_group VARCHAR(10) DEFAULT NULL,
      emergency_contact_name VARCHAR(100) DEFAULT NULL,
      emergency_contact_relation VARCHAR(50) DEFAULT NULL,
      emergency_contact_phone VARCHAR(20) DEFAULT NULL,
      current_address TEXT DEFAULT NULL,
      permanent_address TEXT DEFAULT NULL,
      city VARCHAR(50) DEFAULT NULL,
      state VARCHAR(50) DEFAULT NULL,
      pincode VARCHAR(20) DEFAULT NULL,
      bank_name VARCHAR(100) DEFAULT NULL,
      account_holder VARCHAR(100) DEFAULT NULL,
      account_number VARCHAR(50) DEFAULT NULL,
      ifsc_code VARCHAR(20) DEFAULT NULL,
      branch_name VARCHAR(100) DEFAULT NULL,
      manager_id INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

  // Existing table columns auto-migration
  const columnsToAdd = [
    "ALTER TABLE employees ADD COLUMN avatar VARCHAR(255) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN gender VARCHAR(10) NOT NULL DEFAULT 'Male'",
    "ALTER TABLE employees ADD COLUMN dob DATE DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'Active'",
    "ALTER TABLE employees MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'Active'",
    "ALTER TABLE employees ADD COLUMN exit_date DATE DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN marital_status VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN blood_group VARCHAR(10) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN emergency_contact_name VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN emergency_contact_relation VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN emergency_contact_phone VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN current_address TEXT DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN permanent_address TEXT DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN city VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN state VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN pincode VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN bank_name VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN account_holder VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN account_number VARCHAR(50) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN ifsc_code VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN branch_name VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE employees ADD COLUMN manager_id INT DEFAULT NULL"
  ];
  for (const q of columnsToAdd) {
    try { await pool.query(q); } catch (_) {}
  }

  // Update existing female names to 'Female' if previously defaulted to 'Male'
  try {
    await pool.query(`
      UPDATE employees 
      SET gender = 'Female' 
      WHERE (full_name LIKE '%Saloni%' OR full_name LIKE '%Shravani%' OR full_name LIKE '%Pooja%' OR full_name LIKE '%Sneha%' OR full_name LIKE '%Neha%' OR full_name LIKE '%Priya%' OR full_name LIKE '%Ananya%')
        AND gender = 'Male'
    `);
  } catch (_) {}

  // Employee Documents table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      doc_type VARCHAR(50) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_size INT DEFAULT 0,
      storage_type VARCHAR(20) DEFAULT 'local',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )`);

  // Attendance table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      date DATE NOT NULL,
      status ENUM('Present', 'Absent', 'Half Day') NOT NULL DEFAULT 'Present',
      notes VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_emp_date (employee_id, date),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )`);

  // Leaves table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      leave_type VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INT NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
      admin_remark VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )`);

  // Payroll table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      month VARCHAR(7) NOT NULL,
      gross_salary DECIMAL(10,2) NOT NULL,
      basic DECIMAL(10,2) NOT NULL,
      hra DECIMAL(10,2) NOT NULL,
      allowances DECIMAL(10,2) NOT NULL,
      pf_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
      tax_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
      lop_deduction DECIMAL(10,2) NOT NULL DEFAULT 0,
      net_salary DECIMAL(10,2) NOT NULL,
      working_days INT NOT NULL DEFAULT 30,
      paid_days INT NOT NULL DEFAULT 30,
      status ENUM('Generated', 'Paid') NOT NULL DEFAULT 'Generated',
      payment_date DATE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_emp_month (employee_id, month),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )`);

  console.log(`MySQL connected. Database "${database}" ready with all tables.`);
}

const getPool = () => pool;

module.exports = { initDatabase, getPool };
