const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'employees.txt');

/**
 * Employee ka data local text file me append karta hai.
 * Format (pipe separated): timestamp | emp_code | name | email | phone | department | designation | salary | joining_date | avatar
 */
async function appendEmployeeToFile(emp) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const line = [
    new Date().toISOString(),
    emp.emp_code,
    emp.full_name,
    emp.email,
    emp.phone,
    emp.department,
    emp.designation,
    emp.salary,
    emp.joining_date,
    emp.avatar || ''
  ].join(' | ') + '\n';
  await fs.promises.appendFile(FILE_PATH, line, 'utf8');
}

module.exports = { appendEmployeeToFile, FILE_PATH };
