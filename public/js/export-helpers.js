/**
 * Professional Excel and PDF Export Helpers for Employee Data Manager
 */

// Format money helper
function formatINR(val) {
  return '₹' + Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Professional Excel (.xlsx) Export
 * @param {Array} employees - Array of employee objects
 * @param {Object} meta - Optional metadata (filterName, stats)
 */
function exportToExcel(employees, meta = {}) {
  if (!employees || !employees.length) {
    if (typeof toast === 'function') toast('No data available to export.', 'bad');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `Employee_Report_${today}.xlsx`;

  // Check if SheetJS (XLSX) is available
  if (typeof XLSX !== 'undefined') {
    const totalSalary = employees.reduce((sum, e) => sum + Number(e.salary || 0), 0);
    const avgSalary = employees.length ? Math.round(totalSalary / employees.length) : 0;

    // Build structured worksheet data
    const wsData = [
      ['EMPLOYEE DATA MANAGER - OFFICIAL REPORT'],
      [`Generated on: ${new Date().toLocaleString('en-IN')}`, `Filter: ${meta.filter || 'All Departments'}`],
      [],
      ['SUMMARY METRICS'],
      ['Total Employees', employees.length, 'Total Monthly Payroll (INR)', totalSalary, 'Average Salary (INR)', avgSalary],
      [],
      ['#', 'Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Designation', 'Gender', 'Status', 'Monthly Salary (INR)', 'Joining Date']
    ];

    employees.forEach((e, idx) => {
      wsData.push([
        idx + 1,
        e.emp_code || '',
        e.full_name || '',
        e.email || '',
        e.phone || '',
        e.department || '',
        e.designation || '',
        e.gender || 'Male',
        e.status || 'Active',
        Number(e.salary || 0),
        String(e.joining_date || '').slice(0, 10)
      ]);
    });

    // Summary row
    wsData.push([]);
    wsData.push(['', '', '', '', '', '', '', '', 'TOTAL PAYROLL:', totalSalary, '']);
    wsData.push(['', '', '', '', '', '', '', '', 'AVERAGE SALARY:', avgSalary, '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 6 },   // #
      { wch: 14 },  // Emp ID
      { wch: 24 },  // Name
      { wch: 28 },  // Email
      { wch: 14 },  // Phone
      { wch: 16 },  // Department
      { wch: 24 },  // Designation
      { wch: 10 },  // Gender
      { wch: 12 },  // Status
      { wch: 22 },  // Salary
      { wch: 14 }   // Joining Date
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, fileName);

    if (typeof toast === 'function') toast(`Excel file downloaded (${employees.length} records).`, 'ok');
  } else {
    // Fallback: UTF-8 BOM CSV that opens cleanly in Excel
    const headers = ['#', 'Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Designation', 'Gender', 'Status', 'Monthly Salary (INR)', 'Joining Date'];
    const rows = employees.map((e, i) => [
      i + 1,
      e.emp_code,
      e.full_name,
      e.email,
      e.phone,
      e.department,
      e.designation,
      e.gender || 'Male',
      e.status || 'Active',
      e.salary,
      String(e.joining_date || '').slice(0, 10)
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(row =>
      row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Employee_Report_${today}.csv`;
    link.click();
    if (typeof toast === 'function') toast('Report downloaded as CSV.', 'ok');
  }
}

/**
 * Professional PDF (.pdf) Export with Branded Design
 * @param {Array} employees - Array of employee objects
 * @param {Object} meta - Optional metadata (stats, filter)
 */
function exportToPdf(employees, meta = {}) {
  if (!employees || !employees.length) {
    if (typeof toast === 'function') toast('No data available to export.', 'bad');
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    if (typeof toast === 'function') toast('Opening print preview for PDF generation...', 'ok');
    window.print();
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalSalary = employees.reduce((sum, e) => sum + Number(e.salary || 0), 0);
  const avgSalary = employees.length ? Math.round(totalSalary / employees.length) : 0;

  // Primary Header Banner
  doc.setFillColor(31, 95, 214); // #1f5fd6
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYEE DATA MANAGER', 40, 32);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Confidential Human Resources & Payroll Report', 40, 48);

  // Date on right
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Generated: ${dateStr}`, pageWidth - 40, 38, { align: 'right' });

  // KPI Summary Bar
  doc.setFillColor(243, 244, 247);
  doc.roundedRect(40, 75, pageWidth - 80, 46, 6, 6, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(107, 114, 128);
  doc.text('TOTAL EMPLOYEES', 60, 93);
  doc.text('AVERAGE SALARY', 250, 93);
  doc.text('MONTHLY PAYROLL', 440, 93);
  doc.text('ACTIVE FILTER', 640, 93);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(`${employees.length}`, 60, 110);
  doc.text(formatINR(avgSalary), 250, 110);
  doc.text(formatINR(totalSalary), 440, 110);
  doc.text(meta.filter || 'All Departments', 640, 110);

  // Table Data
  const head = [['#', 'Emp ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Gender', 'Status', 'Salary', 'Joined']];
  const body = employees.map((e, i) => [
    i + 1,
    e.emp_code || '',
    e.full_name || '',
    e.email || '',
    e.phone || '',
    e.department || '',
    e.designation || '',
    e.gender || 'Male',
    e.status || 'Active',
    formatINR(e.salary),
    String(e.joining_date || '').slice(0, 10)
  ]);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: head,
      body: body,
      startY: 135,
      margin: { left: 40, right: 40 },
      styles: {
        fontSize: 8,
        cellPadding: 5,
        font: 'helvetica',
        textColor: [17, 24, 39]
      },
      headStyles: {
        fillColor: [31, 95, 214],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 50, fontStyle: 'bold' },
        2: { cellWidth: 85 },
        3: { cellWidth: 125 },
        4: { cellWidth: 65 },
        5: { cellWidth: 65 },
        6: { cellWidth: 90 },
        7: { cellWidth: 45, halign: 'center' },
        8: { cellWidth: 50, halign: 'center' },
        9: { cellWidth: 65, halign: 'right' },
        10: { cellWidth: 60, halign: 'center' }
      },
      didDrawPage: function(data) {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text('Employee Data Manager - Confidential HR Document', 40, pageHeight - 20);
        doc.text(str, pageWidth - 40, pageHeight - 20, { align: 'right' });
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  doc.save(`Employee_Report_${today}.pdf`);
  if (typeof toast === 'function') toast('Professional PDF report downloaded.', 'ok');
}

/**
 * Generate Professional Single-Employee Payslip PDF
 * @param {Object} p - Payroll record with employee details
 */
function generatePayslipPdf(p) {
  if (!p) {
    if (typeof toast === 'function') toast('No payroll record provided.', 'bad');
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    if (typeof toast === 'function') toast('Opening print preview for payslip...', 'ok');
    window.print();
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - (margin * 2);

  // 1. Company Brand Header
  doc.setFillColor(31, 95, 214); // #1f5fd6
  doc.rect(0, 0, pageWidth, 75, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('EMPLOYEE DATA MANAGER PVT. LTD.', margin, 38);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Corporate Human Resources & Payroll Division', margin, 56);

  // Month Badge
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - margin - 140, 20, 140, 36, 6, 6, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 95, 214);
  doc.text(`PAYSLIP: ${p.month || 'N/A'}`, pageWidth - margin - 70, 42, { align: 'center' });

  // 2. Employee Summary Info Box
  let y = 95;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 90, 8, 8, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);

  // Left Column
  doc.text('EMPLOYEE NAME:', margin + 16, y + 22);
  doc.text('EMPLOYEE CODE:', margin + 16, y + 42);
  doc.text('DEPARTMENT:', margin + 16, y + 62);
  doc.text('DESIGNATION:', margin + 16, y + 80);

  // Left Values
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(p.full_name || 'N/A'), margin + 120, y + 22);
  doc.text(String(p.emp_code || 'N/A'), margin + 120, y + 42);
  doc.text(String(p.department || 'N/A'), margin + 120, y + 62);
  doc.text(String(p.designation || 'N/A'), margin + 120, y + 80);

  // Right Column
  const rightX = margin + contentWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL WORKING DAYS:', rightX, y + 22);
  doc.text('DAYS PAYABLE:', rightX, y + 42);
  doc.text('LOSS OF PAY (LOP):', rightX, y + 62);
  doc.text('PAYMENT STATUS:', rightX, y + 80);

  // Right Values
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(p.working_days || 30), rightX + 130, y + 22);
  doc.text(String(p.paid_days || 30), rightX + 130, y + 42);
  const lopDays = Math.max(0, (p.working_days || 30) - (p.paid_days || 30));
  doc.text(`${lopDays} day(s)`, rightX + 130, y + 62);
  
  if (p.status === 'Paid') {
    doc.setTextColor(22, 163, 74);
    doc.text(`PAID (${p.payment_date ? String(p.payment_date).slice(0, 10) : 'Completed'})`, rightX + 130, y + 80);
  } else {
    doc.setTextColor(217, 119, 6);
    doc.text('GENERATED (Pending Disbursal)', rightX + 130, y + 80);
  }

  // 3. Earnings & Deductions Table
  y = 205;
  const totDed = Number(p.pf_deduction || 0) + Number(p.tax_deduction || 0) + Number(p.lop_deduction || 0);

  const salaryTableBody = [
    ['Basic Salary', formatINR(p.basic), 'Provident Fund (PF - 12%)', formatINR(p.pf_deduction)],
    ['House Rent Allowance (HRA)', formatINR(p.hra), 'TDS / Income Tax', formatINR(p.tax_deduction)],
    ['Special Allowances', formatINR(p.allowances), 'Loss of Pay (LOP Deduction)', formatINR(p.lop_deduction)],
    ['Total Gross Earnings (A)', formatINR(p.gross_salary), 'Total Deductions (B)', formatINR(totDed)]
  ];

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: [['EARNINGS', 'AMOUNT', 'DEDUCTIONS', 'AMOUNT']],
      body: salaryTableBody,
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [31, 95, 214],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left'
      },
      styles: {
        fontSize: 9,
        cellPadding: 8,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5
      },
      columnStyles: {
        0: { fontStyle: 'normal' },
        1: { halign: 'right', fontStyle: 'bold' },
        2: { fontStyle: 'normal' },
        3: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] }
      },
      didParseCell: function(data) {
        // Highlight the Totals row
        if (data.row.index === 3) {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    y = doc.lastAutoTable.finalY + 20;
  } else {
    y += 140;
  }

  // 4. Net Take-Home Salary Callout
  doc.setFillColor(231, 247, 237); // light green
  doc.setDrawColor(22, 163, 74);
  doc.roundedRect(margin, y, contentWidth, 54, 8, 8, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text('NET SALARY TAKE-HOME (A - B):', margin + 20, y + 32);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(formatINR(p.net_salary), pageWidth - margin - 20, y + 35, { align: 'right' });

  // 5. Notes & Verification Signatures
  y += 90;
  doc.setDrawColor(203, 213, 225);
  doc.setLineDash([3, 3], 0);
  doc.line(margin + 20, y, margin + 180, y);
  doc.line(pageWidth - margin - 180, y, pageWidth - margin - 20, y);

  doc.setLineDash([], 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Employee Signature', margin + 100, y + 16, { align: 'center' });
  doc.text('Authorized Signatory (HR / Finance)', pageWidth - margin - 100, y + 16, { align: 'center' });

  // Footer Disclaimer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Note: This is a computer-generated confidential salary slip and does not require a physical signature.', pageWidth / 2, pageHeight - 30, { align: 'center' });

  const safeName = (p.full_name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Payslip_${safeName}_${p.month || 'Month'}.pdf`;
  doc.save(fileName);

  if (typeof toast === 'function') toast(`Payslip downloaded: ${fileName}`, 'ok');
}

window.exportToExcel = exportToExcel;
window.exportToPdf = exportToPdf;
window.generatePayslipPdf = generatePayslipPdf;
