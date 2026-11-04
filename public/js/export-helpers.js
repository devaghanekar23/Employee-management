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
      ['#', 'Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Designation', 'Monthly Salary (INR)', 'Joining Date']
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
        Number(e.salary || 0),
        String(e.joining_date || '').slice(0, 10)
      ]);
    });

    // Summary row
    wsData.push([]);
    wsData.push(['', '', '', '', '', '', 'TOTAL PAYROLL:', totalSalary, '']);
    wsData.push(['', '', '', '', '', '', 'AVERAGE SALARY:', avgSalary, '']);

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
      { wch: 22 },  // Salary
      { wch: 14 }   // Joining Date
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, fileName);

    if (typeof toast === 'function') toast(`Excel file downloaded (${employees.length} records).`, 'ok');
  } else {
    // Fallback: UTF-8 BOM CSV that opens cleanly in Excel
    const headers = ['#', 'Employee ID', 'Full Name', 'Email', 'Phone', 'Department', 'Designation', 'Monthly Salary (INR)', 'Joining Date'];
    const rows = employees.map((e, i) => [
      i + 1,
      e.emp_code,
      e.full_name,
      e.email,
      e.phone,
      e.department,
      e.designation,
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
    // If jsPDF is not loaded, fallback to window.print()
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
  doc.setTextColor(107, 114, 128); // Muted
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
  const head = [['#', 'Emp ID', 'Name', 'Email', 'Phone', 'Department', 'Designation', 'Salary', 'Joined']];
  const body = employees.map((e, i) => [
    i + 1,
    e.emp_code || '',
    e.full_name || '',
    e.email || '',
    e.phone || '',
    e.department || '',
    e.designation || '',
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
        fontSize: 8.5,
        cellPadding: 5,
        font: 'helvetica',
        textColor: [17, 24, 39]
      },
      headStyles: {
        fillColor: [31, 95, 214],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 95 },
        3: { cellWidth: 140 },
        4: { cellWidth: 70 },
        5: { cellWidth: 70 },
        6: { cellWidth: 100 },
        7: { cellWidth: 65, halign: 'right' },
        8: { cellWidth: 65, halign: 'center' }
      },
      didDrawPage: function(data) {
        // Footer on every page
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

window.exportToExcel = exportToExcel;
window.exportToPdf = exportToPdf;

