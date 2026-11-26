import { AppData, Student } from '../types';
import { esc, getSortedStudents } from './helpers';
import { DEPT_LOGO_DATA_URI } from './deptLogo';

export interface DailyTestHeaderOptions {
  showSchool: boolean;
  showEmis: boolean;
  showClass: boolean;
  showSection: boolean;
  showMonth: boolean;
}

interface PrintOptions {
  monthKey: string; // "YYYY-MM"
  isBlank?: boolean;
  blankWithNames?: boolean; // blank register only: print student names (no marks)
  header?: Partial<DailyTestHeaderOptions>; // which header fields to fill in (default: none, left for handwriting)
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function generateDailyTestRegisterHTML(data: AppData, options: PrintOptions): string {
  const { monthKey, isBlank = false, blankWithNames = false } = options;
  const hdr = options.header || {};
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const monthNum = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const monthIndex = monthNum - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const students = (isBlank && !blankWithNames) ? [] : getSortedStudents(data.students);

  // Fixed 20 students per sheet
  const CHUNK_SIZE = 20;
  const studentChunks: Student[][] = [];
  if (students.length === 0) {
    studentChunks.push([]);
  } else {
    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      studentChunks.push(students.slice(i, i + CHUNK_SIZE));
    }
  }

  // Header fields are only filled in when ticked; otherwise left blank for handwriting.
  const schoolText = hdr.showSchool ? esc(data.schoolName || '') : '';
  const emisText = hdr.showEmis ? esc(data.emisCode || '') : '';
  const classText = hdr.showClass ? esc(data.className || '') : '';
  const sectionText = hdr.showSection ? esc(data.section || '') : '';
  const monthText = hdr.showMonth ? MONTH_NAMES[monthIndex] : '';

  const buildHeaderStripHTML = (pageLabel: string, pageBadgeHTML: string) => `
    <div class="dt-header-wrap">
      <div class="dt-top-banner">
        <div class="dt-logo-col">
          <img src="${DEPT_LOGO_DATA_URI}" alt="School Education Department Punjab" class="dt-logo-img" />
        </div>
        <div class="dt-title-center">
          <div class="dt-title-main">MONTHLY DAILY QUICK TEST REGISTER</div>
          <div class="dt-title-sub">${pageLabel}</div>
          <div class="dt-motto">ASSESS &nbsp;&bull;&nbsp; LEARN &nbsp;&bull;&nbsp; IMPROVE</div>
        </div>
        <div class="dt-logo-col dt-logo-spacer"></div>
      </div>
      <div class="dt-fields-row">
        <div class="dt-fields-bar">
          <div class="dt-field dt-grow">
            <span class="dt-label">School Name:</span>
            <span class="dt-line school-line">${schoolText}</span>
          </div>
          <div class="dt-field">
            <span class="dt-label">EMIS Code:</span>
            <span class="dt-line emis-line">${emisText}</span>
          </div>
          <div class="dt-field">
            <span class="dt-label">Class:</span>
            <span class="dt-line class-line">${classText}</span>
          </div>
          <div class="dt-field">
            <span class="dt-label">Section:</span>
            <span class="dt-line sec-line">${sectionText}</span>
          </div>
          <div class="dt-field">
            <span class="dt-label">Month:</span>
            <span class="dt-line month-line">${monthText}</span><span class="dt-label">, ${year}</span>
          </div>
        </div>
        <div class="dt-page-badge">${pageBadgeHTML}</div>
      </div>
    </div>
  `;

  // -------------------------------------------------------------
  // PAGE 1 SHEETS: STUDENT-WISE RECORD (EXACTLY 20 ROWS PER SHEET)
  // -------------------------------------------------------------
  // Number of test days held this month = days with at least one entry (mark or A).
  // Student Average (out of 10) = Total / test days held (absent counts as 0).
  let testDaysHeld = 0;
  if (!isBlank) {
    for (let d = 1; d <= daysInMonth; d++) {
      const k = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = data.dailyTests[k];
      if (rec && data.students.some(s => rec[s.id] !== undefined)) testDaysHeld++;
    }
  }

  let allPage1SheetsHTML = '';

