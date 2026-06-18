import XLSX from 'xlsx';

// Helper: Convert Excel date serial number to YYYY-MM-DD
function excelDateToISO(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val).trim();
}

// Helper: Parse days between two YYYY-MM-DD strings
function parseDaysBetween(d1, d2) {
  if (!d1 || !d2) return 0;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  const diff = date2 - date1;
  return Math.max(0, Math.round(diff / (86400 * 1000)));
}

try {
  // Read projects.xlsx
  const wbInput = XLSX.readFile('projects.xlsx');
  const sheetInput = wbInput.Sheets[wbInput.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheetInput);

  const todayStr = '2026-06-13'; // App simulated date
  const today = new Date(todayStr);

  const projectsMap = new Map();
  const projectsList = [];
  const tasksList = [];

  let currentProjectId = 0;
  let currentProjectName = '';

  // Track hierarchical counters
  let taskCounter = 0;
  let subTaskCounter = 0;
  let activityCounter = 0;
  let subActivityCounter = 0;

  let currentTaskId = '';
  let currentSubTaskId = '';
  let currentActivityId = '';

  const projectDescriptions = {
    'BP': 'Develop and integrate the Business Process forms, master data mapping, and agent orchestration workflows.',
    'Leasing Automation': 'Automate and streamline the leasing process lifecycle up to Purchase Order creation.',
    'eBRC': 'Integrate electronic Bank Realization Certificate fetching and automated reconciliation services.',
    'Forex': 'Build a real-time Forex dashboard displaying replicas, MTM reports, and what-if analysis.',
    'IDPMS Dashboard': 'Create a consolidated Import Data Processing and Monitoring System dashboard for import tracking.',
    'Bill of Entry': 'Automate custom details extraction using scripts and process mapping for custom clearance.',
    'Bill of Entry Checklist': 'Develop, implement, and run checklist validation scripts for Bill of Entry files.',
    'Pre-Import Condition Controls in LN': 'Configure and deploy pre-import compliance condition controls inside Infor LN ERP.',
    'Banking API Integration': 'Secure API integration with banking partners including token engines and callback webhooks.',
    'ITR-1 Dashboard': 'Implement portfolio dashboards for automated income tax return tracking (ITR-1).',
    'Steel Dashboard Enhancements': 'Upgrade the Steel department dashboard to assist with stockout decisions, hedge decisions, and rate comparisons.'
  };

  const projectDepts = {
    'BP': 'corporate procurement digital',
    'Leasing Automation': 'finance',
    'eBRC': 'exports',
    'Forex': 'finance',
    'IDPMS Dashboard': 'banking',
    'Bill of Entry': 'imports',
    'Bill of Entry Checklist': 'imports',
    'Pre-Import Condition Controls in LN': 'imports',
    'Banking API Integration': 'banking',
    'ITR-1 Dashboard': 'it',
    'Steel Dashboard Enhancements': 'steel'
  };

  rawData.forEach((row) => {
    // A row defines a new project if the Project column is set AND either:
    // - There are no task-like columns set, OR
    // - The Project name is different from the active one.
    const isNewProjectRow = row.Project && 
      (!row.Task && !row['Sub Task'] && !row.Activity && !row['Sub Activity'] || row.Project !== currentProjectName);

    if (isNewProjectRow) {
      currentProjectId++;
      currentProjectName = row.Project.trim();
      
      // Reset hierarchical counters
      taskCounter = 0;
      subTaskCounter = 0;
      activityCounter = 0;
      subActivityCounter = 0;
      currentTaskId = '';
      currentSubTaskId = '';
      currentActivityId = '';

      // Set fallback project managers
      let pm = row.Responsible || '';
      if (!pm && currentProjectName === 'BP') pm = 'Ananth';
      if (!pm && currentProjectName === 'Leasing Automation') pm = 'Mehrshad Nava';
      if (!pm && currentProjectName === 'eBRC') pm = 'Ivan';
      if (!pm && currentProjectName === 'Forex') pm = 'Ananth';
      if (!pm && currentProjectName === 'Bill of Entry') pm = 'Mehrshad';
      if (!pm && currentProjectName === 'Bill of Entry Checklist') pm = 'Charit';
      if (!pm && currentProjectName === 'Steel Dashboard Enhancements') pm = 'Ivan';

      const p = {
        'Project id': String(currentProjectId),
        'Project Name': currentProjectName,
        'Project Description': projectDescriptions[currentProjectName] || `${currentProjectName} Implementation`,
        'Project Planned Start Date': excelDateToISO(row['Planned Start Date']),
        'Project Planned End Date': excelDateToISO(row['Planned End Date']),
        'Project Budget': 2500000 + (currentProjectId % 3) * 1000000,
        'Project Spent': 0,
        'Project Manager': pm.trim(),
        'Department': projectDepts[currentProjectName] || 'steel',
        'Project Status': 'on-track',
        'Project Actual Start Date': excelDateToISO(row['Actual Start Date']),
        'Project Actual End Date': excelDateToISO(row['Actual End Date']),
        'Project Progress': 0
      };
      projectsList.push(p);
      projectsMap.set(String(currentProjectId), p);
    }

    // Process tasks, subtasks, activities, and subactivities
    const taskName = row.Task || row['Sub Task'] || row.Activity || row['Sub Activity'];
    if (taskName) {
      let taskIdStr = '';
      
      if (row.Task) {
        taskCounter++;
        subTaskCounter = 0;
        activityCounter = 0;
        subActivityCounter = 0;
        taskIdStr = `${taskCounter}`;
        currentTaskId = taskIdStr;
      } else if (row['Sub Task']) {
        subTaskCounter++;
        activityCounter = 0;
        subActivityCounter = 0;
        taskIdStr = `${currentTaskId}.${subTaskCounter}`;
        currentSubTaskId = taskIdStr;
      } else if (row.Activity) {
        activityCounter++;
        subActivityCounter = 0;
        taskIdStr = `${currentSubTaskId}.${activityCounter}`;
        currentActivityId = taskIdStr;
      } else if (row['Sub Activity']) {
        subActivityCounter++;
        taskIdStr = `${currentActivityId}.${subActivityCounter}`;
      }

      const plannedStart = excelDateToISO(row['Planned Start Date']);
      const plannedEnd = excelDateToISO(row['Planned End Date']);
      const actualStart = excelDateToISO(row['Actual Start Date']);
      const actualEnd = excelDateToISO(row['Actual End Date']);

      const t = {
        'Project id': String(currentProjectId),
        'Task Id': taskIdStr,
        'Task Name': taskName.trim(),
        'Task Planned Start Date': plannedStart,
        'Task Planned End Date': plannedEnd,
        'Task Actual Start Date': actualStart,
        'Task Actual End Date': actualEnd,
        'Task Assignee': (row.Responsible || projectsMap.get(String(currentProjectId))['Project Manager'] || '').trim(),
        'Task Status': 'not-started',
        'Task Days Delayed': 0,
        'Task Delay Reason': '',
        'Task Delay Impact': '',
        'Task Delay Reported By': '',
        'Task Progress': 0,
        '_remarks': row.Remarks || row.Dependencies || ''
      };
      tasksList.push(t);
    }
  });

  // Rollups & Calculations
  projectsList.forEach(p => {
    const pid = p['Project id'];
    const pTasks = tasksList.filter(t => t['Project id'] === pid);
    
    if (pTasks.length > 0) {
      const taskIds = pTasks.map(t => t['Task Id']);
      const isLeaf = (id) => !taskIds.some(otherId => otherId.startsWith(id + '.'));

      pTasks.forEach(t => {
        const plannedStart = t['Task Planned Start Date'];
        const plannedEnd = t['Task Planned End Date'];
        const actualStart = t['Task Actual Start Date'];
        const actualEnd = t['Task Actual End Date'];

        let status = 'not-started';
        let progress = 0;

        if (actualEnd) {
          status = 'completed';
          progress = 100;
        } else if (actualStart) {
          status = 'in-progress';
          if (plannedStart && plannedEnd) {
            const totalDays = parseDaysBetween(plannedStart, plannedEnd);
            const daysSpent = parseDaysBetween(actualStart, todayStr);
            if (totalDays > 0) {
              progress = Math.min(95, Math.max(10, Math.round((daysSpent / totalDays) * 100)));
            } else {
              progress = 50;
            }
          } else {
            progress = 50;
          }
        }

        let daysDelayed = 0;
        if (isLeaf(t['Task Id'])) {
          if (actualEnd && plannedEnd && new Date(actualEnd) > new Date(plannedEnd)) {
            daysDelayed = parseDaysBetween(plannedEnd, actualEnd);
          } else if (!actualEnd && plannedEnd && today > new Date(plannedEnd)) {
            daysDelayed = parseDaysBetween(plannedEnd, todayStr);
          }
        }

        if (daysDelayed > 0) {
          status = 'delayed';
          t['Task Days Delayed'] = daysDelayed;
          t['Task Delay Reason'] = t['_remarks'] || 'Operational bottlenecks and resource allocation delays.';
          t['Task Delay Impact'] = 'Pushed back downstream task completions.';
          t['Task Delay Reported By'] = t['Task Assignee'] || p['Project Manager'] || 'Project Manager';
        }

        t['Task Status'] = status;
        t['Task Progress'] = progress;
      });

      // Roll up Project Dates
      const plannedStarts = pTasks.map(t => t['Task Planned Start Date']).filter(Boolean);
      const plannedEnds = pTasks.map(t => t['Task Planned End Date']).filter(Boolean);
      const actualStarts = pTasks.map(t => t['Task Actual Start Date']).filter(Boolean);
      const actualEnds = pTasks.map(t => t['Task Actual End Date']).filter(Boolean);

      if (plannedStarts.length > 0 && !p['Project Planned Start Date']) {
        p['Project Planned Start Date'] = plannedStarts.reduce((min, cur) => cur < min ? cur : min, plannedStarts[0]);
      }
      if (plannedEnds.length > 0 && !p['Project Planned End Date']) {
        p['Project Planned End Date'] = plannedEnds.reduce((max, cur) => cur > max ? cur : max, plannedEnds[0]);
      }
      if (actualStarts.length > 0 && !p['Project Actual Start Date']) {
        p['Project Actual Start Date'] = actualStarts.reduce((min, cur) => cur < min ? cur : min, actualStarts[0]);
      }
      if (actualEnds.length > 0 && pTasks.every(t => t['Task Status'] === 'completed') && !p['Project Actual End Date']) {
        p['Project Actual End Date'] = actualEnds.reduce((max, cur) => cur > max ? cur : max, actualEnds[0]);
      }

      // Roll up Progress (average of top-level tasks)
      const rootTasks = pTasks.filter(t => !t['Task Id'].includes('.'));
      const targetTasks = rootTasks.length > 0 ? rootTasks : pTasks;
      const progressSum = targetTasks.reduce((sum, t) => sum + (t['Task Progress'] || 0), 0);
      p['Project Progress'] = Math.round(progressSum / targetTasks.length);

      // Roll up Status & Delay count
      const totalDelays = pTasks.reduce((sum, t) => sum + (t['Task Days Delayed'] || 0), 0);
      
      if (p['Project Progress'] === 100 || p['Project Actual End Date']) {
        p['Project Status'] = 'completed';
      } else if (totalDelays > 0) {
        p['Project Status'] = 'delayed';
      } else {
        p['Project Status'] = 'on-track';
      }

      // Roll up Budget utilization
      p['Project Spent'] = Math.round(p['Project Budget'] * p['Project Progress'] / 100 * 0.85);
    }
  });

  // Clean intermediate fields before writing to sheet
  tasksList.forEach(t => delete t['_remarks']);

  // Extract unique team members
  const uniqueMembers = new Set();
  const teamMembersList = [];

  const roles = {
    'Ananth': 'Senior Solutions Architect',
    'Ivan': 'Senior Workflow Engineer',
    'Mehrshad Nava': 'Lead Business Analyst',
    'Mehrshad': 'Lead Business Analyst',
    'Charit': 'Lead Technical Architect',
    'Charit Mehrshad': 'Lead Technical Architect',
    'Vaishanvi': 'Frontend Developer',
    'GITL': 'Offshore Team Lead',
    'RDC': 'Risk & Compliance Sponsor',
    'Digital': 'Digital Transformation Manager',
    'Ananth & Ivan': 'Core Technical Lead Team',
    'Us & GITL': 'Joint Implementation Partners',
    'GITL / internal': 'GITL Integration Leads',
    'Digital GITL': 'Digital & IT Steering Team',
    'Ivan Charit': 'Technical Lead Pair',
    'Ivan ananath': 'Core Technical Leads',
    'Ivan & Ananth': 'Core Technical Leads',
    'Charit & Vaishanvi': 'Feature Delivery Squad',
    'Benefits, Division, Purchase Team': 'Procurement Advisory Panel',
    'ALL': 'Full Project Group'
  };

  function addTeamMember(name, department) {
    if (!name) return;
    const cleanName = name.trim();
    if (!cleanName || uniqueMembers.has(cleanName)) return;
    uniqueMembers.add(cleanName);

    teamMembersList.push({
      id: `tm${teamMembersList.length + 1}`,
      name: cleanName,
      role: roles[cleanName] || 'Specialist Consultant',
      department: department || 'steel'
    });
  }

  // Populate TeamMembers sheet based on all unique names mapped to their primary department
  projectsList.forEach(p => {
    addTeamMember(p['Project Manager'], p['Department']);
  });
  tasksList.forEach(t => {
    const proj = projectsList.find(p => p['Project id'] === t['Project id']);
    const dept = proj ? proj['Department'] : 'steel';
    addTeamMember(t['Task Assignee'], dept);
  });

  // Write new workbook database.xlsx
  const wbOutput = XLSX.utils.book_new();
  const wsProjects = XLSX.utils.json_to_sheet(projectsList);
  const wsTasks = XLSX.utils.json_to_sheet(tasksList);
  const wsMembers = XLSX.utils.json_to_sheet(teamMembersList);

  XLSX.utils.book_append_sheet(wbOutput, wsProjects, 'Project Details');
  XLSX.utils.book_append_sheet(wbOutput, wsTasks, 'Tasks');
  XLSX.utils.book_append_sheet(wbOutput, wsMembers, 'TeamMembers');

  XLSX.writeFile(wbOutput, 'database.xlsx');
  console.log(`Successfully generated database.xlsx with ${projectsList.length} projects, ${tasksList.length} tasks, and ${teamMembersList.length} team members.`);
} catch (e) {
  console.error('Migration execution failed:', e);
}
