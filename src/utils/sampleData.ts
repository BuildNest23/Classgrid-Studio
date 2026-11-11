import { AppData, Student, Assessment, Fund, DayAttendance, AttendanceStatus } from '../types';

export function generateSampleClassData(): AppData {
  const studentNames: Array<{ name: string; father: string }> = [
    { name: "Muhammad Ali", father: "Tariq Mahmood" },
    { name: "Fatima Zahra", father: "Muhammad Akram" },
    { name: "Ahmad Hassan", father: "Muhammad Aslam" },
    { name: "Zainab Bibi", father: "Abdul Ghafoor" },
    { name: "Usman Tariq", father: "Tariq Mehmood" },
    { name: "Ayesha Noor", father: "Noor Muhammad" },
    { name: "Bilal Ahmed", father: "Ahmed Ali" },
    { name: "Hafsa Maryam", father: "Abdul Rauf" },
    { name: "Hamza Ali", father: "Ali Raza" },
    { name: "Maryam Bibi", father: "Ghulam Mustafa" },
    { name: "Abdullah Raza", father: "Raza Hussain" },
    { name: "Khadija Tul Kubra", father: "Muhammad Farooq" },
    { name: "Zeeshan Haider", father: "Haider Ali" },
    { name: "Sana Fatima", father: "Muhammad Sharif" },
    { name: "Umar Farooq", father: "Farooq Ahmad" },
    { name: "Hira Batool", father: "Syed Abid Hussain" },
    { name: "Hassan Raza", father: "Raza Ali" },
    { name: "Bisma Khan", father: "Imran Khan" },
    { name: "Saad Rafique", father: "Muhammad Rafique" },
    { name: "Alishba Tariq", father: "Tariq Jamil" },
    { name: "Waleed Khalid", father: "Khalid Mehmood" },
    { name: "Rimsha Kanwal", father: "Muhammad Iqbal" },
    { name: "Talha Zubair", father: "Zubair Ahmad" },
    { name: "Noor Ul Ain", father: "Abdul Waheed" },
    { name: "Fahad Mustafa", father: "Mustafa Kamal" },
    { name: "Laiba Arshad", father: "Muhammad Arshad" },
    { name: "Danish Taimoor", father: "Taimoor Ali" },
    { name: "Mahnoor Baloch", father: "Allah Ditta" },
    { name: "Shan Ali", father: "Muhammad Bashir" },
    { name: "Iqra Rehman", father: "Abdul Rehman" },
    { name: "Shahzaib Khan", father: "Nasir Khan" },
    { name: "Kinza Hashmi", father: "Hashim Ali" },
    { name: "Mohsin Raza", father: "Raza Muhammad" },
    { name: "Nimra Javed", father: "Javed Iqbal" },
    { name: "Asad Ullah", father: "Aman Ullah" },
    { name: "Tayyaba Gull", father: "Muhammad Sadiq" },
    { name: "Qasim Ali", father: "Ali Muhammad" },
    { name: "Zoya Malik", father: "Malik Riaz" },
    { name: "Rehan Butt", father: "Tariq Butt" },
    { name: "Anam Shehzadi", father: "Shehzad Ahmad" },
    { name: "Sameer Nadeem", father: "Nadeem Akhtar" },
    { name: "Bushra Bibi", father: "Muhammad Latif" },
    { name: "Shoaib Akhtar", father: "Akhtar Hussain" },
    { name: "Sidra Tul Muntaha", father: "Muhammad Saeed" },
    { name: "Noman Ijaz", father: "Ijaz Ahmad" },
    { name: "Fariha Naz", father: "Nazir Ahmad" },
    { name: "Arham Bilal", father: "Bilal Hussain" },
    { name: "Mehwish Hayat", father: "Hayat Khan" },
    { name: "Haris Rauf", father: "Abdul Rauf" },
    { name: "Samina Kausar", father: "Kausar Parveen" }
  ];

  const now = Date.now();
  const students: Student[] = studentNames.map((s, idx) => {
    const num = idx + 1;
    const rollNo = num < 10 ? `0${num}` : `${num}`;
    const admNo = `ADM-${1000 + num}`;
    return {
      id: `s_demo_${num}`,
      admissionNo: admNo,
      rollNo,
      name: s.name,
      fatherName: s.father,
      phone: `030${(idx % 9) + 1}-${1234000 + num}`,
      address: `Street ${((idx % 12) + 1)}, Block ${(idx % 5) + 1}, Model Town, Lahore`,
      occupation: ["Teacher","Shopkeeper","Engineer","Farmer","Driver","Doctor"][idx % 6],
      notes: idx % 7 === 0 ? "Scholarship student" : idx % 11 === 0 ? "Bus transport user" : "",
      createdAt: now - (50 - idx) * 86400000
    };
  });

  // Generate Current Month attendance & daily test data
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNumStr = String(month + 1).padStart(2, '0');

  const attendance: Record<string, DayAttendance> = {};
  const dailyTests: Record<string, Record<string, number | 'A'>> = {};

  // Deterministic pseudorandom helper so data is consistent & realistic
  const pseudoRand = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Generate records for each day of the current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d);
    const dayOfWeek = dayDate.getDay(); // 0 = Sunday
    const dayKey = `${year}-${monthNumStr}-${String(d).padStart(2, '0')}`;

    if (dayOfWeek === 0) {
      // Sunday Holiday
      attendance[dayKey] = {
        holiday: true,
        locked: false,
        status: {}
      };
      continue;
    }

    const dayStatusMap: Record<string, AttendanceStatus> = {};
    const testMarksMap: Record<string, number | 'A'> = {};

    students.forEach((st, sIdx) => {
      const r = pseudoRand(d * 101 + sIdx * 17);

      // Attendance: mostly Present, 3-5 students Absent or Leave
      let stStatus: AttendanceStatus = 'P';
      if (r < 0.05) {
        stStatus = 'A';
      } else if (r < 0.08) {
        stStatus = 'L';
      }

      if (stStatus !== 'P') {
        dayStatusMap[st.id] = stStatus;
      }

      // Daily Quick Test marks (only on weekdays):
      if (stStatus === 'A' || stStatus === 'L') {
        testMarksMap[st.id] = 'A';
      } else {
        // Performance profile based on student index + day variance
        const baseMark = 5.5 + ((50 - sIdx) / 50) * 3.5; // top roll numbers score slightly higher
        const variance = (pseudoRand(d * 73 + sIdx * 31) - 0.4) * 2.5;
        let score = Math.round((baseMark + variance) * 2) / 2; // snap to 0.5 increments
        score = Math.max(3.5, Math.min(10.0, score));

        // Occasional student scoring below 5
        if (sIdx % 8 === 0 && d % 3 === 0) {
          score = 4.5;
        }

        testMarksMap[st.id] = score;
      }
    });

    attendance[dayKey] = {
      holiday: false,
      locked: d < today.getDate(), // past days locked
      status: dayStatusMap
    };

    dailyTests[dayKey] = testMarksMap;
  }

  // Assessments
  const assessments: Assessment[] = [
    {
      id: "asmt_demo_sba",
      name: "Monthly Assessment (SBA) - September",
      passPercent: 40,
      createdAt: now - 15 * 86400000,
      subjects: [
        { id: "sub_eng", name: "English", max: 50 },
        { id: "sub_urd", name: "Urdu", max: 50 },
        { id: "sub_mat", name: "Mathematics", max: 50 },
        { id: "sub_sci", name: "General Science", max: 50 },
        { id: "sub_cmp", name: "Computer Education", max: 50 }
      ]
    },
    {
      id: "asmt_demo_midterm",
      name: "First Term Examination",
      passPercent: 40,
      createdAt: now - 30 * 86400000,
      subjects: [
        { id: "sub_t_eng", name: "English", max: 100 },
        { id: "sub_t_urd", name: "Urdu", max: 100 },
        { id: "sub_t_mat", name: "Mathematics", max: 100 },
        { id: "sub_t_sci", name: "General Science", max: 100 },
        { id: "sub_t_isl", name: "Islamiat", max: 50 },
        { id: "sub_t_pst", name: "Pak Studies", max: 50 }
      ]
    }
  ];

  const assessmentResults: Record<string, Record<string, Record<string, number | 'A'>>> = {
    asmt_demo_sba: {},
    asmt_demo_midterm: {}
  };

  const assessmentRemarks: Record<string, Record<string, string>> = {
    asmt_demo_sba: {},
    asmt_demo_midterm: {}
  };

  students.forEach((st, sIdx) => {
    // SBA assessment marks
    const sbaSubs: Record<string, number | 'A'> = {};
    assessments[0].subjects.forEach((sub, subIdx) => {
      const base = 22 + ((50 - sIdx) / 50) * 23;
      const r = pseudoRand(sIdx * 41 + subIdx * 19);
      const mark = Math.max(16, Math.min(50, Math.round(base + (r - 0.5) * 8)));
      sbaSubs[sub.id] = mark;
    });
    assessmentResults.asmt_demo_sba[st.id] = sbaSubs;

    if (sIdx < 5) assessmentRemarks.asmt_demo_sba[st.id] = "Excellent academic performance";
    else if (sIdx > 42) assessmentRemarks.asmt_demo_sba[st.id] = "Needs remedial support in Math & Science";

    // Midterm assessment marks
    const midSubs: Record<string, number | 'A'> = {};
    assessments[1].subjects.forEach((sub, subIdx) => {
      const is50 = sub.max === 50;
      const base = is50 ? 20 + ((50 - sIdx) / 50) * 24 : 45 + ((50 - sIdx) / 50) * 48;
      const r = pseudoRand(sIdx * 29 + subIdx * 53);
      const mark = Math.max(is50 ? 15 : 35, Math.min(sub.max, Math.round(base + (r - 0.5) * 14)));
      midSubs[sub.id] = mark;
    });
    assessmentResults.asmt_demo_midterm[st.id] = midSubs;
  });

  // Funds
  const funds: Fund[] = [
    {
      id: "fund_demo_welfare",
      name: "Classroom Welfare & Activity Fund",
      amount: 500,
      dueDate: `${year}-${monthNumStr}-25`,
      createdAt: now - 20 * 86400000
    },
    {
      id: "fund_demo_lab",
      name: "Science & Computer Lab Maintenance",
      amount: 1000,
      dueDate: `${year}-${monthNumStr}-30`,
      createdAt: now - 10 * 86400000
    }
  ];

  const fundPayments: Record<string, Record<string, any>> = {
    fund_demo_welfare: {},
    fund_demo_lab: {}
  };

  students.forEach((st, sIdx) => {
    // Welfare fund: mostly paid, some partial/pending, 2 exempt
    if (sIdx === 3 || sIdx === 27) {
      fundPayments.fund_demo_welfare[st.id] = { exempt: true, note: "Financial assistance grant" };
    } else if (sIdx % 7 === 0) {
      fundPayments.fund_demo_welfare[st.id] = { amount: 250, date: `${year}-${monthNumStr}-08`, note: "First installment" };
    } else if (sIdx % 13 === 0) {
      // Pending
    } else {
      fundPayments.fund_demo_welfare[st.id] = { amount: 500, date: `${year}-${monthNumStr}-05`, note: "Paid in full" };
    }

    // Lab fee
    if (sIdx === 3 || sIdx === 27) {
      fundPayments.fund_demo_lab[st.id] = { exempt: true, note: "Fee waiver" };
    } else if (sIdx % 5 === 0) {
      fundPayments.fund_demo_lab[st.id] = { amount: 500, date: `${year}-${monthNumStr}-12`, note: "Remaining 500 due" };
    } else if (sIdx % 9 === 0) {
      // Pending
    } else {
      fundPayments.fund_demo_lab[st.id] = { amount: 1000, date: `${year}-${monthNumStr}-10`, note: "Cleared" };
    }
  });

  return {
    schoolName: "Govt. High School Model Town, Lahore",
    emisCode: "",
    section: "A",
    academicYear: "2026-2027",
    className: "Grade 10-A",
    inchargeName: "Mr. Tariq Mehmood",
    schoolLogo: "",
    printSize: "m",
    printNote: "Quaid-e-Azam Campus · Section A",
    forceOrientation: "",
    students,
    attendance,
    assessments,
    assessmentResults,
    assessmentManualPass: {},
    assessmentRemarks,
    funds,
    fundPayments,
    dailyTests
  };
}