  studentChunks.forEach((chunk, chunkIdx) => {
    let rowsHTML = '';
    const badgeLabel = '<b>Page 1 of 2</b><small>(Student-wise Record)</small>';

    for (let r = 0; r < CHUNK_SIZE; r++) {
      const student: Student | undefined = chunk[r];
      const srNo = chunkIdx * CHUNK_SIZE + r + 1;
      const name = student ? esc(student.name) : '';
      const rollNo = student && !isBlank ? esc(student.rollNo) : '';

      let sumMarks = 0;
      let hasAnyMark = false;
      let dayCellsHTML = '';

      for (let d = 1; d <= 31; d++) {
        if (d > daysInMonth) {
          // Disabled / grayed out day for shorter months
          dayCellsHTML += `<td class="day-cell day-off"></td>`;
          continue;
        }

        if (!student || isBlank) {
          dayCellsHTML += `<td class="day-cell"></td>`;
          continue;
        }

        const dayKeyStr = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayRecord = data.dailyTests[dayKeyStr] || {};
        const val = dayRecord[student.id];

        if (val === 'A') {
          dayCellsHTML += `<td class="day-cell val-a">A</td>`;
        } else if (typeof val === 'number') {
          hasAnyMark = true;
          sumMarks += val;
          dayCellsHTML += `<td class="day-cell val-num">${val % 1 === 0 ? val : val.toFixed(1)}</td>`;
        } else {
          dayCellsHTML += `<td class="day-cell"></td>`;
        }
      }

      const totalText = hasAnyMark ? (sumMarks % 1 === 0 ? String(sumMarks) : sumMarks.toFixed(1)) : '';
      const avgText = hasAnyMark && testDaysHeld > 0 ? (sumMarks / testDaysHeld).toFixed(1) : '';

      rowsHTML += `
        <tr>
          <td class="col-sr">${srNo}</td>
          <td class="col-name"><span class="cg-fit">${name}</span></td>
          <td class="col-roll">${rollNo}</td>
          ${dayCellsHTML}
          <td class="col-total">${totalText}</td>
          <td class="col-avg">${avgText}</td>
          <td class="col-sba"></td>
          <td class="col-rem"></td>
        </tr>
      `;
    }

    allPage1SheetsHTML += `
      <div class="print-sheet dt-sheet page-1">
        ${buildHeaderStripHTML('STUDENT-WISE RECORD (Page 1 of 2)', badgeLabel)}

        <div class="dt-table-wrap">
          <table class="dt-reg-table">
            <thead>
              <tr class="th-main-row">
                <th rowspan="2" class="th-sr">Sr.<br>No.</th>
                <th rowspan="2" class="th-name">Student Name</th>
                <th rowspan="2" class="th-roll">Roll<br>No.</th>
                <th colspan="31" class="th-days-title">Daily Quick Test Marks (Out of 10)</th>
                <th rowspan="2" class="th-total">Total<br><small>(Out of 310)</small></th>
                <th rowspan="2" class="th-avg">Average<br><small>(Out of 10)</small></th>
                <th rowspan="2" class="th-sba">Monthly<br>Assessment<br><small>(SBA)</small><br><small>(Out of 50)</small></th>
                <th rowspan="2" class="th-rem">Remarks<br><small>(e.g. Needs Support / Good Progress)</small></th>
              </tr>
              <tr class="th-sub-days">
                ${Array.from({ length: 31 }, (_, i) => {
                  const dayNum = i + 1;
                  const isOff = dayNum > daysInMonth;
                  return `<th class="th-d ${isOff ? 'day-off' : ''}">${dayNum}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>

        <!-- Bottom Boxes Page 1 -->
        <div class="dt-p1-bottom">
          <div class="dt-card-box dt-box-instructions">
            <div class="dt-card-header">
              <svg class="dt-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              <span>INSTRUCTIONS FOR TEACHERS</span>
            </div>
            <ol class="dt-card-list cg-nocap">
              <li>Conduct a 10-minute daily quick test for all students.</li>
              <li>Enter each student's marks (out of 10) on the same day.</li>
              <li>Calculate total and average at the end of the month.</li>
              <li>Record Monthly Assessment (SBA) marks.</li>
              <li>Use remarks to highlight progress or learning support needs.</li>
              <li>Keep this register updated and available for monitoring visits.</li>
            </ol>
          </div>

          <div class="dt-card-box dt-box-declaration">
            <div class="dt-card-header">
              <span>CLASS TEACHER DECLARATION</span>
            </div>
            <div class="dt-decl-text cg-nocap">
              I confirm that the daily quick tests have been conducted as per instructions and the record has been maintained regularly.
            </div>
            <div class="dt-sig-lines">
              <div class="dt-sig-line"><span>Name:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Signature:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Date:</span><span class="line-fill"></span></div>
            </div>
          </div>

          <div class="dt-card-box dt-box-review">
            <div class="dt-card-header">
              <span>REVIEW / VERIFICATION</span>
            </div>
            <div class="dt-sig-lines review-lines">
              <div class="dt-sig-line"><span>Head Teacher:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Signature:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Date:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Reviewed by (DEO/AEO):</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Signature:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Date:</span><span class="line-fill"></span></div>
            </div>
          </div>

          <div class="dt-card-box dt-box-quote">
            <div class="dt-quote-mark">“</div>
            <div class="dt-quote-body cg-nocap">
              Consistent assessment today leads to stronger learning tomorrow.
            </div>
          </div>
        </div>

        <!-- Footer Page 1 -->
        <div class="dt-footer dt-footer-p1">
          <div class="dt-footer-quote">"Every Student Matters"</div>
          <div class="dt-footer-center">School Education Department Punjab &nbsp;|&nbsp; Together for Quality Education</div>
          <div class="dt-footer-badge">A Brighter Punjab Through Better Learning</div>
        </div>
      </div>
    `;
  });

  // -------------------------------------------------------------
  // PAGE 2: DAILY CLASS SUMMARY (FINAL SHEET)
  // -------------------------------------------------------------
  let page2RowsHTML = '';
  // Month-end box: Average Class Score = average of all marks scored by students who took the tests.
  let monthMarkSum = 0;
  let monthMarkCount = 0;
  for (let d = 1; d <= 31; d++) {
    const isOff = d > daysInMonth;
    const dateStr = `${String(d).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}`;
    let dayName = '';

    if (!isOff) {
      const curDate = new Date(year, monthIndex, d);
      dayName = curDate.toLocaleDateString('en-US', { weekday: 'short' });
    }

    let totalStudentsText = '';
    let presentText = '';
    let absentText = '';
    let avgText = '';
    let below5Text = '';

    if (!isBlank && !isOff) {
      const dayKeyStr = `${yearStr}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = data.dailyTests[dayKeyStr];

      if (dayData && Object.keys(dayData).length > 0) {
        let presCount = 0;
        let absCount = 0;
        let markSum = 0;
        let below5Count = 0;

        // Iterate through all students in class
        data.students.forEach(s => {
          const val = dayData[s.id];
          if (val === 'A') {
            absCount++;
          } else if (typeof val === 'number') {
            presCount++;
            markSum += val;
            monthMarkSum += val;
            monthMarkCount++;
            if (val < 5) below5Count++;
          }
        });

        if (presCount > 0 || absCount > 0) {
          totalStudentsText = String(data.students.length);
          presentText = String(presCount);
          absentText = String(absCount);
          avgText = presCount > 0 ? (markSum / presCount).toFixed(1) : '0.0';
          below5Text = String(below5Count);
        }
      }
    }

    page2RowsHTML += `
      <tr class="${isOff ? 'row-off' : ''}">
        <td class="col-p2-date ${isOff ? 'day-off' : ''}">${dateStr}</td>
        <td class="col-p2-day ${isOff ? 'day-off' : ''}">${dayName}</td>
        <td class="col-p2-topic ${isOff ? 'day-off' : ''}"></td>
        <td class="col-p2-total ${isOff ? 'day-off' : ''}">${totalStudentsText}</td>
        <td class="col-p2-pres ${isOff ? 'day-off' : ''}">${presentText}</td>
        <td class="col-p2-abs ${isOff ? 'day-off' : ''}">${absentText}</td>
        <td class="col-p2-avg ${isOff ? 'day-off' : ''}">${avgText}</td>
        <td class="col-p2-bel5 ${isOff ? 'day-off' : ''}">${below5Text}</td>
        <td class="col-p2-gaps ${isOff ? 'day-off' : ''}"></td>
        <td class="col-p2-action ${isOff ? 'day-off' : ''}"></td>
      </tr>
    `;
  }

