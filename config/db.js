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
      salary DECIMAL(10,2) NOT NULL,
      joining_date DATE NOT NULL,
      avatar VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

  // Existing table agar ho to avatar column ensure karo
  try {
    await pool.query(`ALTER TABLE employees ADD COLUMN avatar VARCHAR(255) DEFAULT NULL`);
  } catch (_) {}

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

  console.log(`MySQL connected. Database "${database}" ready with all tables.`);
}

const getPool = () => pool;

module.exports = { initDatabase, getPool };
