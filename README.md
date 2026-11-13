# Employee Data Manager (Node.js + Express + MySQL)

A modern, full-featured Employee Data Management & HR Portal built with Node.js, Express, and MySQL.

Employee data entered in the system is:
1. **Appended to a local text file** (`data/employees.txt`), and
2. **Stored in MySQL database** (`employees`, `attendance`, `leaves` tables),
both **concurrently** using `Promise.all`.

---

## 🚀 Key Features

1. **Full Employee Profile & Information Management**:
   - Comprehensive multi-section profile:
     - **Work & Role**: Employee code, designation, department, reporting manager, joining date, status, exit date.
     - **Personal Details**: Gender, date of birth, marital status, blood group.
     - **Emergency Contact**: Contact person, relationship, direct phone with click-to-call.
     - **Address Details**: Current residential address, permanent hometown address, city, state, pincode.
     - **Bank & Disbursal**: Bank name, account holder, account number, IFSC code, branch location.
   - Clean tabbed Add/Edit modal for effortless data entry.
   - Profile photo upload (JPG, PNG, WebP) with colorful initials fallback.

2. **Documents Upload & Management (Aadhaar, PAN, Offer Letter, Resume)**:
   - Upload and manage official documents (🪪 Aadhaar Card, 💳 PAN Card, 📄 Offer Letter, 📝 Resume / CV, 📜 Experience Letters).
   - Instant in-browser view, download, and delete.
   - **Storage options**: Stored securely on local disk (`public/uploads/documents/`) or in **AWS S3** when S3 credentials are provided in `.env`.

3. **Employee Status Lifecycle (`Active` / `Probation` / `Resigned` / `Terminated`)**:
   - Full support for the complete employee lifecycle.
   - Color-coded badges: Active (Green), Probation (Purple), Resigned (Amber), Terminated (Red).
   - Filter by status in Dashboard, Analytics, and Reports.

4. **Bulk Import via Excel / CSV**:
   - 1-click **"📥 Import"** modal in Dashboard.
   - **Downloadable Sample Template** (`.xlsx`) with pre-formatted columns and sample data.
   - Instant file parsing with live table preview of rows and validation.
   - Option to auto-update existing employees or skip duplicates.
   - Concurrent sync to both MySQL database and `data/employees.txt`.

5. **Organization Hierarchy Chart (`/org-chart`)**:
   - Interactive reporting hierarchy tree visualization showing CEO/Directors -> Managers -> Team Members.
   - Direct reports count badge (e.g. `👥 3 Reports`).
   - Zoom in, Zoom out, Reset view, Expand all, Collapse all.
   - Department filtering and live search that scrolls and highlights employee nodes.
   - 1-click navigation from any tree node directly to that employee's profile.

6. **Attendance Tracking & Timesheet Module (`/attendance`)**:
   - Daily attendance marking: Mark employees as **Present**, **Absent**, or **Half Day** with optional notes.
   - One-click **"Mark All Present"** for instant bulk attendance.
   - Monthly Attendance Summary report with total days, attendance %, visual progress bar, and standing.
   - Direct attendance widget inside individual employee profiles.

3. **Leave Management & Approvals (`/leaves`)**:
   - Employees/Admin can apply for leaves (Casual Leave, Sick Leave, Paid Leave, Unpaid Leave).
   - Approval workflow: **✓ Approve** or **✕ Reject** applications with admin remarks.
   - Filter by status (Pending, Approved, Rejected) and department.
   - Live leave history card inside individual employee profiles.

4. **Payroll & Salary Management (`/payroll`)**:
   - Automated Salary Structure calculation:
     - **Basic Salary**: 50% of gross
     - **HRA**: 25% of gross
     - **Allowances**: 25% of gross
     - **PF Deduction**: 12% of basic
     - **Income Tax (TDS)**: Slabs based on gross salary
     - **Loss of Pay (LOP)**: Auto-calculated from monthly attendance records
   - **Monthly Payroll Run**: 1-click batch calculation for all active employees.
   - **Payslip PDF Generation**: Corporate formatted salary slips with earnings, deductions, net take-home callout, and authorized signature.
   - **Payslip Email Disbursal**: Send payslips to employees via email or audit file (`data/sent_emails.txt`).
   - **Mark All Paid / Single Paid**: Disbursal tracking with payment date.

5. **Executive Analytics & Improvements (`/dashboard`)**:
   - **Gender Ratio Donut Chart**: Visual diversity representation (Male vs Female vs Other).
   - **Department Headcount & Salary Dual-Axis Chart**: Headcount vs average compensation.
   - **Employee Joining Trend Graph**: Hiring growth curve over time.
   - **Time Range Filter**: 1M, 6M, 1Y, All Time, and custom date range filters.
   - **Attrition Rate KPI Card**: Annualized turnover rate percentage.
   - **Upcoming Birthdays & Work Anniversaries**: 30-day milestone alerts.
   - **Pending Leave Requests Widget**: 1-click Approve / Reject directly from dashboard.

6. **Professional Excel & PDF Export (`/report`)**:
   - **Excel (.xlsx)**: Formatted workbook with company header, timestamp, filter details, metadata, column widths, and summary rows (Total Payroll & Average Salary) powered by SheetJS.
   - **PDF (.pdf)**: Corporate branded PDF report with custom blue header, metadata banner, KPI metrics, zebra table formatting, and confidential page numbering powered by jsPDF & AutoTable.
   - **CSV & Print**: Instant CSV download and print-ready stylesheet.

7. **100% Mobile Responsive UI (All Screens)**:
   - Sticky top horizontal navigation on mobile.
   - Slide-in detail drawer with back navigation.
   - Mobile-optimized cards, touch-friendly buttons, and horizontal table scrolling.
   - Dark / Light mode toggle (persisted).

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

- `/dashboard` — Main employee dashboard with list, search, details, analytics, and widgets
- `/attendance` — Daily attendance sheet and monthly attendance summary reports
- `/leaves` — Leave application portal and approval management
- `/payroll` — Payroll processing, salary structures, payslip PDF generation, and email disbursal
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
│   ├── leaves.js          # Leave application and approval endpoints
│   └── payroll.js         # Payroll calculation, payslip PDF/email endpoints
├── utils/
│   ├── fileLogger.js      # Appends employee records to text file
│   └── mailer.js          # Resilient email sender (SMTP or data/sent_emails.txt fallback)
├── database/
│   └── schema.sql         # SQL schema definitions (employees, attendance, leaves, payroll)
├── data/
│   └── employees.txt      # Text file record storage
├── public/
│   ├── css/
│   │   └── style.css      # Shared styling
│   ├── js/
│   │   ├── common.js      # API helpers, toast notifications
│   │   └── export-helpers.js # Professional Excel, PDF, & Payslip generator
│   └── uploads/
│       └── avatars/       # Uploaded profile photos
└── views/
    ├── dashboard.html     # Main dashboard (with charts & cards)
    ├── attendance.html    # Attendance tracking & monthly summary
    ├── leaves.html        # Leave management & approvals
    ├── payroll.html       # Monthly payroll & salary disbursal
    └── report.html        # Employee report with Excel/PDF export
```