  const monthAvgText = monthMarkCount > 0 ? (monthMarkSum / monthMarkCount).toFixed(1) : '';

  const page2HTML = `
    <div class="print-sheet dt-sheet page-2">
      ${buildHeaderStripHTML('DAILY CLASS SUMMARY (Page 2 of 2)', '<b>Page 2 of 2</b><small>(Daily Class Summary)</small>')}

      <div class="dt-table-wrap">
        <table class="dt-sum-table">
          <thead>
            <tr>
              <th class="th-p2-date">Date<br><small>(DD/MM)</small></th>
              <th class="th-p2-day">Day<br><small>(Mon/Tue)</small></th>
              <th class="th-p2-topic">Topic / Concept Tested<br><small>(As per Lesson Plan)</small></th>
              <th class="th-p2-tot">Total<br>Students</th>
              <th class="th-p2-pre">Present</th>
              <th class="th-p2-abs">Absent</th>
              <th class="th-p2-avg">Class Average<br><small>(Out of 10)</small></th>
              <th class="th-p2-bel5">Students<br>Scoring Below 5<br><small>(Needs Support)</small></th>
              <th class="th-p2-gaps">Key Learning Gaps / Observations<br><small>(e.g. concepts not clear, common mistakes)</small></th>
              <th class="th-p2-act">Follow-up / Remedial Action<br><small>(e.g. revision, group work, re-teach)</small></th>
            </tr>
          </thead>
          <tbody>
            ${page2RowsHTML}
          </tbody>
        </table>
      </div>

      <!-- Bottom Boxes Page 2 -->
      <div class="dt-p2-bottom">
        <div class="dt-card-box dt-box-summary">
          <div class="dt-card-header">
            <svg class="dt-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
            <span>MONTHLY CLASS SUMMARY <small style="font-weight:600;opacity:0.85;">(To be filled at month end)</small></span>
          </div>
          <div class="dt-summary-fields">
            <div class="dt-summary-row">
              <div class="dt-sig-line"><span>Total Working Days:</span><span class="line-fill"></span></div>
              <div class="dt-sig-line"><span>Average Class Score (Out of 10):</span><span class="line-fill dt-fill-val">${monthAvgText}</span></div>
            </div>
            <div class="dt-sig-line"><span>Topics Covered This Month:</span><span class="line-fill"></span></div>
            <div class="dt-sig-line"><span>Major Learning Gaps:</span><span class="line-fill"></span></div>
            <div class="dt-sig-line"><span>Action Taken / Plan for Next Month:</span><span class="line-fill"></span></div>
          </div>
        </div>

        <div class="dt-card-box dt-box-reflection">
          <div class="dt-card-header">
            <svg class="dt-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>TEACHER'S REFLECTION</span>
          </div>
          <div class="dt-reflection-body cg-nocap">
            <div class="dt-sig-line"><span>What worked well this month?</span><span class="line-fill"></span></div>
            <div class="dt-sig-line"><span style="visibility:hidden">spacer</span><span class="line-fill"></span></div>
            <div class="dt-sig-line"><span>Challenges faced and support needed:</span><span class="line-fill"></span></div>
            <div class="dt-sig-line"><span style="visibility:hidden">spacer</span><span class="line-fill"></span></div>
          </div>
        </div>

        <div class="dt-card-box dt-box-p2-sigs">
          <div class="dt-card-header">
            <svg class="dt-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            <span>SIGNATURES</span>
          </div>
          <div class="dt-sig-lines p2-sig-grid">
            <div class="dt-sig-line"><span>Class Teacher:</span><span class="line-fill"></span><span>Date:</span><span class="line-fill" style="max-width:25mm"></span></div>
            <div class="dt-sig-line"><span>Head Teacher:</span><span class="line-fill"></span><span>Date:</span><span class="line-fill" style="max-width:25mm"></span></div>
            <div class="dt-sig-line"><span>Reviewed by (DEO/AEO):</span><span class="line-fill"></span><span>Date:</span><span class="line-fill" style="max-width:25mm"></span></div>
          </div>
        </div>

        <div class="dt-card-box dt-box-quote">
          <div class="dt-quote-cap">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#0B5D45"><path d="M12 2L1 7l11 5 9-4.09V17h2V7L12 2zm0 13.5L5 12.32V17c0 3.87 3.13 7 7 7s7-3.13 7-7v-4.68l-7 3.18z"/></svg>
          </div>
          <div class="dt-quote-body cg-nocap">
            "Regular assessment today leads to stronger learners tomorrow."
          </div>
        </div>
      </div>

      <!-- Footer Page 2 -->
      <div class="dt-footer dt-footer-p2">
        <div class="dt-footer-p2-left">
          <div class="dt-motto-pill">
            <svg class="pill-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span>ASSESS TODAY</span>
          </div>
          <span class="pill-divider">|</span>
          <div class="dt-motto-pill">
            <svg class="pill-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <span>SUPPORT LEARNERS</span>
          </div>
          <span class="pill-divider">|</span>
          <div class="dt-motto-pill">
            <svg class="pill-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span>IMPROVE TOMORROW</span>
          </div>
        </div>
        <div class="dt-footer-p2-badge">
          Together for Quality Education
        </div>
      </div>
    </div>
  `;

