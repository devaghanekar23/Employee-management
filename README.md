# Employee Data Manager (Node.js + Express + MySQL)

A modern, full-featured Employee Data Management & HR Portal built with Node.js, Express, and MySQL.

Employee data entered in the system is:
1. **Appended to a local text file** (`data/employees.txt`), and
2. **Stored in MySQL database** (`employees`, `attendance`, `leaves` tables),
both **concurrently** using `Promise.all`.

---

## 🚀 Key Features

1. **Profile Photo Upload**:
   - Upload employee profile pictures (JPG, PNG, WebP) directly from the Add/Edit form or from the employee detail view.
   - Clean circular display with automatic fallback to colorful initials avatar.
   - Files are stored in `public/uploads/avatars/`.

2. **Attendance Tracking & Timesheet Module (`/attendance`)**:
   - Daily attendance marking: Mark employees as **Present**, **Absent**, or **Half Day** with optional notes.
   - One-click **"Mark All Present"** for instant bulk attendance.
   - Monthly Attendance Summary report with total days, attendance %, visual progress bar, and standing.
   - Direct attendance widget inside individual employee profiles.

3. **Leave Management & Approvals (`/leaves`)**:
   - Employees/Admin can apply for leaves (Casual Leave, Sick Leave, Paid Leave, Unpaid Leave).
   - Approval workflow: **✓ Approve** or **✕ Reject** applications with admin remarks.
   - Filter by status (Pending, Approved, Rejected) and department.
   - Live leave history card inside individual employee profiles.

4. **Visual Analytics & Trend Charts (Chart.js)**:
   - **Salary Analysis Chart**: Department-wise Average and Total Salary comparison (in ₹ INR).
   - **Employee Joining Trend Graph**: Hiring timeline curve showing company headcount growth over time.
   - Automatically adapts to both **Light** and **Dark** themes.

5. **Professional Excel & PDF Export**:
   - **Excel (.xlsx)**: Formatted workbook with company header, timestamp, filter details, metadata, column widths, and summary rows (Total Payroll & Average Salary) powered by SheetJS.
   - **PDF (.pdf)**: Corporate branded PDF report with custom blue header, metadata banner, KPI metrics, zebra table formatting, and confidential page numbering powered by jsPDF & AutoTable.
   - **CSV & Print**: Instant CSV download and print-ready stylesheet.

6. **Modern Responsive UI**:
   - Dark / Light mode toggle (persisted).
   - Fast instant search, multi-selection, and bulk deletion.

---

## 🛠 Tech Stack
- **Backend**: Node.js, Express.js, MySQL (mysql2/promise)
- **Frontend**: HTML5, Modern CSS (Variables, Grid, Flexbox), Vanilla JavaScript
- **Libraries**:
  - [Chart.js](https://www.chartjs.org/) for interactive graphs
  - [SheetJS (xlsx)](https://sheetjs.com/) for Excel (.xlsx) export
  - [jsPDF & AutoTable](https://github.com/parallax/jsPDF) for professional PDF reports

---

## 📋 Prerequisites
- Node.js 18+ (https://nodejs.org)
- MySQL Server 8+ running locally (e.g., MySQL Workbench, XAMPP, or WAMP)

---

## 🏃 How to Run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
#    Windows  : copy .env.example .env
#    Linux/Mac: cp .env.example .env
#    Open .env and set your MySQL DB_PASSWORD

# 3. Start the application
npm start
```

Open **http://localhost:3000** in your browser.

> **Note**: Database (`employee_manager`) and all tables (`employees`, `attendance`, `leaves`) are created **automatically** on first server launch.

---

## 📂 Pages & Routes

- `/dashboard` — Main employee dashboard with list, search, details, attendance/leave cards, and Chart.js overview
- `/attendance` — Daily attendance sheet and monthly attendance summary reports
- `/leaves` — Leave application portal and approval management
- `/report` — Comprehensive employee report with Excel, PDF, CSV export, and department analytics

---

## 📁 Project Structure

```
employee-data-manager/
├── server.js              # Application entry point & route definitions
├── config/
│   └── db.js              # MySQL connection pool & automatic table migrations
├── routes/
│   ├── employees.js       # Employee CRUD, avatar upload, and stats
│   ├── attendance.js      # Daily & monthly attendance endpoints
│   └── leaves.js          # Leave application and approval endpoints
├── utils/
│   └── fileLogger.js      # Appends employee records to text file
├── database/
│   └── schema.sql         # SQL schema definitions (employees, attendance, leaves)
├── data/
│   └── employees.txt      # Text file record storage
├── public/
│   ├── css/
│   │   └── style.css      # Shared styling
│   ├── js/
│   │   ├── common.js      # API helpers, toast notifications
│   │   └── export-helpers.js # Professional Excel (.xlsx) & PDF (.pdf) generator
│   └── uploads/
│       └── avatars/       # Uploaded profile photos
└── views/
    ├── dashboard.html     # Main dashboard (with charts & cards)
    ├── attendance.html    # Attendance tracking & monthly summary
    ├── leaves.html        # Leave management & approvals
    └── report.html        # Employee report with Excel/PDF export
```
