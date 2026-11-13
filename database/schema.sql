-- Optional: server start hote hi ye sab automatically create ho jata hai.
CREATE DATABASE IF NOT EXISTS employee_manager;
USE employee_manager;

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emp_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL,
  department VARCHAR(50) NOT NULL,
  designation VARCHAR(80) NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male',
  dob DATE DEFAULT NULL,
  salary DECIMAL(10,2) NOT NULL,
  joining_date DATE NOT NULL,
  status ENUM('Active', 'Probation', 'Resigned', 'Terminated') NOT NULL DEFAULT 'Active',
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- Employee Documents Table (Aadhaar, PAN, Offer Letter, Resume, etc.)
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
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Half Day') NOT NULL DEFAULT 'Present',
  notes VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_emp_date (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Leaves Table
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
);

-- Payroll Table
CREATE TABLE IF NOT EXISTS payroll (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
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
);