  // -------------------------------------------------------------
  // DEDICATED PRINT STYLESHEET
  // -------------------------------------------------------------
  const styles = `
    <style id="dailyTestPrintStyles">
      @page {
        size: A4 landscape !important;
        margin: 4.5mm 5.5mm 4mm 5.5mm !important;
      }

      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* One sheet = exactly one A4 landscape page (286 x 199 mm), filled top to bottom */
      .dt-sheet {
        width: 286mm !important;
        height: 199mm !important;
        margin: 0 auto !important;
        background: #FFFFFF !important;
        color: #111827 !important;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        position: relative !important;
        page-break-after: always !important;
        break-after: page !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
      }

      .dt-sheet:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }

      /* ---------- Header ---------- */
      .dt-header-wrap { flex: 0 0 auto !important; margin-bottom: 1.6mm !important; }

      .dt-top-banner {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        gap: 3mm !important;
        height: 19mm !important;
        margin-bottom: 1.2mm !important;
      }

      .dt-logo-col {
        flex: 0 0 62mm !important;
        height: 19mm !important;
        display: flex !important;
        align-items: center !important;
      }
      .dt-logo-spacer { visibility: hidden !important; }

      .dt-logo-img {
        height: 18mm !important;
        width: auto !important;
        max-width: 62mm !important;
        display: block !important;
        object-fit: contain !important;
      }

      .dt-title-center {
        flex: 1 !important;
        text-align: center !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
      }

      .dt-title-main {
        width: 100% !important;
        background: #0B5D45 !important;
        color: #FFFFFF !important;
        font-size: 19pt !important;
        font-weight: 900 !important;
        letter-spacing: 0.03em !important;
        padding: 1.4mm 3mm !important;
        border-radius: 5px !important;
        text-transform: uppercase !important;
        line-height: 1.1 !important;
      }

      .dt-title-sub {
        width: 82% !important;
        margin-top: -0.2mm !important;
        background: #FFC82C !important;
        color: #0B5D45 !important;
        font-size: 12.5pt !important;
        font-weight: 900 !important;
        letter-spacing: 0.06em !important;
        padding: 0.9mm 3mm !important;
        border-radius: 0 0 6px 6px !important;
        text-transform: uppercase !important;
        line-height: 1.1 !important;
      }

      .dt-motto {
        margin-top: 0.8mm !important;
        font-size: 8.5pt !important;
        font-weight: 900 !important;
        letter-spacing: 0.3em !important;
        color: #0B5D45 !important;
        line-height: 1 !important;
      }

      .dt-fields-row {
        display: flex !important;
        align-items: stretch !important;
        gap: 2mm !important;
      }

      .dt-fields-bar {
        flex: 1 1 0 !important;
        min-width: 0 !important;
        display: flex !important;
        align-items: center !important;
        gap: 3mm !important;
        background: #E6F4EC !important;
        border: 1px solid #9ACDB4 !important;
        border-radius: 4px !important;
        padding: 1.6mm 3mm !important;
        font-size: 8.5pt !important;
        font-weight: 800 !important;
        color: #0F172A !important;
      }

      .dt-field { display: flex !important; align-items: flex-end !important; gap: 1.5mm !important; }
      .dt-grow { flex: 1 !important; }
      .dt-label { white-space: nowrap !important; }

      .dt-line {
        border-bottom: 1px solid #0B5D45 !important;
        display: inline-block !important;
        min-height: 4.2mm !important;
        color: #111827 !important;
        font-weight: 800 !important;
        padding: 0 1mm !important;
        text-align: center !important;
        flex: 0 0 auto !important;
      }
      .dt-grow .dt-line { flex: 1 !important; }

      .school-line { min-width: 20mm !important; }
      .emis-line { min-width: 22mm !important; }
      .class-line { min-width: 20mm !important; }
      .sec-line { min-width: 17mm !important; }
      .month-line { min-width: 24mm !important; }

      .dt-page-badge {
        flex: 0 0 38mm !important;
        background: #E9EFC4 !important;
        border: 1px solid #A3A93A !important;
        border-radius: 4px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        color: #1F2937 !important;
        line-height: 1.15 !important;
      }
      .dt-page-badge b { font-size: 9.5pt !important; font-weight: 800 !important; }
      .dt-page-badge small { font-size: 6.5pt !important; font-weight: 600 !important; }

      /* ---------- Tables (stretch to fill the free height) ---------- */
      .dt-table-wrap {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        margin-bottom: 1.8mm !important;
        display: flex !important;
        flex-direction: column !important;
      }

      table.dt-reg-table, table.dt-sum-table {
        flex: 1 1 auto !important;
        width: 100% !important;
        height: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
        border: 1.3px solid #0B5D45 !important;
        font-size: 7.5pt !important;
      }

      table.dt-reg-table th, table.dt-reg-table td,
      table.dt-sum-table th, table.dt-sum-table td {
        border: 0.7px solid #374151 !important;
        padding: 0 0.3mm !important;
        text-align: center !important;
        vertical-align: middle !important;
        line-height: 1.1 !important;
        overflow: hidden !important;
      }

      table thead th small { display: block !important; font-weight: 600 !important; font-size: 5.8pt !important; }

      /* Page 1 header */
      .th-main-row th {
        background: #0B5D45 !important;
        color: #FFFFFF !important;
        font-weight: 800 !important;
        font-size: 8pt !important;
        border-color: #064E3B !important;
        height: 8mm !important;
      }
      .th-days-title {
        background: #A7D8BD !important;
        color: #064E3B !important;
        font-size: 9pt !important;
        font-weight: 900 !important;
      }
      .th-sub-days th {
        background: #D3EEDF !important;
        color: #064E3B !important;
        font-weight: 800 !important;
        font-size: 7pt !important;
        height: 5.5mm !important;
      }

      .th-sr { width: 9mm !important; }
      .th-name { width: 36mm !important; }
      .th-roll { width: 10mm !important; }
      .th-total { width: 15mm !important; background: #FCE9A8 !important; color: #5B3A06 !important; }
      .th-avg { width: 15mm !important; background: #BFE0F7 !important; color: #0C4A6E !important; }
      .th-sba { width: 19mm !important; background: #B9E6C4 !important; color: #14532D !important; }
      .th-rem { width: 32mm !important; background: #DCCFF5 !important; color: #4C1D95 !important; }

      /* Page 1 body (20 rows share the free height) */
      .col-sr { font-weight: 700 !important; font-size: 7.5pt !important; }
      .col-name { text-align: left !important; padding-left: 1.5mm !important; font-weight: 700 !important; font-size: 8pt !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      .col-roll { font-weight: 600 !important; font-size: 7.5pt !important; }
      .day-cell { font-size: 6.5pt !important; letter-spacing: -0.2px !important; }
      .day-cell.val-a { color: #DC2626 !important; font-weight: 900 !important; background: #FEF2F2 !important; }
      .day-cell.val-num { font-weight: 700 !important; }
      .day-off { background: #E5E7EB !important; color: #9CA3AF !important; }
      .col-total { font-weight: 900 !important; background: #FFF4CC !important; font-size: 8pt !important; }
      .col-avg { background: #EAF5FD !important; font-weight: 800 !important; font-size: 8pt !important; }
      .col-sba { background: #E6F6EA !important; }
      .col-rem { background: #F3EEFC !important; }

      /* Page 2 header */
      table.dt-sum-table thead th {
        background: #0B5D45 !important;
        color: #FFFFFF !important;
        font-weight: 800 !important;
        font-size: 8pt !important;
        padding: 0.8mm 0.5mm !important;
        height: 11mm !important;
      }
      .th-p2-date { width: 15mm !important; }
      .th-p2-day { width: 15mm !important; }
      .th-p2-topic { width: 56mm !important; background: #A7D8BD !important; color: #064E3B !important; }
      .th-p2-tot { width: 17mm !important; background: #BFE0F7 !important; color: #0C4A6E !important; }
      .th-p2-pre { width: 15mm !important; background: #B9E6C4 !important; color: #14532D !important; }
      .th-p2-abs { width: 15mm !important; background: #F3C6F0 !important; color: #6B1F66 !important; }
      .th-p2-avg { width: 19mm !important; background: #FCE9A8 !important; color: #5B3A06 !important; }
      .th-p2-bel5 { width: 24mm !important; background: #BFE0F7 !important; color: #0C4A6E !important; }
      .th-p2-gaps { width: 62mm !important; background: #A7D8BD !important; color: #064E3B !important; }
      .th-p2-act { background: #DCCFF5 !important; color: #4C1D95 !important; }

      /* Page 2 body (31 rows share the free height) */
      table.dt-sum-table tbody td { font-size: 7pt !important; }
      .col-p2-date { font-weight: 800 !important; }
      .col-p2-day { font-weight: 600 !important; }
      .col-p2-tot { font-weight: 700 !important; background: #F1F8FD !important; }
      .col-p2-pres { font-weight: 700 !important; color: #166534 !important; background: #F0FAF2 !important; }
      .col-p2-abs { font-weight: 700 !important; color: #86198F !important; background: #FBF0FA !important; }
      .col-p2-avg { font-weight: 900 !important; background: #FFF8DC !important; }
      .col-p2-bel5 { font-weight: 800 !important; color: #0C4A6E !important; background: #F1F8FD !important; }
      .col-p2-topic { background: #F4FBF7 !important; }
      .col-p2-gaps { background: #F4FBF7 !important; }
      .col-p2-action { background: #F7F3FD !important; }
      tr.row-off td { background: #F3F4F6 !important; color: #9CA3AF !important; }

      /* ---------- Bottom boxes (fixed height) ---------- */
      .dt-p1-bottom, .dt-p2-bottom {
        flex: 0 0 34mm !important;
        height: 34mm !important;
        display: flex !important;
        align-items: stretch !important;
        gap: 2.5mm !important;
        margin-bottom: 1.8mm !important;
      }

      .dt-card-box {
        border: 1px solid #0B5D45 !important;
        border-radius: 4px !important;
        background: #FFFFFF !important;
        padding: 0 2.2mm 1.5mm 2.2mm !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }

      .dt-card-header {
        background: #0B5D45 !important;
        color: #FFFFFF !important;
        font-size: 8.5pt !important;
        font-weight: 900 !important;
        letter-spacing: 0.03em !important;
        padding: 1.2mm 2.2mm !important;
        margin: 0 -2.2mm 1.6mm -2.2mm !important;
        display: flex !important;
        align-items: center !important;
        gap: 1.5mm !important;
        line-height: 1.1 !important;
      }
      .dt-box-icon { width: 4mm !important; height: 4mm !important; }

      .dt-box-instructions { flex: 0 0 92mm !important; background: #F1F9F4 !important; }
      .dt-box-declaration { flex: 0 0 62mm !important; }
      .dt-box-review { flex: 0 0 74mm !important; }
      .dt-box-quote { flex: 1 !important; background: #FFF5CF !important; border: 1px solid #F3E3A0 !important; text-align: center !important; justify-content: center !important; align-items: center !important; padding: 1.5mm !important; }

      .dt-box-summary { flex: 0 0 104mm !important; }
      .dt-box-reflection { flex: 0 0 70mm !important; }
      .dt-box-p2-sigs { flex: 0 0 74mm !important; }

      .dt-card-list {
        margin: 0 !important;
        padding-left: 4.5mm !important;
        font-size: 7pt !important;
        line-height: 1.5 !important;
        font-weight: 500 !important;
        color: #1F2937 !important;
      }

      .dt-decl-text { font-size: 6.8pt !important; line-height: 1.3 !important; color: #1F2937 !important; margin-bottom: 1.5mm !important; }

      .dt-sig-lines {
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        flex: 1 !important;
        font-size: 7pt !important;
        font-weight: 600 !important;
        color: #111827 !important;
      }

      .dt-sig-line { display: flex !important; align-items: flex-end !important; gap: 1mm !important; white-space: nowrap !important; font-size: 7pt !important; font-weight: 600 !important; }
      .dt-fill-val { text-align: center !important; font-weight: 900 !important; font-size: 8.5pt !important; color: #111827 !important; line-height: 1 !important; }
      .line-fill { flex: 1 !important; border-bottom: 0.8px solid #6B7280 !important; min-height: 3.2mm !important; }

      .dt-quote-mark { font-size: 20pt !important; line-height: 0.8 !important; font-weight: 900 !important; color: #D97706 !important; margin-bottom: 0.5mm !important; }
      .dt-quote-cap { margin-bottom: 1mm !important; }
      .dt-quote-body { font-size: 9pt !important; font-weight: 800 !important; line-height: 1.3 !important; color: #0B5D45 !important; }

      .dt-summary-fields { display: flex !important; flex-direction: column !important; justify-content: space-between !important; flex: 1 !important; }
      .dt-summary-row { display: flex !important; gap: 3mm !important; }
      .dt-summary-row > div { flex: 1 !important; }
      .dt-reflection-body { display: flex !important; flex-direction: column !important; justify-content: space-between !important; flex: 1 !important; }
      .p2-sig-grid { gap: 2mm !important; }

      /* ---------- Footers ---------- */
      .dt-footer {
        flex: 0 0 8.5mm !important;
        height: 8.5mm !important;
        background: #0B5D45 !important;
        color: #FFFFFF !important;
        border-radius: 4px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 0 0 0 5mm !important;
        overflow: hidden !important;
      }
      .dt-footer-quote { font-family: Georgia, "Times New Roman", serif !important; font-size: 11pt !important; font-style: italic !important; color: #FEF3C7 !important; }
      .dt-footer-center { font-size: 8.5pt !important; font-weight: 700 !important; letter-spacing: 0.03em !important; }
      .dt-footer-badge {
        background: #FFC82C !important;
        color: #0B5D45 !important;
        font-size: 9pt !important;
        font-weight: 900 !important;
        padding: 0 6mm 0 12mm !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        clip-path: polygon(8mm 0, 100% 0, 100% 100%, 0 100%) !important;
      }
      .dt-footer-p2-left { display: flex !important; align-items: center !important; gap: 5mm !important; font-size: 9pt !important; font-weight: 900 !important; letter-spacing: 0.05em !important; }
      .dt-motto-pill { display: flex !important; align-items: center !important; gap: 1.5mm !important; }
      .pill-ic { width: 4.5mm !important; height: 4.5mm !important; }
      .pill-divider { opacity: 0.5 !important; }
      .dt-footer-p2-badge {
        background: #FFC82C !important;
        color: #0B5D45 !important;
        font-size: 11pt !important;
        font-family: Georgia, "Times New Roman", serif !important;
        font-style: italic !important;
        font-weight: 900 !important;
        padding: 0 6mm 0 14mm !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        clip-path: polygon(9mm 0, 100% 0, 100% 100%, 0 100%) !important;
      }
    </style>
  `;

  return styles + allPage1SheetsHTML + page2HTML;
}
