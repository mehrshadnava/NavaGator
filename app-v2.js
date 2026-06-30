/* app-v2.js - NavaGator Enterprise Tracker - Complete Vanilla JS */

/* ============================================================
   1. STATE
   ============================================================ */
const state = {
  currentView: 'loading',
  activeProjectId: null,
  projects: [],
  tasks: [],
  teamMembers: [],
  srfs: [],
  kaizens: [],
  isLoading: true,
  theme: localStorage.getItem('tracker_theme') || 'dark',

  // Dashboard
  benefitsConverted: false,
  selectedDept: null,

  // Projects page
  projectSearch: '',
  projectDeptFilter: '',
  projectStatusFilter: '',
  projectSortBy: 'name',

  // Workspace
  workspaceTab: 'overview',
  ganttScale: 'week',
  editTimelineMode: false,
  showCriticalPath: false,
  taskAssigneeFilter: '',
  selectedSRFIndex: 0,
  editingTask: null,
  editingSRF: null,
  collapsedTasks: [],
};

/* ============================================================
   2. HELPERS
   ============================================================ */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function compareTaskIds(idA, idB) {
  const partsA = String(idA).split('.').map(Number);
  const partsB = String(idB).split('.').map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const vA = isNaN(partsA[i]) ? 0 : partsA[i];
    const vB = isNaN(partsB[i]) ? 0 : partsB[i];
    if (vA !== vB) return vA - vB;
  }
  return String(idA).localeCompare(String(idB));
}

function parseBenefits(benefitsStr) {
  if (!benefitsStr) return { type: 'unknown', value: 0 };
  const str = String(benefitsStr).trim();
  const manDaysMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:man\s*days|mandays|man-days|md)$/i);
  if (manDaysMatch) return { type: 'mandays', value: parseFloat(manDaysMatch[1]) };
  const cleanStr = str.replace(/[₹$,\s]/g, '');
  const num = parseFloat(cleanStr);
  if (!isNaN(num)) return { type: 'cost', value: num };
  return { type: 'text', value: 0 };
}

function getSavingsNum(benefitsStr) {
  if (!benefitsStr) return 0;
  const parsed = parseBenefits(benefitsStr);
  if (parsed.type === 'mandays') return parsed.value * 2500;
  return parsed.value;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function svgIcon(name, cls = '') {
  return `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
}

/* ============================================================
   2.5 SCHEDULING & CPM ENGINE
   ============================================================ */
function parseDependencies(depStr) {
  if (!depStr) return [];
  return String(depStr).split(/[\s,;]+/).filter(Boolean).map(part => {
    const match = part.match(/^([0-9.]+)(?::?(FS|SS|FF|SF))?$/i);
    if (match) {
      return {
        predecessorId: match[1],
        type: (match[2] || 'FS').toUpperCase()
      };
    }
    return null;
  }).filter(Boolean);
}

function wouldCreateCycle(projectId, taskId, predecessorId) {
  if (taskId === predecessorId) return true;
  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);
  const visited = new Set();
  const queue = [predecessorId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const task = projectTasks.find(t => t.ID === currentId);
    if (task && task.Dependencies) {
      const deps = parseDependencies(task.Dependencies);
      for (const d of deps) {
        queue.push(d.predecessorId);
      }
    }
  }
  return false;
}

function propagateSchedule(projectId) {
  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);
  const taskIds = projectTasks.map(t => t.ID);
  const isLeaf = (id) => !taskIds.some(otherId => otherId.startsWith(id + '.'));
  const leafTasks = projectTasks.filter(t => isLeaf(t.ID));

  const adj = {};
  const inDegree = {};
  leafTasks.forEach(t => {
    adj[t.ID] = [];
    inDegree[t.ID] = 0;
  });

  leafTasks.forEach(t => {
    const deps = parseDependencies(t.Dependencies);
    deps.forEach(d => {
      const preds = leafTasks.filter(p => p.ID === d.predecessorId || p.ID.startsWith(d.predecessorId + '.'));
      preds.forEach(p => {
        if (adj[p.ID] && !adj[p.ID].includes(t.ID)) {
          adj[p.ID].push({ to: t.ID, type: d.type });
          inDegree[t.ID]++;
        }
      });
    });
  });

  const queue = [];
  leafTasks.forEach(t => {
    if (inDegree[t.ID] === 0) queue.push(t.ID);
  });

  const order = [];
  while (queue.length > 0) {
    const u = queue.shift();
    order.push(u);
    const neighbors = adj[u] || [];
    neighbors.forEach(edge => {
      inDegree[edge.to]--;
      if (inDegree[edge.to] === 0) queue.push(edge.to);
    });
  }

  const tasksToProcess = order.length === leafTasks.length ? order : leafTasks.map(t => t.ID);

  tasksToProcess.forEach(taskId => {
    const t = projectTasks.find(x => x.ID === taskId);
    if (!t) return;
    const deps = parseDependencies(t.Dependencies);
    if (deps.length === 0) return;

    let maxReqStart = null;
    deps.forEach(d => {
      const preds = projectTasks.filter(p => p.ID === d.predecessorId || p.ID.startsWith(d.predecessorId + '.'));
      preds.forEach(p => {
        if (!p.PlannedStartDate || !p.PlannedEndDate) return;
        const pStart = new Date(p.PlannedStartDate).getTime();
        const pEnd = new Date(p.PlannedEndDate).getTime();

        const tStart = t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : pStart;
        const tEnd = t.PlannedEndDate ? new Date(t.PlannedEndDate).getTime() : pEnd;
        const tDur = Math.max(86400000, tEnd - tStart);

        let reqStart = null;
        if (d.type === 'FS') reqStart = pEnd;
        else if (d.type === 'SS') reqStart = pStart;
        else if (d.type === 'FF') reqStart = pEnd - tDur;
        else if (d.type === 'SF') reqStart = pStart - tDur;

        if (reqStart !== null) {
          if (maxReqStart === null || reqStart > maxReqStart) {
            maxReqStart = reqStart;
          }
        }
      });
    });

    if (maxReqStart !== null) {
      const currentStart = t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : 0;
      if (maxReqStart > currentStart) {
        const tStart = t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : maxReqStart;
        const tEnd = t.PlannedEndDate ? new Date(t.PlannedEndDate).getTime() : maxReqStart + 86400000;
        const tDur = Math.max(86400000, tEnd - tStart);

        t.PlannedStartDate = new Date(maxReqStart).toISOString().split('T')[0];
        t.PlannedEndDate = new Date(maxReqStart + tDur).toISOString().split('T')[0];
      }
    }
  });
}

function calculateCriticalPath(projectId) {
  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);
  if (projectTasks.length === 0) return { criticalTaskIds: new Set(), criticalLinks: [] };

  const taskIds = projectTasks.map(t => t.ID);
  const isLeaf = (id) => !taskIds.some(otherId => otherId.startsWith(id + '.'));
  const leafTasks = projectTasks.filter(t => isLeaf(t.ID));

  if (leafTasks.length === 0) return { criticalTaskIds: new Set(), criticalLinks: [] };

  const durations = {};
  const es = {};
  const ef = {};
  const ls = {};
  const lf = {};

  leafTasks.forEach(t => {
    const start = t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : 0;
    const end = t.PlannedEndDate ? new Date(t.PlannedEndDate).getTime() : 0;
    durations[t.ID] = Math.max(86400000, end - start);
    es[t.ID] = 0;
    ef[t.ID] = durations[t.ID];
  });

  const startTimes = leafTasks.map(t => t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : 0).filter(Boolean);
  const projectStart = startTimes.length > 0 ? Math.min(...startTimes) : 0;

  const adj = {};
  const revAdj = {};
  const inDegree = {};

  leafTasks.forEach(t => {
    adj[t.ID] = [];
    revAdj[t.ID] = [];
    inDegree[t.ID] = 0;
  });

  leafTasks.forEach(t => {
    const deps = parseDependencies(t.Dependencies);
    deps.forEach(d => {
      const preds = leafTasks.filter(p => p.ID === d.predecessorId || p.ID.startsWith(d.predecessorId + '.'));
      preds.forEach(p => {
        if (adj[p.ID] && !adj[p.ID].includes(t.ID)) {
          adj[p.ID].push({ to: t.ID, type: d.type });
          revAdj[t.ID].push({ from: p.ID, type: d.type });
          inDegree[t.ID]++;
        }
      });
    });
  });

  const queue = [];
  leafTasks.forEach(t => {
    if (inDegree[t.ID] === 0) queue.push(t.ID);
  });

  const order = [];
  while (queue.length > 0) {
    const u = queue.shift();
    order.push(u);
    const neighbors = adj[u] || [];
    neighbors.forEach(edge => {
      inDegree[edge.to]--;
      if (inDegree[edge.to] === 0) queue.push(edge.to);
    });
  }

  const sortedLeafIds = order.length === leafTasks.length ? order : leafTasks.map(t => t.ID);

  sortedLeafIds.forEach(taskId => {
    const t = leafTasks.find(x => x.ID === taskId);
    const tStart = t.PlannedStartDate ? new Date(t.PlannedStartDate).getTime() : projectStart;
    es[taskId] = tStart - projectStart;
    ef[taskId] = es[taskId] + durations[taskId];
  });

  sortedLeafIds.forEach(taskId => {
    const neighbors = adj[taskId] || [];
    neighbors.forEach(edge => {
      const u = taskId;
      const v = edge.to;
      const uES = es[u];
      const uEF = ef[u];
      const vDur = durations[v];

      let reqES = es[v];
      if (edge.type === 'FS') reqES = uEF;
      else if (edge.type === 'SS') reqES = uES;
      else if (edge.type === 'FF') reqES = uEF - vDur;
      else if (edge.type === 'SF') reqES = uES - vDur;

      if (reqES > es[v]) {
        es[v] = reqES;
        ef[v] = reqES + vDur;
      }
    });
  });

  let projectEndOffset = 0;
  sortedLeafIds.forEach(taskId => {
    if (ef[taskId] > projectEndOffset) {
      projectEndOffset = ef[taskId];
    }
  });

  sortedLeafIds.forEach(taskId => {
    lf[taskId] = projectEndOffset;
    ls[taskId] = lf[taskId] - durations[taskId];
  });

  const revOrder = [...sortedLeafIds].reverse();
  revOrder.forEach(taskId => {
    const predecessors = revAdj[taskId] || [];
    predecessors.forEach(edge => {
      const v = taskId;
      const u = edge.from;
      const vLS = ls[v];
      const vLF = lf[v];
      const uDur = durations[u];

      let reqLF = lf[u];
      if (edge.type === 'FS') reqLF = vLS;
      else if (edge.type === 'SS') reqLF = vLS + uDur;
      else if (edge.type === 'FF') reqLF = vLF;
      else if (edge.type === 'SF') reqLF = vLF + uDur;

      if (reqLF < lf[u]) {
        lf[u] = reqLF;
        ls[u] = reqLF - uDur;
      }
    });
  });

  const criticalTaskIds = new Set();
  leafTasks.forEach(t => {
    const slack = ls[t.ID] - es[t.ID];
    if (Math.abs(slack) < 3600000 * 12) {
      criticalTaskIds.add(t.ID);
    }
  });

  projectTasks.forEach(t => {
    if (!isLeaf(t.ID)) {
      const childrenCritical = leafTasks.some(l => l.ID.startsWith(t.ID + '.') && criticalTaskIds.has(l.ID));
      if (childrenCritical) {
        criticalTaskIds.add(t.ID);
      }
    }
  });

  const criticalLinks = [];
  leafTasks.forEach(t => {
    if (criticalTaskIds.has(t.ID)) {
      const deps = parseDependencies(t.Dependencies);
      deps.forEach(d => {
        const preds = leafTasks.filter(p => p.ID === d.predecessorId || p.ID.startsWith(d.predecessorId + '.'));
        preds.forEach(p => {
          if (criticalTaskIds.has(p.ID)) {
            criticalLinks.push({ from: p.ID, to: t.ID, type: d.type });
          }
        });
      });
    }
  });

  return { criticalTaskIds, criticalLinks };
}

function getStatusBadgeClass(status) {
  if (status === 'on-track') return 'badge badge-on-track';
  if (status === 'delayed') return 'badge badge-delayed';
  if (status === 'at-risk') return 'badge badge-at-risk';
  if (status === 'completed') return 'badge badge-completed';
  return 'badge';
}

function getStatusText(status) {
  if (status === 'on-track') return 'On Track';
  if (status === 'at-risk') return 'At Risk';
  if (status === 'delayed') return 'On Going';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
}

function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const num = Number(val);
  if (!isNaN(num) && num > 10000 && num < 100000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  if (!str) return '';
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return str;
}

function getProp(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of Object.keys(obj)) {
      if (cleanK === key.toLowerCase().replace(/[^a-z0-9]/g, '')) return obj[key];
    }
  }
  return undefined;
}

/* ============================================================
   3. EXCEL IMPORT (SheetJS)
   ============================================================ */
function parseExcelBuffer(buffer) {
  const dataBytes = new Uint8Array(buffer);
  const workbook = XLSX.read(dataBytes, { type: 'array', cellDates: true });

  const projectSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('project details') || n.toLowerCase().includes('projectdetails') || n.toLowerCase() === 'projects'
  ) || workbook.SheetNames[0];

  const tasksSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase() === 'tasks' || n.toLowerCase().includes('task')
  ) || workbook.SheetNames[1];

  const membersSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('teammember') || n.toLowerCase().includes('team member') ||
    n.toLowerCase().includes('user') || n.toLowerCase().includes('member')
  );

  const srfSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().includes('srf') || n.toLowerCase().includes('procurement')
  );

  const sheetProjects = workbook.Sheets[projectSheetName];
  const sheetTasks = workbook.Sheets[tasksSheetName];
  const sheetMembers = membersSheetName ? workbook.Sheets[membersSheetName] : null;
  const sheetSRF = srfSheetName ? workbook.Sheets[srfSheetName] : null;

  if (!sheetProjects) throw new Error('Project Details worksheet not found.');

  const projectRows = XLSX.utils.sheet_to_json(sheetProjects) || [];
  const taskRows = sheetTasks ? XLSX.utils.sheet_to_json(sheetTasks) : [];
  const membersRows = sheetMembers ? XLSX.utils.sheet_to_json(sheetMembers) : [];
  const srfRows = sheetSRF ? XLSX.utils.sheet_to_json(sheetSRF) : [];

  const projects = projectRows.map(row => ({
    ID: String(getProp(row, ['Project id', 'ProjectID', 'ID']) || ''),
    Name: String(getProp(row, ['Project Name', 'ProjectName', 'Name']) || ''),
    Description: String(getProp(row, ['Project Description', 'ProjectDescription', 'Description']) || ''),
    Department: String(getProp(row, ['Department', 'Dept']) || 'steel'),
    Status: 'on-track', // Recalculated at runtime
    Spent: Number(getProp(row, ['Project Spent', 'ProjectSpent', 'Spent']) || 0),
    PlannedStartDate: parseExcelDate(getProp(row, ['Project Planned Start Date', 'ProjectPlannedStartDate', 'PlannedStartDate', 'StartDate']) || ''),
    PlannedEndDate: parseExcelDate(getProp(row, ['Project Planned End Date', 'ProjectPlannedEndDate', 'PlannedEndDate', 'EndDate']) || ''),
    ActualStartDate: parseExcelDate(getProp(row, ['Project Actual Start Date', 'ProjectActualStartDate', 'ActualStartDate']) || ''),
    ActualEndDate: parseExcelDate(getProp(row, ['Project Actual End Date', 'ProjectActualEndDate', 'ActualEndDate']) || ''),
    DaysDelayed: 0, // Recalculated at runtime
    ProjectManager: String(getProp(row, ['Project Manager', 'ProjectManager', 'Manager']) || ''),
    Progress: 0, // Recalculated at runtime
    Benefits: String(getProp(row, ['Project Benefits', 'ProjectBenefits', 'Benefits', 'benifits']) || '')
  })).filter(p => p.ID);

  const tasks = taskRows.map(row => ({
    ID: String(getProp(row, ['Task Id', 'TaskID', 'ID']) || ''),
    ProjectID: String(getProp(row, ['Project id', 'ProjectID']) || ''),
    Name: String(getProp(row, ['Task Name', 'TaskName', 'Name']) || ''),
    PlannedStartDate: parseExcelDate(getProp(row, ['Task Planned Start Date', 'TaskPlannedStartDate', 'StartDate', 'PlannedStartDate']) || ''),
    PlannedEndDate: parseExcelDate(getProp(row, ['Task Planned End Date', 'TaskPlannedEndDate', 'EndDate', 'PlannedEndDate']) || ''),
    ActualStartDate: parseExcelDate(getProp(row, ['Task Actual Start Date', 'TaskActualStartDate', 'ActualStartDate']) || ''),
    ActualEndDate: parseExcelDate(getProp(row, ['Task Actual End Date', 'TaskActualEndDate', 'ActualEndDate']) || ''),
    Assignee: String(getProp(row, ['Task Assignee', 'TaskAssignee', 'Assignee']) || ''),
    Status: 'not-started', // Recalculated at runtime
    Progress: 0, // Recalculated at runtime
    DaysDelayed: 0, // Recalculated at runtime
    DelayReason: String(getProp(row, ['Task Delay Reason', 'TaskDelayReason', 'DelayReason', 'Reason']) || ''),
    DelayImpact: String(getProp(row, ['Task Delay Impact', 'TaskDelayImpact', 'DelayImpact', 'Impact']) || ''),
    DelayReportedBy: String(getProp(row, ['Task Delay Reported By', 'TaskDelayReportedBy', 'DelayReportedBy', 'ReportedBy']) || ''),
    Dependencies: String(getProp(row, ['Task Predecessors', 'Predecessors', 'Task Dependencies', 'Dependencies', 'Predecessor']) || '')
  })).filter(t => t.ID && t.ProjectID);

  const teamMembers = membersRows.map(row => ({
    id: String(getProp(row, ['id', 'ID']) || ''),
    name: String(getProp(row, ['name', 'Name']) || ''),
    role: String(getProp(row, ['role', 'Role']) || 'Specialist'),
    department: String(getProp(row, ['department', 'Department', 'Dept']) || 'steel')
  })).filter(m => m.id && m.name);

  const srfs = srfRows.map(row => ({
    ProjectID: String(getProp(row, ['Project id', 'ProjectID']) || ''),
    SRFNo: String(getProp(row, ['SRF No', 'SRFNo', 'SRFNumber']) || ''),
    Developments: String(getProp(row, ['Developments', 'Development']) || ''),
    User: String(getProp(row, ['User', 'Requester']) || ''),
    MandaysFC: Number(getProp(row, ['Mandays FC', 'MandaysFC', 'FC Mandays']) || 0),
    MandaysTC: Number(getProp(row, ['Mandays TC', 'MandaysTC', 'TC Mandays']) || 0),
    TotalMandays: Number(getProp(row, ['Total Mandays', 'TotalMandays']) || 0),
    Cost: Number(getProp(row, ['Development Cost (INR)', 'DevelopmentCost', 'Cost']) || 0),
    Status: String(getProp(row, ['Status', 'SRF Status']) || 'Uploaded On'),
    UploadedOn: parseExcelDate(getProp(row, ['Uploaded On', 'UploadedOn']) || ''),
    ApprovedOn: parseExcelDate(getProp(row, ['Approved On', 'ApprovedOn']) || ''),
    ReceivedCCB: parseExcelDate(getProp(row, ['Received for CCB', 'ReceivedForCCB', 'Received CCB']) || ''),
    SendCCB: parseExcelDate(getProp(row, ['Send for CCB', 'SendForCCB', 'Send CCB']) || ''),
    CCBReceived: parseExcelDate(getProp(row, ['CCB Received On', 'CCBReceivedOn', 'CCB Received']) || ''),
    CCBAttached: parseExcelDate(getProp(row, ['CCB Attached in CRS On', 'CCBAttachedInCRSOn', 'CCB Attached']) || ''),
    FSDReceived: parseExcelDate(getProp(row, ['FSD Received On', 'FSDReceivedOn', 'FSD Received']) || ''),
    FSDApproved: parseExcelDate(getProp(row, ['FSD Approved On', 'FSDApprovedOn', 'FSD Approved']) || ''),
    ReceivedUAT: parseExcelDate(getProp(row, ['Received for UAT', 'ReceivedForUAT', 'Received UAT']) || ''),
    ActualTestingApproval: parseExcelDate(getProp(row, ['Actual Testing & Approval', 'ActualTestingAndApproval', 'Testing Approval']) || ''),
    SRFClose: parseExcelDate(getProp(row, ['SRF Close', 'SRFClose', 'Closed On']) || '')
  })).filter(s => s.SRFNo);

  const kaizenSheetName = workbook.SheetNames.find(n =>
    n.toLowerCase() === 'kaizen' || n.toLowerCase().includes('kaizen')
  );
  const sheetKaizen = kaizenSheetName ? workbook.Sheets[kaizenSheetName] : null;
  const kaizenRows = sheetKaizen ? XLSX.utils.sheet_to_json(sheetKaizen) : [];

  const kaizens = kaizenRows.map(row => ({
    ProjectID: String(getProp(row, ['Project id', 'ProjectID']) || ''),
    ID: String(getProp(row, ['Kaizen Id', 'KaizenID', 'ID']) || ''),
    Title: String(getProp(row, ['Title', 'Description', 'Kaizen Title']) || ''),
    UploadedOn: parseExcelDate(getProp(row, ['Uploaded On', 'UploadedOn']) || ''),
    ApprovedL1: parseExcelDate(getProp(row, ['Approved by L+1', 'ApprovedByL1', 'ApprovedL1']) || ''),
    ApprovedL2: parseExcelDate(getProp(row, ['Approved by L+2', 'ApprovedByL2', 'ApprovedL2']) || ''),
    Grade: String(getProp(row, ['Grade', 'grade']) || 'L1')
  })).filter(k => k.ID && k.ProjectID);

  return { projects, tasks, teamMembers, srfs, kaizens };
}

/* ============================================================
   4. EXCEL EXPORT (ExcelJS)
   ============================================================ */
async function exportExcelWorkbook(stateSnapshot) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NavaGator Enterprise Tracker';
  wb.created = new Date();

  const styleWS = (ws, tableName, columns, rows, cellFormats = {}) => {
    ws.views = [{ showGridLines: true }];
    const safeRows = rows.length > 0 ? rows : [Array(columns.length).fill('')];
    ws.addTable({
      name: tableName,
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: { theme: 'TableStyleMedium9', showRowStripes: true },
      columns: columns.map(col => ({ name: col, filterButton: true })),
      rows: safeRows
    });
    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell(cell => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } };
    });
    for (let r = 2; r <= safeRows.length + 1; r++) {
      const row = ws.getRow(r);
      row.height = 20;
      row.eachCell((cell, colNumber) => {
        const colName = columns[colNumber - 1];
        cell.font = { name: 'Segoe UI', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        if (cellFormats[colName]) {
          const fmt = cellFormats[colName];
          if (fmt.type === 'currency') {
            cell.numFmt = '₹#,##,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
            if (typeof cell.value === 'string') {
              const v = parseFloat(cell.value.replace(/[^\d.-]/g, ''));
              if (!isNaN(v)) cell.value = v;
            }
          } else if (fmt.type === 'number') {
            cell.numFmt = '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (fmt.type === 'date') {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (fmt.type === 'progress') {
            cell.numFmt = '0"%"';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        }
      });
    }
    columns.forEach((col, i) => {
      const colCells = ws.getColumn(i + 1);
      let maxLen = col.length;
      colCells.eachCell({ includeEmpty: true }, cell => {
        const v = String(cell.value || '');
        if (v.length > maxLen) maxLen = v.length;
      });
      ws.getColumn(i + 1).width = Math.min(45, Math.max(12, maxLen + 3));
    });
  };

  // Projects sheet
  const wsP = wb.addWorksheet('Project Details');
  const projCols = ['Project id', 'Project Name', 'Project Description', 'Project Planned Start Date', 'Project Planned End Date', 'Project Spent', 'Project Manager', 'Department', 'Project Actual Start Date', 'Project Actual End Date', 'Project Benefits'];
  const projRows = stateSnapshot.projects.map(p => [p.ID, p.Name, p.Description, p.PlannedStartDate, p.PlannedEndDate, p.Spent, p.ProjectManager, p.Department, p.ActualStartDate, p.ActualEndDate, p.Benefits || '']);
  styleWS(wsP, 'ProjectsTable', projCols, projRows, { 'Project Spent': { type: 'currency' }, 'Project Planned Start Date': { type: 'date' }, 'Project Planned End Date': { type: 'date' }, 'Project Actual Start Date': { type: 'date' }, 'Project Actual End Date': { type: 'date' } });

  // Tasks sheet
  const wsT = wb.addWorksheet('Tasks');
  const taskCols = ['Project id', 'Task Id', 'Task Name', 'Task Planned Start Date', 'Task Planned End Date', 'Task Actual Start Date', 'Task Actual End Date', 'Task Assignee', 'Task Delay Reason', 'Task Delay Impact', 'Task Delay Reported By', 'Task Predecessors'];
  const taskRowsData = stateSnapshot.tasks.map(t => [t.ProjectID, t.ID, t.Name, t.PlannedStartDate, t.PlannedEndDate, t.ActualStartDate, t.ActualEndDate, t.Assignee || '', t.DelayReason || '', t.DelayImpact || '', t.DelayReportedBy || '', t.Dependencies || '']);
  styleWS(wsT, 'TasksTable', taskCols, taskRowsData, { 'Task Planned Start Date': { type: 'date' }, 'Task Planned End Date': { type: 'date' }, 'Task Actual Start Date': { type: 'date' }, 'Task Actual End Date': { type: 'date' } });

  // Members sheet
  const wsM = wb.addWorksheet('TeamMembers');
  styleWS(wsM, 'MembersTable', ['id', 'name', 'role', 'department'], stateSnapshot.teamMembers.map(m => [m.id, m.name, m.role, m.department]));

  // SRF sheet
  const wsSRF = wb.addWorksheet('SRF Summary');
  const srfCols = ['Project id', 'SRF No', 'Developments', 'User', 'Mandays FC', 'Mandays TC', 'Total Mandays', 'Development Cost (INR)', 'Status', 'Uploaded On', 'Approved On', 'Received for CCB', 'Send for CCB', 'CCB Received On', 'CCB Attached in CRS On', 'FSD Received On', 'FSD Approved On', 'Received for UAT', 'Actual Testing & Approval', 'SRF Close'];
  const srfData = stateSnapshot.srfs.map(s => [s.ProjectID, s.SRFNo, s.Developments, s.User, s.MandaysFC || 0, s.MandaysTC || 0, (s.MandaysFC || 0) + (s.MandaysTC || 0), s.Cost || 0, s.Status || 'Uploaded On', s.UploadedOn, s.ApprovedOn, s.ReceivedCCB, s.SendCCB, s.CCBReceived, s.CCBAttached, s.FSDReceived, s.FSDApproved, s.ReceivedUAT, s.ActualTestingApproval, s.SRFClose]);
  styleWS(wsSRF, 'SRFTable', srfCols, srfData, { 'Mandays FC': { type: 'number' }, 'Mandays TC': { type: 'number' }, 'Total Mandays': { type: 'number' }, 'Development Cost (INR)': { type: 'currency' }, 'Uploaded On': { type: 'date' }, 'Approved On': { type: 'date' }, 'Received for CCB': { type: 'date' }, 'Send for CCB': { type: 'date' }, 'CCB Received On': { type: 'date' }, 'CCB Attached in CRS On': { type: 'date' }, 'FSD Received On': { type: 'date' }, 'FSD Approved On': { type: 'date' }, 'Received for UAT': { type: 'date' }, 'Actual Testing & Approval': { type: 'date' }, 'SRF Close': { type: 'date' } });

  // Kaizen sheet
  const wsK = wb.addWorksheet('Kaizen');
  const kaizenCols = ['Project id', 'Kaizen Id', 'Title', 'Uploaded On', 'Approved by L+1', 'Approved by L+2', 'Grade'];
  const kaizenRowsData = (stateSnapshot.kaizens || []).map(k => [k.ProjectID, k.ID, k.Title, k.UploadedOn || '', k.ApprovedL1 || '', k.ApprovedL2 || '', k.Grade || 'L1']);
  styleWS(wsK, 'KaizenTable', kaizenCols, kaizenRowsData, { 'Uploaded On': { type: 'date' }, 'Approved by L+1': { type: 'date' }, 'Approved by L+2': { type: 'date' } });

  return wb.xlsx.writeBuffer();
}

/* ============================================================
   5. PROJECT ROLLUPS
   ============================================================ */
function performProjectRollups(projId, currentTasks, currentProjects, currentSrfs) {
  currentSrfs = currentSrfs || state.srfs;
  const projTasks = currentTasks.filter(t => t.ProjectID === projId);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const taskIds = projTasks.map(t => t.ID);
  const isLeaf = (id) => !taskIds.some(otherId => otherId.startsWith(id + '.'));

  // Calculate status, progress, delay for leaf tasks
  projTasks.forEach(t => {
    if (isLeaf(t.ID)) {
      // Ensure ActualStartDate is set if progress exists
      if (!t.ActualStartDate && (t.Progress > 0 || t.Status === 'in-progress' || t.ActualEndDate)) {
        t.ActualStartDate = t.PlannedStartDate || todayStr;
      }

      let status = 'not-started';
      let progress = t.Progress || 0;

      if (t.ActualEndDate) {
        status = 'completed';
        progress = 100;
      } else if (t.ActualStartDate) {
        status = 'in-progress';
        if (t.PlannedStartDate && t.PlannedEndDate) {
          const totalDays = Math.max(0, Math.round((new Date(t.PlannedEndDate) - new Date(t.PlannedStartDate)) / 86400000));
          const daysSpent = Math.max(0, Math.round((today - new Date(t.ActualStartDate)) / 86400000));
          if (totalDays > 0) {
            progress = Math.min(95, Math.max(10, Math.round((daysSpent / totalDays) * 100)));
          } else {
            progress = 50;
          }
        } else {
          progress = Math.max(50, progress);
        }
      } else {
        progress = 0;
      }

      let daysDelayed = 0;
      if (t.ActualEndDate && t.PlannedEndDate && new Date(t.ActualEndDate) > new Date(t.PlannedEndDate)) {
        daysDelayed = Math.max(0, Math.round((new Date(t.ActualEndDate) - new Date(t.PlannedEndDate)) / 86400000));
      } else if (!t.ActualEndDate && t.PlannedEndDate && today > new Date(t.PlannedEndDate)) {
        daysDelayed = Math.max(0, Math.round((today - new Date(t.PlannedEndDate)) / 86400000));
      }

      if (daysDelayed > 0) {
        status = 'delayed';
        t.DaysDelayed = daysDelayed;
        if (!t.DelayReason) t.DelayReason = 'Operational bottlenecks and resource allocation delays.';
        if (!t.DelayImpact) t.DelayImpact = 'Pushed back downstream task completions.';
        if (!t.DelayReportedBy) t.DelayReportedBy = t.Assignee || 'Project Manager';
      } else {
        t.DaysDelayed = 0;
      }

      t.Status = status;
      t.Progress = progress;
    }
  });

  // Roll up to parent tasks (bottom-up)
  const sortedTasks = [...projTasks].sort((a, b) => {
    return String(b.ID).split('.').length - String(a.ID).split('.').length;
  });

  sortedTasks.forEach(parent => {
    const children = projTasks.filter(child => {
      const pp = String(parent.ID).split('.');
      const cp = String(child.ID).split('.');
      if (cp.length === pp.length + 1) {
        return cp.slice(0, pp.length).join('.') === parent.ID;
      }
      return false;
    });
    if (children.length > 0) {
      const startDates = children.map(c => c.PlannedStartDate).filter(Boolean).map(d => new Date(d));
      const endDates = children.map(c => c.PlannedEndDate).filter(Boolean).map(d => new Date(d));
      if (startDates.length > 0) {
        parent.PlannedStartDate = new Date(Math.min(...startDates)).toISOString().split('T')[0];
      }
      if (endDates.length > 0) {
        parent.PlannedEndDate = new Date(Math.max(...endDates)).toISOString().split('T')[0];
      }
      const totalProgress = children.reduce((s, c) => s + (c.Progress || 0), 0);
      parent.Progress = Math.round(totalProgress / children.length);
      if (parent.Progress === 100) {
        parent.Status = 'completed';
        if (!parent.ActualEndDate) {
          const childrenEnds = children.map(c => c.ActualEndDate).filter(Boolean);
          parent.ActualEndDate = childrenEnds.length > 0 ? childrenEnds.sort().reverse()[0] : todayStr;
        }
        if (!parent.ActualStartDate) {
          const childrenStarts = children.map(c => c.ActualStartDate).filter(Boolean);
          parent.ActualStartDate = childrenStarts.length > 0 ? childrenStarts.sort()[0] : todayStr;
        }
      } else {
        parent.ActualEndDate = '';
        if (parent.Progress > 0) {
          parent.Status = 'in-progress';
          if (!parent.ActualStartDate) {
            const childrenStarts = children.map(c => c.ActualStartDate).filter(Boolean);
            parent.ActualStartDate = childrenStarts.length > 0 ? childrenStarts.sort()[0] : todayStr;
          }
        } else {
          parent.Status = 'not-started';
          parent.ActualStartDate = '';
        }
      }

      const maxChildDelay = children.reduce((max, c) => Math.max(max, c.DaysDelayed || 0), 0);
      parent.DaysDelayed = maxChildDelay;
      if (maxChildDelay > 0) parent.Status = 'delayed';

      if (children.some(c => c.Status === 'blocked')) parent.Status = 'blocked';
    }
  });

  const updatedProjects = currentProjects.map(p => {
    if (p.ID !== projId) return p;

    // Rule 1: Identify Leaf Tasks
    const leafTasks = projTasks.filter(t => isLeaf(t.ID));

    // Rule 4: Project Progress = (Sum of Progress of all Leaf Tasks) / (Number of Leaf Tasks)
    let calculatedProgress = p.Progress;
    if (leafTasks.length > 0) {
      calculatedProgress = Math.round(leafTasks.reduce((s, t) => s + (t.Progress || 0), 0) / leafTasks.length);
    } else if (projTasks.length > 0) {
      calculatedProgress = 0;
    }

    const plannedEnd = p.PlannedEndDate ? new Date(p.PlannedEndDate) : null;
    let projectDelayDays = 0;
    if (!p.ActualEndDate && plannedEnd && today > plannedEnd && calculatedProgress < 100) {
      projectDelayDays = Math.max(0, Math.round((today - plannedEnd) / 86400000));
    }

    const rootTasks = projTasks.filter(t => !String(t.ID).includes('.'));
    const targetTasks = rootTasks.length > 0 ? rootTasks : projTasks;
    const maxTaskDelay = targetTasks.reduce((max, t) => Math.max(max, t.DaysDelayed || 0), 0);
    const finalDelayDays = Math.max(projectDelayDays, maxTaskDelay);

    let status = p.Status;
    // Project is complete if all leaf tasks are complete
    const allTasksCompleted = leafTasks.length > 0 && leafTasks.every(t => !!t.ActualEndDate);
    if (allTasksCompleted || (projTasks.length === 0 && p.ActualEndDate)) {
      status = 'completed';
    } else {
      if (status === 'completed') status = 'on-track';
      if (finalDelayDays > 0) status = 'delayed';
      else if (status !== 'at-risk') status = 'on-track';
    }

    const linkedSRFs = currentSrfs.filter(s => s.ProjectID === projId);
    const totalSRFCost = linkedSRFs.reduce((s, sr) => s + (sr.Cost || 0), 0);
    const baseSpent = p.BaseSpent !== undefined ? p.BaseSpent : (p.Spent || 0);
    const finalSpent = baseSpent + totalSRFCost;

    return { ...p, Progress: calculatedProgress, Spent: finalSpent, DaysDelayed: finalDelayDays, Status: status };
  });

  return { updatedTasks: currentTasks, updatedProjects };
}

function initBaseSpent() {
  state.projects.forEach(p => {
    const projectSRFs = state.srfs.filter(s => s.ProjectID === p.ID);
    const totalSRFCost = projectSRFs.reduce((sum, sr) => sum + (sr.Cost || 0), 0);
    p.BaseSpent = Math.max(0, (p.Spent || 0) - totalSRFCost);
  });
}

function recalculateAll() {
  state.projects.forEach(p => {
    const { updatedTasks, updatedProjects } = performProjectRollups(p.ID, state.tasks, state.projects, state.srfs);
    state.tasks = updatedTasks;
    state.projects = updatedProjects;
  });
}

/* ============================================================
   6. API / DATA LOADING
   ============================================================ */
async function initDatabase() {
  state.isLoading = true;
  render();
  try {
    const response = await fetch('/api/load-database');
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const parsed = parseExcelBuffer(arrayBuffer);
      state.projects = parsed.projects || [];
      state.tasks = parsed.tasks || [];
      state.teamMembers = parsed.teamMembers || [];
      state.srfs = parsed.srfs || [];
      state.kaizens = parsed.kaizens || [];
      initBaseSpent();
      recalculateAll();
      state.currentView = state.projects.length > 0 ? 'dashboard' : 'empty';
    } else {
      const fallback = localStorage.getItem('tracker_state');
      if (fallback) {
        const parsed = JSON.parse(fallback);
        state.projects = parsed.projects || [];
        state.tasks = parsed.tasks || [];
        state.teamMembers = parsed.teamMembers || [];
        state.srfs = parsed.srfs || [];
        state.kaizens = parsed.kaizens || [];
        initBaseSpent();
        recalculateAll();
        state.currentView = state.projects.length > 0 ? 'dashboard' : 'empty';
        showToast('Loaded database from local cache', 'info');
      } else {
        state.currentView = 'empty';
      }
    }
  } catch (err) {
    console.error('Init error:', err);
    const fallback = localStorage.getItem('tracker_state');
    if (fallback) {
      try {
        const parsed = JSON.parse(fallback);
        state.projects = parsed.projects || [];
        state.tasks = parsed.tasks || [];
        state.teamMembers = parsed.teamMembers || [];
        state.srfs = parsed.srfs || [];
        state.kaizens = parsed.kaizens || [];
        initBaseSpent();
        recalculateAll();
        state.currentView = state.projects.length > 0 ? 'dashboard' : 'empty';
        showToast('Loaded from local cache (offline mode)', 'info');
      } catch { }
    } else {
      state.currentView = 'empty';
    }
  } finally {
    state.isLoading = false;
    render();
  }
}

async function saveStateToServer(projects, tasks, teamMembers, srfs, kaizens = state.kaizens) {
  const snap = { projects, tasks, teamMembers, srfs, kaizens };
  localStorage.setItem('tracker_state', JSON.stringify(snap));
  try {
    const excelBuffer = await exportExcelWorkbook(snap);
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64data = reader.result.split(',')[1];
      try {
        const res = await fetch('/api/save-database', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64data })
        });
        if (res.ok) showToast('Autosaved to database.xlsx');
      } catch (e) { console.warn('Autosave fetch failed:', e); }
    };
  } catch (err) { console.error('Failed to generate workbook:', err); }
}

/* ============================================================
   7. TOAST
   ============================================================ */
let _toastTimer = null;
function showToast(message, type = 'success') {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.className = `toast visible ${type}`;
  el.innerHTML = `${svgIcon(type === 'error' ? 'alert-circle' : 'check-circle-2')} <span>${escHtml(message)}</span>`;
  lucide.createIcons({ nodes: [el] });
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

/* ============================================================
   8. THEME
   ============================================================ */
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
  localStorage.setItem('tracker_theme', state.theme);
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.innerHTML = svgIcon(state.theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons({ nodes: [btn] });
  }
}

/* ============================================================
   9. NAVIGATION
   ============================================================ */
function navigateTo(view, projectId = null) {
  state.currentView = view;
  if (projectId !== null) state.activeProjectId = projectId;
  if (view === 'workspace') {
    state.workspaceTab = 'overview';
    state.taskAssigneeFilter = '';
    state.selectedSRFIndex = 0;
  }
  render();
}

function updateNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const v = btn.dataset.view;
    const isSelected = state.currentView === v || (v === 'projects' && state.currentView === 'workspace');
    btn.classList.toggle('active', isSelected);
  });

  const noData = state.projects.length === 0;
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    const v = btn.dataset.view;
    if (v !== 'empty') btn.disabled = noData;
  });

  // Update header title
  const header = document.getElementById('main-header-title');
  if (header) {
    const titles = {
      dashboard: 'Analytical Dashboard',
      projects: 'Project Registry',
      workspace: 'Project Workspace Control',
      team: 'Team Workloads Index',
      empty: 'Database Setup'
    };
    header.textContent = titles[state.currentView] || '';
  }

  // Show/hide create project btn & department filter dropdown
  const createBtn = document.getElementById('create-project-btn');
  const deptSelect = document.getElementById('header-dept-filter');
  const show = state.projects.length > 0 && state.currentView !== 'workspace';
  
  if (createBtn) {
    createBtn.style.display = show ? 'inline-flex' : 'none';
  }
  
  if (deptSelect) {
    deptSelect.style.display = show ? 'inline-block' : 'none';
    if (show) {
      const departments = [...new Set(state.projects.map(p => p.Department).filter(Boolean))].sort();
      let options = '<option value="">All Departments</option>';
      departments.forEach(d => {
        options += `<option value="${escHtml(d)}" ${state.selectedDept === d ? 'selected' : ''}>${escHtml(d)}</option>`;
      });
      deptSelect.innerHTML = options;
    }
  }
}

/* ============================================================
   10. MAIN RENDER
   ============================================================ */
function render() {
  updateNav();
  const container = document.getElementById('view-container');
  if (!container) return;

  if (state.isLoading) {
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <span style="color:var(--text-muted);font-size:12px;font-weight:500">Mounting workspace spreadsheet...</span>
      </div>`;
    return;
  }

  switch (state.currentView) {
    case 'dashboard': renderDashboard(container); break;
    case 'projects': renderProjects(container); break;
    case 'workspace': renderWorkspace(container); break;
    case 'team': renderTeam(container); break;
    case 'empty':
    default: renderEmpty(container); break;
  }

  lucide.createIcons();
  setupViewEvents();
}

/* ============================================================
   11. DASHBOARD
   ============================================================ */
function renderDashboard(container) {
  const dp = state.selectedDept ? state.projects.filter(p => p.Department === state.selectedDept) : state.projects;
  const total = dp.length;
  const completed = dp.filter(p => p.Status === 'completed').length;
  const active = dp.filter(p => p.Status !== 'completed').length;
  const projectIds = new Set(dp.map(p => p.ID));
  const kaizenCount = state.kaizens.filter(k => projectIds.has(k.ProjectID)).length;
  const sc = {
    completed,
    'on-track': dp.filter(p => p.Status === 'on-track').length,
    delayed: dp.filter(p => p.Status === 'delayed').length,
    'at-risk': dp.filter(p => p.Status === 'at-risk').length
  };

  // Benefits
  let totalFinancial = 0, totalManDays = 0;
  dp.forEach(p => {
    const parsed = parseBenefits(p.Benefits);
    if (parsed.type === 'cost') totalFinancial += parsed.value;
    else if (parsed.type === 'mandays') totalManDays += parsed.value;
  });
  const convertedMD = totalManDays * 2500;
  const displaySavings = state.benefitsConverted ? totalFinancial + convertedMD : totalFinancial;
  const displayMD = state.benefitsConverted ? 0 : totalManDays;

  // Department counts
  const deptCounts = {};
  state.projects.forEach(p => {
    const d = p.Department || 'Steel';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  });
  const deptList = Object.keys(deptCounts).sort((a, b) => deptCounts[b] - deptCounts[a]);

  const maxCount = Math.max(...Object.values(deptCounts), 1);
  
  // Y-axis gridlines & ticks
  const yTicks = [maxCount, Math.round(maxCount * 0.75), Math.round(maxCount * 0.5), Math.round(maxCount * 0.25), 0];
  const yAxisHTML = yTicks.map(val => `<div style="display:flex;align-items:center;height:0;position:relative;width:100%">
    <span style="position:absolute;right:100%;margin-right:8px;font-size:9px;color:var(--text-dim);font-weight:700">${val}</span>
    <div style="flex-grow:1;border-top:1px dashed rgba(255,255,255,0.06);width:100%"></div>
  </div>`).join('');

  // Vertical Bars
  const deptChartHTML = deptList.map(dept => {
    const count = deptCounts[dept];
    const pct = Math.round((count / maxCount) * 100);
    const isActive = state.selectedDept === dept;
    const barBg = isActive ? '#ec4899' : '#6366f1';
    const shadow = isActive ? '0 4px 12px rgba(236, 72, 153, 0.4)' : '0 2px 8px rgba(99, 102, 241, 0.15)';
    const border = isActive ? '1px solid #f472b6' : '1px solid #818cf8';
    
    return `<div class="dept-vertical-bar-col" data-dept="${escHtml(dept)}" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;height:100%;justify-content:end;min-width:40px">
      <div style="width:20px;height:${pct}%;background:${barBg};border:${border};border-bottom:none;border-radius:4px 4px 0 0;position:relative;transition:all 0.3s ease;display:flex;align-items:start;justify-content:center;box-shadow:${shadow}" class="dept-bar-hover">
        <span class="dept-bar-tooltip" style="position:absolute;bottom:100%;background:var(--slate-950);border:1px solid var(--slate-850);padding:2px 6px;border-radius:4px;font-size:9px;color:white;font-weight:700;margin-bottom:4px;opacity:0;transition:opacity 0.2s;white-space:nowrap;pointer-events:none;z-index:10">${count} proj</span>
      </div>
    </div>`;
  }).join('');

  // X-Axis Labels Row HTML (Perfect Center Alignment - Vertical)
  const deptChartLabelsHTML = deptList.map(dept => {
    const isActive = state.selectedDept === dept;
    return `<div class="dept-vertical-bar-col" data-dept="${escHtml(dept)}" style="display:flex;flex-direction:column;align-items:center;flex:1;cursor:pointer;min-width:40px;height:100%;position:relative">
      <div style="font-size:9px;color:${isActive ? 'white' : 'var(--text-dim)'};font-weight:700;margin-top:8px;text-transform:capitalize;white-space:nowrap;transform:rotate(90deg);transform-origin:left center;position:absolute;top:0;left:50%;margin-left:-4px" title="${escHtml(dept)}">${escHtml(dept)}</div>
    </div>`;
  }).join('');

  // Donut SVG
  const donutSVG = buildDonutSVG(sc, total);

  // SRF Cost Overview computations
  const srfFilteredProjects = state.selectedDept ? state.projects.filter(p => p.Department === state.selectedDept) : state.projects;
  const srfFilteredProjIds = new Set(srfFilteredProjects.map(p => p.ID));
  const srfFiltered = state.srfs.filter(s => srfFilteredProjIds.has(s.ProjectID));
  const srfTotalCost = srfFiltered.reduce((s, sr) => s + (sr.Cost || 0), 0);

  const srfRows = srfFiltered.map(s => {
    const proj = state.projects.find(p => p.ID === s.ProjectID);
    const projName = proj ? proj.Name : 'Unknown Project';
    return `<div class="srf-list-row">
      <div class="min-w-0 flex-1">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;font-weight:700;color:var(--brand-300);background:rgba(129,0,85,0.15);padding:2px 6px;border-radius:4px">${escHtml(s.SRFNo)}</span>
          <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px" title="${escHtml(projName)}">${escHtml(projName)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(s.Developments)}">${escHtml(s.Developments || 'No developments scope logged.')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:24px;flex-shrink:0">
        <div style="font-size:11px;color:var(--text-dim);text-align:right">
          <div><strong style="color:var(--text-secondary)">${s.MandaysFC || 0}</strong> Functional</div>
          <div><strong style="color:var(--text-secondary)">${s.MandaysTC || 0}</strong> Technical</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--rose-400);min-width:90px;text-align:right">${escHtml(formatCurrency(s.Cost || 0))}</div>
      </div>
    </div>`;
  }).join('') || `<div class="text-center py-12 text-dim" style="font-size:12px">No SRF contracts belong to this department filter.</div>`;

  // Benefits breakdown
  const benefitRows = dp.filter(p => p.Benefits).map(p => {
    const parsed = parseBenefits(p.Benefits);
    let badgeText = escHtml(p.Benefits);
    let badgeClass = 'badge';
    if (parsed.type === 'cost') { badgeText = escHtml(formatCurrency(parsed.value)); badgeClass = 'badge badge-emerald'; }
    else if (parsed.type === 'mandays') {
      badgeText = state.benefitsConverted ? escHtml(formatCurrency(parsed.value * 2500)) : `${parsed.value} Man-Days`;
      badgeClass = state.benefitsConverted ? 'badge badge-emerald' : 'badge badge-blue';
    }
    return `<div class="benefit-row" data-proj-id="${escHtml(p.ID)}">
      <div class="min-w-0 flex-1" style="padding-right:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.Name)}</div>
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-top:2px">${escHtml(p.Department)}</div>
      </div>
      <span class="${badgeClass}" style="font-size:10px;padding:2px 10px">${badgeText}</span>
    </div>`;
  }).join('') || `<div class="text-center py-8 text-dim" style="font-size:12px">No project benefits logged yet for this filter.</div>`;

  // Dept filter items
  const deptItems = deptList.map(dept => {
    const count = deptCounts[dept];
    const ratio = Math.round((count / (state.projects.length || 1)) * 100);
    const isActive = state.selectedDept === dept;
    return `<div class="dept-item ${isActive ? 'active' : ''}" data-dept="${escHtml(dept)}">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600">
        <span style="text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px" title="${escHtml(dept)}">${escHtml(dept)}</span>
        <span style="font-size:10px;background:var(--slate-950);padding:2px 6px;border-radius:4px;border:1px solid var(--slate-850);color:var(--text-secondary);font-weight:700">${count} proj</span>
      </div>
      <div class="dept-bar-track"><div class="dept-bar-fill" style="width:${ratio}%"></div></div>
    </div>`;
  }).join('');

  // Project list rows
  const projRows = dp.map(p => {
    const progressFill = p.Status === 'completed' ? 'var(--brand-500)' : p.Status === 'delayed' ? 'var(--amber-500)' : p.Status === 'at-risk' ? 'var(--rose-500)' : 'var(--emerald-500)';
    return `<div class="project-list-row" data-proj-id="${escHtml(p.ID)}">
      <div class="min-w-0 flex-1">
        <div class="proj-name" style="font-size:12px;font-weight:700;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.2s">${escHtml(p.Name)}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px;text-transform:capitalize">PM: ${escHtml(p.ProjectManager || 'Unassigned')} • ${escHtml(p.Department)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-shrink:0">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span style="font-size:10px;color:var(--text-muted)">Progress: <span style="font-weight:700;color:white">${p.Progress || 0}%</span></span>
          <div class="progress-track h-1" style="width:80px"><div class="progress-fill" style="height:100%;border-radius:999px;background:${progressFill};width:${p.Progress || 0}%"></div></div>
        </div>
      </div>
    </div>`;
  }).join('') || `<div class="text-center py-12 text-dim" style="font-size:12px">No projects belong to this department.</div>`;

  container.innerHTML = `
  <div class="space-y-6 animate-fade-in">
    
    ${state.selectedDept ? `
    <div class="filter-banner">
      <span style="display:flex;align-items:center;gap:8px">
        ${svgIcon('building-2', 'w-4 h-4')}
        Active Filter: <strong style="text-transform:capitalize;margin-left:4px">${escHtml(state.selectedDept)}</strong>&nbsp;Department (${total} projects)
      </span>
      <button id="clear-dept-filter" style="padding:4px 10px;background:rgba(129,0,85,0.2);color:var(--brand-300);font-weight:700;border-radius:8px;border:1px solid rgba(129,0,85,0.3);cursor:pointer;font-size:11px;transition:all 0.2s">Clear Filter</button>
    </div>` : ''}

    <!-- KPI Row -->
    <div class="grid grid-4">
      <div class="glass-card kpi-card border-brand" style="border-radius:var(--r-2xl)">
        <div class="kpi-icon brand">${svgIcon('folder-kanban')}</div>
        <div><div class="kpi-label">Total Projects</div><div class="kpi-value">${total}</div></div>
      </div>
      <div class="glass-card kpi-card border-amber" style="border-radius:var(--r-2xl)">
        <div class="kpi-icon amber">${svgIcon('play')}</div>
        <div><div class="kpi-label">Active Projects</div><div class="kpi-value">${active}</div></div>
      </div>
      <div class="glass-card kpi-card border-emerald" style="border-radius:var(--r-2xl)">
        <div class="kpi-icon emerald">${svgIcon('check-circle-2')}</div>
        <div><div class="kpi-label">Completed Projects</div><div class="kpi-value">${completed}</div></div>
      </div>
      <div class="glass-card kpi-card border-yellow" style="border-radius:var(--r-2xl)">
        <div class="kpi-icon yellow">${svgIcon('award')}</div>
        <div><div class="kpi-label">Kaizen Counts</div><div class="kpi-value">${kaizenCount}</div></div>
      </div>
    </div>

    <!-- Health + Benefits Row -->
    <div class="grid grid-12">
      <!-- Portfolio Health -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-350 col-span-5" style="border:1px solid var(--slate-900)">
        <div>
          <h3 class="panel-title mb-6"><span class="dot"></span> Project Portfolio Health</h3>
          <div class="donut-wrap">
            <div class="donut-container">${donutSVG}
              <div class="donut-center">
                <span class="count">${total}</span>
                <span class="label">Projects</span>
              </div>
            </div>
          </div>
        </div>
        <div class="legend-grid">
          <div class="legend-item text-emerald"><span class="legend-dot" style="background:var(--emerald-500)"></span>On Track (${sc['on-track']})</div>
          <div class="legend-item text-blue"><span class="legend-dot" style="background:var(--brand-500)"></span>Completed (${sc.completed})</div>
          <div class="legend-item" style="color:var(--amber-400)"><span class="legend-dot" style="background:var(--amber-500)"></span>Delayed (${sc.delayed})</div>
          <div class="legend-item" style="color:var(--rose-400)"><span class="legend-dot" style="background:var(--rose-500)"></span>At Risk (${sc['at-risk']})</div>
        </div>
      </div>

      <!-- Benefits Widget -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-350 col-span-7" style="border:1px solid var(--slate-900)">
        <div class="space-y-4 w-full">
          <h3 class="panel-title">
            ${svgIcon('trending-up')} Project Benefits &amp; Savings
          </h3>
          <div class="benefit-kpi-grid">
            <div class="benefit-kpi-card ${state.benefitsConverted ? 'active-emerald' : 'inactive'}" id="btn-convert-financial" title="Convert man-days to INR">
              <div class="benefit-kpi-icon ${state.benefitsConverted ? 'emerald' : 'muted'}">${svgIcon('indian-rupee')}</div>
              <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;color:var(--text-muted)">Financial Savings</div>
                <div class="kpi-val" style="font-size:15px;font-weight:700;color:white;margin-top:2px">${escHtml(formatCurrency(displaySavings))}</div>
              </div>
            </div>
            <div class="benefit-kpi-card ${!state.benefitsConverted ? 'active-brand' : 'inactive'}" id="btn-show-mandays" title="Show original man-days">
              <div class="benefit-kpi-icon ${!state.benefitsConverted ? 'brand' : 'muted'}">${svgIcon('calendar-days')}</div>
              <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;color:var(--text-muted)">Man-Days Saved</div>
                <div class="kpi-val" style="font-size:15px;font-weight:700;color:white;margin-top:2px">${displayMD} Days</div>
              </div>
            </div>
          </div>
          <div class="benefit-breakdown">${benefitRows}</div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid var(--slate-900);width:100%">
          * Click cards above to toggle conversion.
        </div>
      </div>
    </div>

    <!-- Dept Filter + Project List Row -->
    <div class="grid grid-12">
      <!-- Departments Chart -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-420 col-span-4" style="border:1px solid var(--slate-900)">
        <div class="space-y-4 flex-1 flex flex-col">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 class="panel-title">${svgIcon('bar-chart-3')} Department Analytics</h3>
            ${state.selectedDept ? `<button id="clear-dept-filter2" style="font-size:12px;color:var(--brand-300);font-weight:700;background:none;border:none;cursor:pointer">Clear</button>` : ''}
          </div>
          
          <!-- Vertical Bar Chart Area -->
          <div style="display:flex;flex-direction:column;flex:1;margin:20px auto 0;width:80%;height:260px;" class="hide-scrollbar">
            <!-- Bars & Gridlines Container -->
            <div style="display:flex;position:relative;height:150px;width:100%">
              <!-- Y-Axis Solid Line -->
              <div style="position:absolute;left:0;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.15);z-index:5">
                <span style="position:absolute;bottom:100%;left:-20px;font-size:8px;color:var(--text-muted);font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Count</span>
              </div>
              <!-- Y-Axis Gridlines -->
              <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none">
                ${yAxisHTML}
              </div>
              <!-- Bars Flex Row -->
              <div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;justify-content:space-around;align-items:end;height:100%;padding:0 8px">
                ${deptChartHTML}
              </div>
            </div>
            <!-- X-Axis Labels Row -->
            <div style="display:flex;justify-content:space-around;height:100px;padding:0 8px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.15);position:relative">
              ${deptChartLabelsHTML}
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid var(--slate-900)">
          Click bars to filter active views &amp; projects
        </div>
      </div>

      <!-- Projects List -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-420 col-span-8" style="border:1px solid var(--slate-900)">
        <div class="space-y-4 flex-1 flex flex-col">
          <h3 class="panel-title">
            ${svgIcon('folder-kanban')}
            ${state.selectedDept ? `Projects in <span style="color:var(--brand-300);text-transform:capitalize;margin-left:4px">${escHtml(state.selectedDept)}</span>` : 'All Active Projects Registry'}
          </h3>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:310px;overflow-y:auto;padding-right:4px">${projRows}</div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid var(--slate-900)">
          Click on any project card to open its workspace
        </div>
      </div>
    </div>

    <!-- SRF Cost Overview Row -->
    <div class="grid grid-12">
      <!-- SRF Total Cost Widget -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-350 col-span-4" style="border:1px solid var(--slate-900); background: var(--slate-950);">
        <div>
          <h3 class="panel-title" style="margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--rose-400); display: flex; align-items: center;">${svgIcon('credit-card', 'w-4 h-4')}</span> 
            SRF Cost Summary
          </h3>
          
          <!-- Highlighted Total Cost Circle (Solid Background) -->
          <div style="width: 220px; height: 220px; border-radius: 50%; background: #120911; border: 2px solid #f43f5e; box-shadow: 0 4px 15px rgba(244, 63, 94, 0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 8px auto 0; text-align: center; padding: 20px;">
            <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">Total SRF Investment</div>
            <div style="font-size: 28px; font-weight: 800; color: white; margin-top: 8px; letter-spacing: -0.02em; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span style="color: var(--rose-400); font-weight: 400; font-size: 20px;">₹</span>${escHtml(formatCurrency(srfTotalCost).replace('₹', '').replace('Rs.', '').trim())}
            </div>
          </div>
        </div>
        
        <div style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--slate-900)">
          Sum of linked SRFs (filtered by department)
        </div>
      </div>

      <!-- SRF List -->
      <div class="glass-panel rounded-2xl p-6 flex flex-col justify-between min-h-350 col-span-8" style="border:1px solid var(--slate-900)">
        <div class="space-y-4 flex-1 flex flex-col">
          <h3 class="panel-title">
            ${svgIcon('file-spreadsheet')}
            ${state.selectedDept ? `SRF Registry in <span style="color:var(--brand-300);text-transform:capitalize;margin-left:4px">${escHtml(state.selectedDept)}</span>` : 'All Linked SRF Registry'}
          </h3>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;padding-right:4px">${srfRows}</div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid var(--slate-900)">
          Lists linked contract deliverables, cost, and manday profiles
        </div>
      </div>
    </div>

  </div>`;
}

function updateBenefitsUI(converted) {
  state.benefitsConverted = converted;
  const btnFinancial = document.getElementById('btn-convert-financial');
  const btnMandays = document.getElementById('btn-show-mandays');
  if (!btnFinancial || !btnMandays) return;

  const dp = state.selectedDept ? state.projects.filter(p => p.Department === state.selectedDept) : state.projects;
  let totalFinancial = 0, totalManDays = 0;
  dp.forEach(p => {
    const parsed = parseBenefits(p.Benefits);
    if (parsed.type === 'cost') totalFinancial += parsed.value;
    else if (parsed.type === 'mandays') totalManDays += parsed.value;
  });
  const convertedMD = totalManDays * 2500;
  const displaySavings = converted ? totalFinancial + convertedMD : totalFinancial;
  const displayMD = converted ? 0 : totalManDays;

  // Pulse animation trigger
  const activeCard = converted ? btnFinancial : btnMandays;
  activeCard.classList.remove('pulse-effect');
  void activeCard.offsetWidth; // trigger reflow
  activeCard.classList.add('pulse-effect');
  setTimeout(() => activeCard.classList.remove('pulse-effect'), 400);

  // Toggle active/inactive classes
  if (converted) {
    btnFinancial.classList.add('active-emerald');
    btnFinancial.classList.remove('inactive');
    btnFinancial.querySelector('.benefit-kpi-icon').classList.add('emerald');
    btnFinancial.querySelector('.benefit-kpi-icon').classList.remove('muted');

    btnMandays.classList.add('inactive');
    btnMandays.classList.remove('active-brand');
    btnMandays.querySelector('.benefit-kpi-icon').classList.add('muted');
    btnMandays.querySelector('.benefit-kpi-icon').classList.remove('brand');
  } else {
    btnFinancial.classList.add('inactive');
    btnFinancial.classList.remove('active-emerald');
    btnFinancial.querySelector('.benefit-kpi-icon').classList.add('muted');
    btnFinancial.querySelector('.benefit-kpi-icon').classList.remove('emerald');

    btnMandays.classList.add('active-brand');
    btnMandays.classList.remove('inactive');
    btnMandays.querySelector('.benefit-kpi-icon').classList.add('brand');
    btnMandays.querySelector('.benefit-kpi-icon').classList.remove('muted');
  }

  // Update text values
  btnFinancial.querySelector('.kpi-val').innerHTML = escHtml(formatCurrency(displaySavings));
  btnMandays.querySelector('.kpi-val').innerHTML = `${displayMD} Days`;

  // Update the breakdown
  const breakdown = document.querySelector('.benefit-breakdown');
  if (breakdown) {
    const benefitRows = dp.filter(p => p.Benefits).map(p => {
      const parsed = parseBenefits(p.Benefits);
      let badgeText = escHtml(p.Benefits);
      let badgeClass = 'badge';
      if (parsed.type === 'cost') {
        badgeText = escHtml(formatCurrency(parsed.value));
        badgeClass = 'badge badge-emerald';
      } else if (parsed.type === 'mandays') {
        badgeText = converted ? escHtml(formatCurrency(parsed.value * 2500)) : `${parsed.value} Man-Days`;
        badgeClass = converted ? 'badge badge-emerald' : 'badge badge-blue';
      }
      return `<div class="benefit-row" data-proj-id="${escHtml(p.ID)}">
        <div class="min-w-0 flex-1" style="padding-right:12px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(p.Name)}</div>
          <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.05em;margin-top:2px">${escHtml(p.Department)}</div>
        </div>
        <span class="${badgeClass}" style="font-size:10px;padding:2px 10px">${badgeText}</span>
      </div>`;
    }).join('') || `<div class="text-center py-8 text-dim" style="font-size:12px">No project benefits logged yet for this filter.</div>`;
    breakdown.innerHTML = benefitRows;

    breakdown.querySelectorAll('.benefit-row').forEach(el => {
      el.addEventListener('click', () => navigateTo('workspace', el.dataset.projId));
    });
  }
}

function buildDonutSVG(sc, total) {
  if (total === 0) {
    return `<svg class="w-full h-full" viewBox="0 0 36 36" style="transform:rotate(-90deg)">
      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#1c0617" stroke-width="3"/>
    </svg>`;
  }
  let offset = 0;
  const segments = [
    { count: sc.completed, color: '#810055' },
    { count: sc['on-track'], color: '#10b981' },
    { count: sc.delayed, color: '#f59e0b' },
    { count: sc['at-risk'], color: '#f43f5e' },
  ];
  let paths = `<circle cx="18" cy="18" r="15.915" fill="none" stroke="#111827" stroke-width="3"/>`;
  segments.forEach(seg => {
    if (seg.count <= 0) return;
    const pct = (seg.count / total) * 100;
    paths += `<circle cx="18" cy="18" r="15.915" fill="none" stroke="${seg.color}" stroke-width="3.5"
      stroke-dasharray="${pct} ${100 - pct}"
      stroke-dashoffset="${-offset}"/>`;
    offset += pct;
  });
  return `<svg class="w-full h-full" viewBox="0 0 36 36" style="transform:rotate(-90deg)">${paths}</svg>`;
}

/* ============================================================
   12. PROJECTS PAGE
   ============================================================ */
function getFilteredProjectsList() {
  return state.projects.filter(p => {
    const q = state.projectSearch.toLowerCase();
    const matchQ = p.Name.toLowerCase().includes(q) || p.Description.toLowerCase().includes(q) ||
      (p.ProjectManager && p.ProjectManager.toLowerCase().includes(q)) || p.Department.toLowerCase().includes(q);
    const matchDept = state.projectDeptFilter ? p.Department === state.projectDeptFilter : true;
    const matchStatus = state.projectStatusFilter ? p.Status === state.projectStatusFilter : true;
    return matchQ && matchDept && matchStatus;
  }).sort((a, b) => {
    if (state.projectSortBy === 'name') return a.Name.localeCompare(b.Name);
    if (state.projectSortBy === 'date') {
      const dA = a.PlannedStartDate ? new Date(a.PlannedStartDate) : new Date(0);
      const dB = b.PlannedStartDate ? new Date(b.PlannedStartDate) : new Date(0);
      return dB - dA;
    }
    if (state.projectSortBy === 'progress') return b.Progress - a.Progress;
    if (state.projectSortBy === 'savings') return getSavingsNum(b.Benefits) - getSavingsNum(a.Benefits);
    return 0;
  });
}

function getProjectCardsHTML() {
  const filtered = getFilteredProjectsList();
  return filtered.length > 0 ? filtered.map(proj => {
    let statusText = getStatusText(proj.Status);
    let statusClass = proj.Status === 'delayed' ? 'badge-delayed' : proj.Status === 'at-risk' ? 'badge-at-risk' : proj.Status === 'completed' ? 'badge-completed' : 'badge-on-track';
    let progressColor = proj.Status === 'completed' ? 'var(--brand-500)' : proj.Status === 'delayed' ? 'var(--amber-500)' : proj.Status === 'at-risk' ? 'var(--rose-500)' : 'var(--emerald-500)';
    const initials = proj.ProjectManager ? proj.ProjectManager.charAt(0).toUpperCase() : '?';
    const projectKaizens = state.kaizens.filter(k => k.ProjectID === proj.ID);
    const hasKaizen = projectKaizens.length > 0;
    const kaizenClass = hasKaizen ? 'kaizen' : '';

    return `<div class="glass-card project-card ${kaizenClass}" data-proj-id="${escHtml(proj.ID)}" style="border-radius:var(--r-2xl)">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;gap:6px;align-items:center">
            <span style="padding:2px 8px;background:var(--slate-800);border:1px solid var(--slate-700);font-size:10px;color:var(--text-muted);border-radius:6px;font-weight:600;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${escHtml(proj.Department)}</span>
            ${hasKaizen ? `<span style="padding:2px 6px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);font-size:10px;color:#ffd700;border-radius:6px;font-weight:700;display:flex;align-items:center;gap:2px">${svgIcon('award')} Kaizen (${projectKaizens.length})</span>` : ''}
          </div>
          <span class="badge ${statusClass}">${escHtml(statusText)}</span>
        </div>
        <h3 class="project-card-name" style="font-size:14px;font-weight:700;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color 0.2s">${escHtml(proj.Name)}</h3>
        <p style="color:var(--text-muted);font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5">${escHtml(proj.Description || 'No description provided.')}</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;margin:12px 0">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px">
            <span style="color:var(--text-muted)">Project Progress</span>
            <span style="font-weight:700;color:white">${proj.Progress || 0}%</span>
          </div>
          <div class="progress-track h-2"><div class="progress-fill" style="height:100%;border-radius:999px;background:${progressColor};width:${proj.Progress || 0}%;transition:width 0.5s ease"></div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text-muted)">
          <span style="display:flex;align-items:center;gap:4px">${svgIcon('calendar')} Timeline:</span>
          <span style="font-weight:600;color:var(--text-secondary)">${formatDate(proj.PlannedStartDate)} – ${formatDate(proj.PlannedEndDate)}</span>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(59,17,48,0.6);font-size:12px">
        <div style="display:flex;align-items:center;gap:6px;color:var(--text-secondary)">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--slate-800);border:1px solid var(--slate-700);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--brand-400)">${escHtml(initials)}</div>
          <span style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px">${escHtml(proj.ProjectManager || 'Unassigned')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${proj.Benefits ? `<span style="display:flex;align-items:center;gap:4px;color:var(--emerald-400);background:rgba(16,185,129,0.1);padding:4px 8px;border-radius:6px;font-size:10px;font-weight:600;border:1px solid rgba(16,185,129,0.2);margin-left:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${svgIcon('trending-up')} ${escHtml(proj.Benefits)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('') : `<div class="col-span-3" style="text-align:center;padding:80px;background:rgba(28,6,23,0.3);border:1px dashed var(--slate-800);border-radius:var(--r-2xl)">
    ${svgIcon('folder-kanban', 'w-12 h-12')}
    <h3 style="color:white;font-size:15px;font-weight:700;margin-top:12px">No projects found</h3>
    <p style="color:var(--text-dim);font-size:12px;margin-top:4px">Adjust search queries or filters to explore other items.</p>
  </div>`;
}

function renderProjects(container) {
  const departments = [...new Set(state.projects.map(p => p.Department).filter(Boolean))];
  const cards = getProjectCardsHTML();

  container.innerHTML = `
  <div class="space-y-6 animate-fade-in">
    <div class="glass-panel rounded-2xl p-4" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center">
      <div class="search-bar">
        ${svgIcon('search')}
        <input type="text" id="proj-search" placeholder="Search projects, PMs..." value="${escHtml(state.projectSearch)}">
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px">
        <div class="filter-select-wrap">${svgIcon('filter')}
          <select id="proj-dept-filter">
            <option value="">All Departments</option>
            ${departments.map(d => `<option value="${escHtml(d)}" ${state.projectDeptFilter === d ? 'selected' : ''} style="background:var(--slate-950);text-transform:capitalize">${escHtml(d)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-select-wrap">${svgIcon('briefcase')}
          <select id="proj-status-filter">
            <option value="">All Statuses</option>
            <option value="on-track" ${state.projectStatusFilter === 'on-track' ? 'selected' : ''}>On Track</option>
            <option value="delayed" ${state.projectStatusFilter === 'delayed' ? 'selected' : ''}>On Going</option>
            <option value="at-risk" ${state.projectStatusFilter === 'at-risk' ? 'selected' : ''}>At Risk</option>
            <option value="completed" ${state.projectStatusFilter === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div class="filter-select-wrap">${svgIcon('arrow-up-down')}
          <select id="proj-sort">
            <option value="name" ${state.projectSortBy === 'name' ? 'selected' : ''}>Sort by Name</option>
            <option value="date" ${state.projectSortBy === 'date' ? 'selected' : ''}>Sort by Date</option>
            <option value="progress" ${state.projectSortBy === 'progress' ? 'selected' : ''}>Sort by Progress</option>
            <option value="savings" ${state.projectSortBy === 'savings' ? 'selected' : ''}>Sort by Savings</option>
          </select>
        </div>
        <button class="btn-ghost" id="clear-filters-btn" style="border:1px solid var(--slate-800);padding:8px 16px;border-radius:var(--r-lg);color:var(--text-secondary);font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;transition:all 0.2s">
          ${svgIcon('filter-x')} <span>Clear Filters</span>
        </button>
      </div>
    </div>
    <div class="projects-grid">${cards}</div>
  </div>`;
}

/* ============================================================
   13. WORKSPACE
   ============================================================ */
function renderWorkspace(container) {
  const project = state.projects.find(p => p.ID === state.activeProjectId);
  if (!project) { renderEmpty(container); return; }

  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID).sort((a, b) => compareTaskIds(a.ID, b.ID));
  const projectSRFs = state.srfs.filter(s => s.ProjectID === project.ID);
  const projectKaizens = state.kaizens.filter(k => k.ProjectID === project.ID);

  const tabContent = (() => {
    switch (state.workspaceTab) {
      case 'overview': return renderOverviewTab(project, projectTasks, projectSRFs);
      case 'gantt': return renderGanttTab(project, projectTasks);
      case 'tasks': return renderTasksTab(project, projectTasks);
      case 'srf': return renderSRFTab(project, projectSRFs);
      case 'kaizen': return renderKaizenTab(project, projectKaizens);
      default: return '';
    }
  })();

  container.innerHTML = `
  <div class="space-y-6 animate-fade-in">

    <!-- Workspace Header -->
    <div class="glass-panel rounded-2xl p-5" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px">
      <div style="display:flex;align-items:center;gap:16px">
        <button class="btn-icon" id="ws-back-btn" title="Back to projects">${svgIcon('arrow-left')}</button>
        <div>
          <h2 style="font-size:20px;font-weight:700;color:white;margin-bottom:6px">${escHtml(project.Name)}</h2>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);text-transform:capitalize">
            <span style="font-weight:600;color:var(--text-secondary);background:var(--slate-850);padding:2px 8px;border-radius:6px;border:1px solid var(--slate-800)">${escHtml(project.Department)}</span>
            <span>•</span>
            <span style="display:flex;align-items:center;gap:4px">${svgIcon('user')} PM: ${escHtml(project.ProjectManager || 'Unassigned')}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn-ghost" id="ws-edit-btn">${svgIcon('edit-3')} Edit Project</button>
        <button class="btn-danger" id="ws-delete-btn">${svgIcon('trash-2')} Delete</button>
      </div>
    </div>

    ${project.Description ? `
    <div class="glass-card desc-panel">
      <h4 style="font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;display:flex;align-items:center;gap:4px">${svgIcon('info', 'w-3.5 h-3.5')} Project Scope / Description</h4>
      ${escHtml(project.Description)}
    </div>` : ''}

    <!-- Tabs -->
    <div class="tab-bar">
      ${[
      { id: 'overview', label: 'Overview', icon: 'bar-chart-3' },
      { id: 'gantt', label: 'Gantt Chart', icon: 'calendar-days' },
      { id: 'tasks', label: 'Task Checklist', icon: 'list-todo', badge: projectTasks.length },
      { id: 'srf', label: 'SRF Procurement', icon: 'file-spreadsheet', badge: projectSRFs.length > 0 ? projectSRFs.length : null, badgeClass: 'srf' },
      { id: 'kaizen', label: 'Kaizen Log', icon: 'award', badge: projectKaizens.length > 0 ? projectKaizens.length : null },
    ].map(tab => `<button class="tab-btn ${state.workspaceTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
        ${svgIcon(tab.icon)} ${escHtml(tab.label)}
        ${tab.badge !== undefined && tab.badge !== null ? `<span class="tab-badge ${tab.badgeClass || ''}">${tab.badge}</span>` : ''}
      </button>`).join('')}
    </div>

    <!-- Tab Content -->
    ${tabContent}

  </div>`;
}

function renderOverviewTab(project, projectTasks, projectSRFs) {
  const taskIds = projectTasks.map(t => t.ID);
  const leafTasks = projectTasks.filter(t => !taskIds.some(otherId => otherId.startsWith(t.ID + '.')));
  const inHouseCost = leafTasks.filter(t => !String(t.Assignee).toLowerCase().includes('gitl')).reduce((s, t) => s + (t.Progress * 1500), 0);
  const gitlCost = projectSRFs.reduce((s, sr) => s + (sr.Cost || 0), 0);
  const totalSpending = inHouseCost + gitlCost;
  const totalAlloc = totalSpending || 1;
  const inHousePct = Math.round((inHouseCost / totalAlloc) * 100);
  const gitlPct = Math.round((gitlCost / totalAlloc) * 100);
  const progressColor = project.Status === 'completed' ? 'var(--brand-500)' : project.Status === 'delayed' ? 'var(--amber-500)' : 'var(--emerald-500)';

  return `<div class="grid grid-3 animate-slide-up">
    <!-- Progress Gauge -->
    <div class="glass-panel rounded-2xl p-5 flex flex-col items-center justify-between min-h-300 text-center">
      <div style="width:100%;text-align:left"><h3 style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Completion Progress</h3></div>
      <div class="donut-container" style="width:160px;height:160px;margin:12px 0">
        <svg class="w-full h-full" viewBox="0 0 36 36" style="transform:rotate(-90deg)">
          <circle cx="18" cy="18" r="16" fill="none" stroke="var(--slate-800)" stroke-width="2.5"/>
          <circle cx="18" cy="18" r="16" fill="none" stroke="${progressColor}" stroke-width="3" stroke-dasharray="${project.Progress || 0} 100" stroke-linecap="round"/>
        </svg>
        <div class="donut-center">
          <span class="count">${project.Progress || 0}%</span>
        </div>
      </div>
      <div style="width:100%;background:rgba(59,17,48,0.4);border:1px solid rgba(59,17,48,0.8);border-radius:var(--r-xl);padding:12px;font-size:12px;text-align:left;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-dim)">Leaf Activity:</span>
          <span style="color:white;font-weight:700">${leafTasks.length}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-dim)">Completed Tasks:</span>
          <span style="color:var(--emerald-400);font-weight:700">${leafTasks.filter(t => (t.Progress || 0) === 100).length}</span>
        </div>
      </div>
    </div>

    <!-- Financial Overview (Redesigned: Benefits Highlighted, Spendings Subtle) -->
    <div class="glass-panel rounded-2xl p-5 flex flex-col justify-between col-span-2 min-h-300">
      <div>
        <h3 style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px">Project Cost Study &amp; Benefits</h3>
        
        <!-- Highly Highlighted Benefits Banner (Status Removed) -->
        <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);border-radius:var(--r-xl);padding:16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <div>
            <div style="font-size:9px;color:var(--emerald-400);text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Project Benefit Output</div>
            <div style="font-size:24px;font-weight:800;color:white;margin-top:4px;display:flex;align-items:center;gap:8px">
              <span style="color:var(--emerald-400);display:flex;align-items:center">${svgIcon('trending-up', 'w-7 h-7')}</span>
              ${escHtml(project.Benefits || 'N/A')}
            </div>
          </div>
        </div>

        <!-- Subtle Spendings Panels (Redesigned Grid Cards) -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
          <div class="glass-card" style="padding:14px;border:1px solid var(--slate-850);border-radius:12px;background:rgba(28,6,23,0.3);display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(129,0,85,0.15);color:var(--brand-400);display:flex;align-items:center;justify-content:center">${svgIcon('credit-card', 'w-4 h-4')}</div>
            <div>
              <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Total Spending</div>
              <div style="font-size:14px;font-weight:800;color:white;margin-top:2px">${escHtml(formatCurrency(totalSpending))}</div>
            </div>
          </div>
          <div class="glass-card" style="padding:14px;border:1px solid var(--slate-850);border-radius:12px;background:rgba(28,6,23,0.3);display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.1);color:var(--blue-400);display:flex;align-items:center;justify-content:center">${svgIcon('users', 'w-4 h-4')}</div>
            <div>
              <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">In-House Cost</div>
              <div style="font-size:14px;font-weight:800;color:var(--text-secondary);margin-top:2px">${escHtml(formatCurrency(inHouseCost))}</div>
            </div>
          </div>
          <div class="glass-card" style="padding:14px;border:1px solid var(--slate-850);border-radius:12px;background:rgba(28,6,23,0.3);display:flex;align-items:center;gap:12px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(244,63,94,0.1);color:var(--rose-400);display:flex;align-items:center;justify-content:center">${svgIcon('file-spreadsheet', 'w-4 h-4')}</div>
            <div>
              <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;font-weight:700">GITL / SRF Cost</div>
              <div style="font-size:14px;font-weight:800;color:var(--rose-400);margin-top:2px">${escHtml(formatCurrency(gitlCost))}</div>
            </div>
          </div>
        </div>

        <!-- Allocation Breakdown Bar -->
        <div style="margin-top:18px">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:6px">
            <span>Project Resource Allocation Breakdown</span>
            <span>Total Allocated: ${escHtml(formatCurrency(inHouseCost + gitlCost))}</span>
          </div>
          <div class="allocation-bar">
            ${inHouseCost > 0 ? `<div class="allocation-segment" style="width:${inHousePct}%;background:var(--brand-500)" title="In-House: ${formatCurrency(inHouseCost)}">In-House</div>` : ''}
            ${gitlCost > 0 ? `<div class="allocation-segment" style="width:${gitlPct}%;background:var(--rose-500)" title="GITL: ${formatCurrency(gitlCost)}">GITL</div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Timelines -->
    <div class="glass-panel rounded-2xl p-5 col-span-3 space-y-4">
      <h3 style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Project Timeline Study</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div class="timeline-block">
          <div style="display:flex;align-items:center;gap:8px;font-weight:600;color:white;margin-bottom:16px">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--blue-500)"></div> Planned Schedule
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
            <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Planned Start</div><div style="color:var(--text-secondary);margin-top:2px">${formatDate(project.PlannedStartDate)}</div></div>
            <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Planned End</div><div style="color:var(--text-secondary);margin-top:2px">${formatDate(project.PlannedEndDate)}</div></div>
          </div>
        </div>
        <div class="timeline-block">
          <div style="display:flex;align-items:center;gap:8px;font-weight:600;color:white;margin-bottom:16px">
            <div style="width:10px;height:10px;border-radius:50%;background:var(--emerald-500)"></div> Actual Schedule
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
            <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Actual Start</div><div style="color:var(--text-secondary);margin-top:2px">${formatDate(project.ActualStartDate)}</div></div>
            <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Actual End</div><div style="color:var(--text-secondary);margin-top:2px">${formatDate(project.ActualEndDate)}</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function buildTimeHeaderHtml(minDate, maxDate, scale, pxPerDay) {
  const topCells = [];
  const bottomCells = [];
  const gridLines = [];

  const start = new Date(minDate);
  const end = new Date(maxDate);

  if (scale === 'day') {
    let current = new Date(start);
    let dayIndex = 0;
    let monthStartIdx = 0;
    let currentMonth = current.getMonth();
    let currentYear = current.getFullYear();

    while (current <= end) {
      const left = dayIndex * pxPerDay;
      const dayNum = current.getDate();
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const weekendStyle = isWeekend ? 'background:rgba(244,63,94,0.05);' : '';
      bottomCells.push(`<div class="gantt-time-col-bottom" style="left:${left}px;width:${pxPerDay}px;justify-content:center;padding:0;${weekendStyle}">${dayNum}</div>`);

      gridLines.push(`<div class="gantt-grid-line" style="left:${left}px;${isWeekend ? 'background:rgba(244,63,94,0.03);' : ''}"></div>`);

      const next = new Date(current);
      next.setDate(next.getDate() + 1);
      if (next.getMonth() !== currentMonth || next.getFullYear() !== currentYear || next > end) {
        const monthName = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const width = (dayIndex - monthStartIdx + 1) * pxPerDay;
        const leftPos = monthStartIdx * pxPerDay;
        topCells.push(`<div class="gantt-time-col-top" style="left:${leftPos}px;width:${width}px;">${monthName}</div>`);
        monthStartIdx = dayIndex + 1;
        currentMonth = next.getMonth();
        currentYear = next.getFullYear();
      }

      current = next;
      dayIndex++;
    }
  } else if (scale === 'week') {
    let current = new Date(start);
    let weekIndex = 0;
    let monthStartIdx = 0;
    let currentMonth = current.getMonth();
    let currentYear = current.getFullYear();

    while (current <= end) {
      const left = weekIndex * pxPerDay * 7;
      const label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      bottomCells.push(`<div class="gantt-time-col-bottom" style="left:${left}px;width:${pxPerDay * 7}px;">${label}</div>`);

      gridLines.push(`<div class="gantt-grid-line" style="left:${left}px;"></div>`);

      const next = new Date(current);
      next.setDate(next.getDate() + 7);

      if (next.getMonth() !== currentMonth || next.getFullYear() !== currentYear || next > end) {
        const monthName = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const width = (weekIndex - monthStartIdx + 1) * pxPerDay * 7;
        const leftPos = monthStartIdx * pxPerDay * 7;
        topCells.push(`<div class="gantt-time-col-top" style="left:${leftPos}px;width:${width}px;">${monthName}</div>`);
        monthStartIdx = weekIndex + 1;
        currentMonth = next.getMonth();
        currentYear = next.getFullYear();
      }

      current = next;
      weekIndex++;
    }
  } else if (scale === 'month') {
    let current = new Date(start);
    current.setDate(1);
    let monthIndex = 0;
    let yearStartIdx = 0;
    let currentYear = current.getFullYear();

    const months = [];
    while (current <= end) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    let cumulativeLeft = 0;
    months.forEach((m, idx) => {
      const next = new Date(m);
      next.setMonth(next.getMonth() + 1);
      const daysInMonth = Math.round((next - m) / 86400000);
      const width = daysInMonth * pxPerDay;
      const label = m.toLocaleDateString('en-US', { month: 'short' });
      bottomCells.push(`<div class="gantt-time-col-bottom" style="left:${cumulativeLeft}px;width:${width}px;">${label}</div>`);

      gridLines.push(`<div class="gantt-grid-line" style="left:${cumulativeLeft}px;"></div>`);

      if (next.getFullYear() !== currentYear || idx === months.length - 1) {
        const yearWidth = cumulativeLeft + width - yearStartIdx;
        topCells.push(`<div class="gantt-time-col-top" style="left:${yearStartIdx}px;width:${yearWidth}px;">${currentYear}</div>`);
        yearStartIdx = cumulativeLeft + width;
        currentYear = next.getFullYear();
      }

      cumulativeLeft += width;
    });
  } else if (scale === 'quarter') {
    let current = new Date(start);
    current.setDate(1);
    current.setMonth(Math.floor(current.getMonth() / 3) * 3);

    const quarters = [];
    while (current <= end) {
      quarters.push(new Date(current));
      current.setMonth(current.getMonth() + 3);
    }

    let cumulativeLeft = 0;
    quarters.forEach((q, idx) => {
      const next = new Date(q);
      next.setMonth(next.getMonth() + 3);
      const daysInQuarter = Math.round((next - q) / 86400000);
      const width = daysInQuarter * pxPerDay;
      const qNum = Math.floor(q.getMonth() / 3) + 1;
      const label = `Q${qNum}`;
      bottomCells.push(`<div class="gantt-time-col-bottom" style="left:${cumulativeLeft}px;width:${width}px;justify-content:center;padding:0;">${label}</div>`);

      gridLines.push(`<div class="gantt-grid-line" style="left:${cumulativeLeft}px;"></div>`);
      cumulativeLeft += width;
    });

    let cumulativeLeftTop = 0;
    let yearStartIdx = 0;
    let currentYear = quarters[0].getFullYear();
    quarters.forEach((q, idx) => {
      const next = new Date(q);
      next.setMonth(next.getMonth() + 3);
      const daysInQuarter = Math.round((next - q) / 86400000);
      const width = daysInQuarter * pxPerDay;

      if (next.getFullYear() !== currentYear || idx === quarters.length - 1) {
        const yearWidth = cumulativeLeftTop + width - yearStartIdx;
        topCells.push(`<div class="gantt-time-col-top" style="left:${yearStartIdx}px;width:${yearWidth}px;">${currentYear}</div>`);
        yearStartIdx = cumulativeLeftTop + width;
        currentYear = next.getFullYear();
      }
      cumulativeLeftTop += width;
    });
  }

  return {
    topHtml: topCells.join(''),
    bottomHtml: bottomCells.join(''),
    gridLinesHtml: gridLines.join('')
  };
}

function renderGanttTab(project, projectTasks) {
  if (projectTasks.length === 0) {
    return `<div class="glass-panel rounded-2xl p-5 animate-slide-up" style="text-align:center;padding:64px;color:var(--text-dim);font-size:13px">
      No tasks available to chart. Click 'Task Checklist' tab to add tasks.
    </div>`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  projectTasks.forEach(t => {
    if (!t.PlannedStartDate) t.PlannedStartDate = project.PlannedStartDate || todayStr;
    if (!t.PlannedEndDate) t.PlannedEndDate = project.PlannedEndDate || todayStr;
  });

  const allDates = projectTasks.flatMap(t => [t.PlannedStartDate, t.PlannedEndDate]).filter(Boolean).map(d => new Date(d));
  let minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date();
  let maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date();
  minDate.setHours(0, 0, 0, 0);
  maxDate.setHours(23, 59, 59, 999);

  let paddingDays = 14;
  if (state.ganttScale === 'day') paddingDays = 7;
  else if (state.ganttScale === 'week') paddingDays = 28;
  else if (state.ganttScale === 'month') paddingDays = 90;
  else if (state.ganttScale === 'quarter') paddingDays = 180;

  minDate.setDate(minDate.getDate() - paddingDays);
  maxDate.setDate(maxDate.getDate() + paddingDays);

  if (state.ganttScale === 'week') {
    minDate.setDate(minDate.getDate() - minDate.getDay());
  } else if (state.ganttScale === 'month') {
    minDate.setDate(1);
  } else if (state.ganttScale === 'quarter') {
    minDate.setDate(1);
    minDate.setMonth(Math.floor(minDate.getMonth() / 3) * 3);
  }

  let pxPerDay = 8;
  if (state.ganttScale === 'day') pxPerDay = 32;
  else if (state.ganttScale === 'week') pxPerDay = 8;
  else if (state.ganttScale === 'month') pxPerDay = 2.5;
  else if (state.ganttScale === 'quarter') pxPerDay = 0.8;

  const totalDays = Math.max(1, Math.round((maxDate - minDate) / 86400000));
  const chartWidth = totalDays * pxPerDay;
  const totalTasks = projectTasks.length;
  const rowHeight = 40;
  const headerHeight = 44;

  const headers = buildTimeHeaderHtml(minDate, maxDate, state.ganttScale, pxPerDay);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPx = (today - minDate) / 86400000 * pxPerDay;
  const showTodayLine = todayPx >= 0 && todayPx <= chartWidth;

  return `<div class="glass-panel rounded-2xl p-5 space-y-4 animate-slide-up" style="overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:8px">
        <h3 class="panel-title">${svgIcon('calendar')} Project Schedule</h3>
        <button class="btn-primary" id="gantt-edit-toggle" style="font-size:11px;padding:6px 12px;border-radius:6px;display:flex;align-items:center;gap:6px;background:${state.editTimelineMode ? 'var(--brand-500)' : 'var(--slate-800)'};border:1px solid var(--slate-700)">
          ${svgIcon('edit-2', 'w-3 h-3')} <span>${state.editTimelineMode ? 'Edit Mode ON' : 'Edit Timeline'}</span>
        </button>
        <button class="btn-primary" id="gantt-cpm-toggle" style="font-size:11px;padding:6px 12px;border-radius:6px;display:flex;align-items:center;gap:6px;background:${state.showCriticalPath ? 'var(--rose-600)' : 'var(--slate-800)'};border:1px solid var(--slate-700)">
          ${svgIcon('git-commit', 'w-3 h-3')} <span>CPM Path</span>
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="gantt-legend" style="display:flex;align-items:center;gap:12px;font-size:9px;color:var(--text-muted);background:var(--slate-900);padding:6px 12px;border-radius:8px;border:1px solid var(--slate-800);">
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(99,102,241,0.2);border:1px solid #6366f1;display:inline-block"></span><span>Summary</span></div>
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(129,0,85,0.15);border:1px solid var(--brand-500);display:inline-block"></span><span>On Track</span></div>
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(16,185,129,0.15);border:1px solid var(--emerald-500);display:inline-block"></span><span>Completed</span></div>
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(245,158,11,0.15);border:1px solid var(--amber-500);display:inline-block"></span><span>Delayed</span></div>
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(244,63,94,0.15);border:1px solid var(--rose-500);display:inline-block"></span><span>Blocked</span></div>
          <div style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:rgba(244,63,94,0.25);border:1.5px solid var(--rose-500);box-shadow:0 0 3px rgba(244,63,94,0.25);display:inline-block"></span><span>Critical</span></div>
        </div>
        <div class="btn-group">
          ${['day', 'week', 'month', 'quarter'].map(s => `<button class="btn-group-item ${state.ganttScale === s ? 'active' : ''}" data-gantt-scale="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}s</button>`).join('')}
        </div>
      </div>
    </div>
    
    <div class="gantt-wrap" id="gantt-scroll-container">
      <div class="gantt-scroll-spacer" style="position:absolute;top:0;left:0;width:1px;height:${headerHeight + totalTasks * rowHeight}px;pointer-events:none;"></div>
      
      <div class="gantt-container" style="width:${280 + chartWidth}px;">
        <div class="gantt-labels">
          <div class="gantt-header-cell">Activity Name</div>
          <div class="gantt-visible-labels" style="position:relative;height:${totalTasks * rowHeight}px;">
          </div>
        </div>
        
        <div class="gantt-chart-area">
          <div class="gantt-time-header" style="width:${chartWidth}px;">
            <div class="gantt-time-header-top" style="position:relative;height:22px;width:${chartWidth}px;border-bottom:1px solid var(--slate-850);display:flex;align-items:center;">
              ${headers.topHtml}
            </div>
            <div class="gantt-time-header-bottom" style="position:relative;height:22px;width:${chartWidth}px;display:flex;align-items:center;">
              ${headers.bottomHtml}
            </div>
          </div>
          
          <div class="gantt-grid-lines" style="position:absolute;top:${headerHeight}px;left:0;width:${chartWidth}px;height:${totalTasks * rowHeight}px;pointer-events:none;">
            ${headers.gridLinesHtml}
          </div>
          
          <svg class="gantt-svg-overlay" style="width:${chartWidth}px;height:${totalTasks * rowHeight}px;pointer-events:none;">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--slate-400)" />
              </marker>
              <marker id="arrow-critical" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--rose-400)" />
              </marker>
              <marker id="arrow-hover" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--brand-300)" />
              </marker>
            </defs>
            <g class="gantt-svg-paths"></g>
          </svg>
          
          <div class="gantt-visible-bars" style="position:relative;height:${totalTasks * rowHeight}px;width:${chartWidth}px;">
          </div>

          ${showTodayLine ? `
          <div class="gantt-today-line" style="left:${todayPx}px;top:0;height:${headerHeight + totalTasks * rowHeight}px;">
            <span class="gantt-today-label">Today</span>
          </div>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}

function initGanttViewEvents() {
  const vc = document.getElementById('view-container');
  if (!vc) return;

  const project = state.projects.find(p => p.ID === state.activeProjectId);
  if (!project) return;

  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID).sort((a, b) => compareTaskIds(a.ID, b.ID));
  if (projectTasks.length === 0) return;

  const todayStr = new Date().toISOString().split('T')[0];
  projectTasks.forEach(t => {
    if (!t.PlannedStartDate) t.PlannedStartDate = project.PlannedStartDate || todayStr;
    if (!t.PlannedEndDate) t.PlannedEndDate = project.PlannedEndDate || todayStr;
  });

  const allDates = projectTasks.flatMap(t => [t.PlannedStartDate, t.PlannedEndDate]).filter(Boolean).map(d => new Date(d));
  let minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date();
  minDate.setHours(0, 0, 0, 0);

  let paddingDays = 14;
  if (state.ganttScale === 'day') paddingDays = 7;
  else if (state.ganttScale === 'week') paddingDays = 28;
  else if (state.ganttScale === 'month') paddingDays = 90;
  else if (state.ganttScale === 'quarter') paddingDays = 180;
  minDate.setDate(minDate.getDate() - paddingDays);

  if (state.ganttScale === 'week') {
    minDate.setDate(minDate.getDate() - minDate.getDay());
  } else if (state.ganttScale === 'month') {
    minDate.setDate(1);
  } else if (state.ganttScale === 'quarter') {
    minDate.setDate(1);
    minDate.setMonth(Math.floor(minDate.getMonth() / 3) * 3);
  }

  let pxPerDay = 8;
  if (state.ganttScale === 'day') pxPerDay = 32;
  else if (state.ganttScale === 'week') pxPerDay = 8;
  else if (state.ganttScale === 'month') pxPerDay = 2.5;
  else if (state.ganttScale === 'quarter') pxPerDay = 0.8;

  const cpm = calculateCriticalPath(project.ID);

  const scrollContainer = vc.querySelector('#gantt-scroll-container');
  if (!scrollContainer) return;

  // Zoom clicks with scroll preservation
  vc.querySelectorAll('[data-gantt-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      const newScale = btn.dataset.ganttScale;
      const scrollCenterX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;
      const scrollWidthBefore = scrollContainer.scrollWidth;

      state.ganttScale = newScale;
      render();

      const newContainer = document.getElementById('gantt-scroll-container');
      if (newContainer) {
        const ratio = newContainer.scrollWidth / scrollWidthBefore;
        newContainer.scrollLeft = scrollCenterX * ratio - newContainer.clientWidth / 2;
      }
    });
  });

  // Toggle Edit mode
  vc.querySelector('#gantt-edit-toggle')?.addEventListener('click', () => {
    state.editTimelineMode = !state.editTimelineMode;
    render();
  });

  // Toggle CPM Path
  vc.querySelector('#gantt-cpm-toggle')?.addEventListener('click', () => {
    state.showCriticalPath = !state.showCriticalPath;
    render();
  });

  // Keyboard shortcuts
  const handleGanttKeydown = (e) => {
    if (state.workspaceTab !== 'gantt') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      state.editTimelineMode = !state.editTimelineMode;
      showToast(state.editTimelineMode ? 'Edit Timeline Mode Enabled' : 'Edit Timeline Mode Disabled', 'info');
      render();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      state.showCriticalPath = !state.showCriticalPath;
      render();
    } else if (e.key === '+') {
      e.preventDefault();
      const scales = ['day', 'week', 'month', 'quarter'];
      const idx = scales.indexOf(state.ganttScale);
      if (idx > 0) {
        state.ganttScale = scales[idx - 1];
        render();
      }
    } else if (e.key === '-') {
      e.preventDefault();
      const scales = ['day', 'week', 'month', 'quarter'];
      const idx = scales.indexOf(state.ganttScale);
      if (idx < scales.length - 1) {
        state.ganttScale = scales[idx + 1];
        render();
      }
    }
  };
  window.removeEventListener('keydown', window._ganttKeydownHandler);
  window._ganttKeydownHandler = handleGanttKeydown;
  window.addEventListener('keydown', handleGanttKeydown);

  // Virtualized row updates
  const updateVirtualRows = () => {
    const scrollTop = scrollContainer.scrollTop;
    const clientHeight = scrollContainer.clientHeight;
    const rowHeight = 40;
    const buffer = 5;

    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const endIdx = Math.min(projectTasks.length - 1, Math.ceil((scrollTop + clientHeight) / rowHeight) + buffer);

    // Labels
    const labelsContainer = scrollContainer.querySelector('.gantt-visible-labels');
    if (labelsContainer) {
      const labelsHtml = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const t = projectTasks[i];
        const level = String(t.ID).split('.').length - 1;
        const isCrit = state.showCriticalPath && cpm.criticalTaskIds.has(t.ID);
        labelsHtml.push(`
          <div class="gantt-task-label" style="top:${i * rowHeight}px;padding-left:${16 + level * 12}px;${isCrit ? 'border-left:3px solid var(--rose-500);' : ''}" data-task-id="${t.ID}">
            <span style="font-size:10px;color:var(--text-dim);margin-right:6px">${escHtml(t.ID)}</span>
            <span style="color:${isCrit ? 'var(--rose-400)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.Name)}</span>
          </div>
        `);
      }
      labelsContainer.innerHTML = labelsHtml.join('');
    }

    // Bars
    const barsContainer = scrollContainer.querySelector('.gantt-visible-bars');
    if (barsContainer) {
      const barsHtml = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const t = projectTasks[i];
        const start = new Date(t.PlannedStartDate);
        const end = new Date(t.PlannedEndDate);
        const leftPx = (start - minDate) / 86400000 * pxPerDay;
        const widthPx = Math.max(12, (end - start) / 86400000 * pxPerDay);
        const level = String(t.ID).split('.').length - 1;

        let barBorder = 'var(--brand-500)', barBg = 'rgba(129,0,85,0.15)', fillBg = 'var(--brand-500)';
        if (level === 0) { barBorder = '#6366f1'; barBg = 'rgba(99,102,241,0.1)'; fillBg = '#6366f1'; }
        if (t.Status === 'delayed') { barBorder = 'var(--amber-500)'; barBg = 'rgba(245,158,11,0.1)'; fillBg = 'var(--amber-500)'; }
        if (t.Status === 'blocked') { barBorder = 'var(--rose-500)'; barBg = 'rgba(244,63,94,0.1)'; fillBg = 'var(--rose-500)'; }
        if (t.Status === 'completed') { barBorder = 'var(--emerald-500)'; barBg = 'rgba(16,185,129,0.1)'; fillBg = 'var(--emerald-500)'; }

        const isCrit = state.showCriticalPath && cpm.criticalTaskIds.has(t.ID);
        const editableClass = state.editTimelineMode ? 'editable' : '';

        barsHtml.push(`
          <div class="gantt-bar-row" style="top:${i * rowHeight}px;">
            <div class="gantt-bar ${editableClass} ${isCrit ? 'critical' : ''}" 
                 style="left:${leftPx}px;width:${widthPx}px;background:${barBg};border-color:${barBorder};" 
                 data-task-id="${t.ID}" 
                 title="${escHtml(t.Name)}: ${t.Progress}% (${formatDate(t.PlannedStartDate)} – ${formatDate(t.PlannedEndDate)})">
              ${state.editTimelineMode ? '<div class="gantt-handle-left"></div>' : ''}
              <div class="gantt-bar-fill" style="width:${t.Progress || 0}%;background:${fillBg}"></div>
              ${widthPx > 45 ? `<span class="gantt-bar-text">${t.Progress}%</span>` : ''}
              ${state.editTimelineMode ? '<div class="gantt-handle-right"></div>' : ''}
            </div>
            <span class="gantt-bar-label" style="left:${leftPx + widthPx + 8}px;">
              ${t.Progress}% • ${escHtml(t.Assignee || 'Unassigned')}
            </span>
          </div>
        `);
      }
      barsContainer.innerHTML = barsHtml.join('');
    }

    // SVG Dependency Paths
    const svgGroup = scrollContainer.querySelector('.gantt-svg-paths');
    if (svgGroup) {
      const paths = [];
      projectTasks.forEach((t, i) => {
        const deps = parseDependencies(t.Dependencies);
        deps.forEach(d => {
          const predIdx = projectTasks.findIndex(pt => pt.ID === d.predecessorId);
          if (predIdx === -1) return;

          if ((i >= startIdx && i <= endIdx) || (predIdx >= startIdx && predIdx <= endIdx)) {
            const p = projectTasks[predIdx];
            const startP = new Date(p.PlannedStartDate);
            const endP = new Date(p.PlannedEndDate);
            const leftP = (startP - minDate) / 86400000 * pxPerDay;
            const widthP = Math.max(12, (endP - startP) / 86400000 * pxPerDay);

            const startT = new Date(t.PlannedStartDate);
            const endT = new Date(t.PlannedEndDate);
            const leftT = (startT - minDate) / 86400000 * pxPerDay;
            const widthT = Math.max(12, (endT - startT) / 86400000 * pxPerDay);

            const yA = predIdx * rowHeight + 20;
            const yB = i * rowHeight + 20;

            let xA = 0;
            let xB = 0;
            let pathD = '';
            let isCritLink = state.showCriticalPath && cpm.criticalTaskIds.has(t.ID) && cpm.criticalTaskIds.has(p.ID);

            if (d.type === 'FS') {
              xA = leftP + widthP;
              xB = leftT;
              const midX = xA + 10;
              if (xB >= xA) {
                pathD = `M ${xA} ${yA} L ${midX} ${yA} L ${midX} ${yB} L ${xB} ${yB}`;
              } else {
                const midY = (yA + yB) / 2;
                pathD = `M ${xA} ${yA} L ${xA + 10} ${yA} L ${xA + 10} ${midY} L ${xB - 10} ${midY} L ${xB - 10} ${yB} L ${xB} ${yB}`;
              }
            } else if (d.type === 'SS') {
              xA = leftP;
              xB = leftT;
              const midX = Math.min(xA, xB) - 10;
              pathD = `M ${xA} ${yA} L ${midX} ${yA} L ${midX} ${yB} L ${xB} ${yB}`;
            } else if (d.type === 'FF') {
              xA = leftP + widthP;
              xB = leftT + widthT;
              const midX = Math.max(xA, xB) + 10;
              pathD = `M ${xA} ${yA} L ${midX} ${yA} L ${midX} ${yB} L ${xB} ${yB}`;
            } else if (d.type === 'SF') {
              xA = leftP;
              xB = leftT + widthT;
              const midX = xA - 10;
              pathD = `M ${xA} ${yA} L ${midX} ${yA} L ${midX} ${yB} L ${xB} ${yB}`;
            }

            const markerId = isCritLink ? 'arrow-critical' : 'arrow';
            paths.push(`
              <path class="gantt-dep-path ${isCritLink ? 'critical-link' : ''}" 
                    d="${pathD}" 
                    marker-end="url(#${markerId})" 
                    title="${escHtml(p.ID)} → ${escHtml(t.ID)} (${d.type})"
                    data-from="${p.ID}"
                    data-to="${t.ID}" />
            `);
          }
        });
      });
      svgGroup.innerHTML = paths.join('');
    }
  };

  let frameRequest = null;
  const handleScroll = () => {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      updateVirtualRows();
    });
  };
  scrollContainer.addEventListener('scroll', handleScroll);
  updateVirtualRows();

  // Double click to edit
  scrollContainer.addEventListener('dblclick', (e) => {
    const label = e.target.closest('.gantt-task-label');
    const bar = e.target.closest('.gantt-bar');
    const taskId = label ? label.dataset.taskId : (bar ? bar.dataset.taskId : null);
    if (taskId) {
      openEditTaskModal(taskId);
    }
  });

  // Drag and Drop
  const barsContainer = scrollContainer.querySelector('.gantt-visible-bars');
  if (barsContainer) {
    barsContainer.addEventListener('mousedown', (e) => {
      if (!state.editTimelineMode) return;
      const bar = e.target.closest('.gantt-bar');
      if (!bar) return;

      const taskId = bar.dataset.taskId;
      const t = state.tasks.find(x => x.ProjectID === state.activeProjectId && x.ID === taskId);
      if (!t) return;

      e.preventDefault();

      const handleLeft = e.target.classList.contains('gantt-handle-left');
      const handleRight = e.target.classList.contains('gantt-handle-right');
      const action = handleLeft ? 'resize-left' : (handleRight ? 'resize-right' : 'drag');

      const startX = e.clientX;
      const initialStart = new Date(t.PlannedStartDate).getTime();
      const initialEnd = new Date(t.PlannedEndDate).getTime();
      const initialDur = initialEnd - initialStart;

      const tooltip = document.createElement('div');
      tooltip.className = 'gantt-drag-tooltip';
      tooltip.style.left = (e.clientX + 15) + 'px';
      tooltip.style.top = (e.clientY + 15) + 'px';
      tooltip.innerText = `${formatDate(initialStart)} – ${formatDate(initialEnd)} (${Math.max(1, Math.round(initialDur / 86400000))} days)`;
      document.body.appendChild(tooltip);
      document.body.style.userSelect = 'none';

      let finalStart = initialStart;
      let finalEnd = initialEnd;

      const onMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaDays = Math.round(deltaX / pxPerDay);

        if (action === 'drag') {
          finalStart = initialStart + deltaDays * 86400000;
          finalEnd = initialEnd + deltaDays * 86400000;
        } else if (action === 'resize-left') {
          finalStart = Math.min(initialEnd - 86400000, initialStart + deltaDays * 86400000);
          finalEnd = initialEnd;
        } else if (action === 'resize-right') {
          finalStart = initialStart;
          finalEnd = Math.max(initialStart + 86400000, initialEnd + deltaDays * 86400000);
        }

        const calculatedDur = finalEnd - finalStart;
        tooltip.innerText = `${formatDate(finalStart)} – ${formatDate(finalEnd)} (${Math.max(1, Math.round(calculatedDur / 86400000))} days)`;
        tooltip.style.left = (moveEvent.clientX + 15) + 'px';
        tooltip.style.top = (moveEvent.clientY + 15) + 'px';

        const newLeftPx = (finalStart - minDate) / 86400000 * pxPerDay;
        const newWidthPx = Math.max(12, (finalEnd - finalStart) / 86400000 * pxPerDay);
        bar.style.left = newLeftPx + 'px';
        bar.style.width = newWidthPx + 'px';
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        tooltip.remove();
        document.body.style.userSelect = '';

        t.PlannedStartDate = new Date(finalStart).toISOString().split('T')[0];
        t.PlannedEndDate = new Date(finalEnd).toISOString().split('T')[0];

        propagateSchedule(state.activeProjectId);
        const { updatedProjects } = performProjectRollups(state.activeProjectId, state.tasks, state.projects);
        state.projects = updatedProjects;

        saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
        showToast('Timeline updated.');
        render();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }
}

function renderTasksTab(project, projectTasks) {
  const assignees = [...new Set(projectTasks.map(t => t.Assignee).filter(Boolean))];
  const filtered = projectTasks.filter(t => state.taskAssigneeFilter ? t.Assignee === state.taskAssigneeFilter : true);

  const rows = filtered.length > 0 ? filtered.map(t => {
    const level = String(t.ID).split('.').length - 1;
    let sClass = 'badge';
    let statusCol = 'var(--slate-500)';
    let borderCol = 'var(--slate-600)';
    if (t.Status === 'in-progress') { sClass = 'badge badge-blue'; statusCol = 'var(--blue-500)'; borderCol = 'var(--blue-500)'; }
    else if (t.Status === 'completed') { sClass = 'badge badge-emerald'; statusCol = 'var(--emerald-500)'; borderCol = 'var(--emerald-500)'; }
    else if (t.Status === 'delayed') { sClass = 'badge badge-delayed'; statusCol = 'var(--amber-500)'; borderCol = 'var(--amber-500)'; }
    else if (t.Status === 'blocked') { sClass = 'badge badge-rose'; statusCol = 'var(--rose-500)'; borderCol = 'var(--rose-500)'; }

    const horizontalConnector = level > 0 ? `<div class="checklist-connector-line" style="width: 16px; left: -16px;"></div>` : '';
    const isCompleted = t.Status === 'completed';

    // Collapsible Logic
    const hasChildren = projectTasks.some(child => {
      const cp = String(child.ID).split('.');
      const pp = String(t.ID).split('.');
      return cp.length === pp.length + 1 && cp.slice(0, pp.length).join('.') === t.ID;
    });

    const isCollapsed = state.collapsedTasks && state.collapsedTasks.includes(t.ID);
    const toggleIcon = isCollapsed ? svgIcon('chevron-right', 'w-4 h-4 collapse-toggle-icon') : svgIcon('chevron-down', 'w-4 h-4 collapse-toggle-icon');
    const toggleButton = hasChildren
      ? `<button class="task-collapse-btn" data-task-id="${escHtml(t.ID)}" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;margin-right:6px">${toggleIcon}</button>`
      : `<div style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;margin-right:6px"><span class="dot-spacer" style="width:4px;height:4px;border-radius:50%;background:var(--slate-700)"></span></div>`;

    let isHidden = false;
    const parts = String(t.ID).split('.');
    for (let len = 1; len < parts.length; len++) {
      const ancestorId = parts.slice(0, len).join('.');
      if (state.collapsedTasks && state.collapsedTasks.includes(ancestorId)) {
        isHidden = true;
        break;
      }
    }

    if (isHidden) return '';

    return `<div class="checklist-card" data-task-id="${escHtml(t.ID)}" style="margin-left: ${level * 24}px; border-left-color: ${borderCol}">
      ${horizontalConnector}
      <div class="checklist-card-main">
        <div style="display:flex;align-items:center;gap:12px;margin-right:12px">
          <!-- Started Checkbox (Redesigned) -->
          <label class="checklist-check-item-container" title="Mark Started">
            <div class="checklist-check-wrapper">
              <input type="checkbox" ${t.ActualStartDate ? 'checked' : ''} class="task-start-check" data-task-id="${escHtml(t.ID)}">
              <span class="checklist-checkbox-custom">${svgIcon('play', 'w-2.5 h-2.5')}</span>
            </div>
            <span style="font-size:8px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Started</span>
          </label>
          <!-- Completed Checkbox (Redesigned) -->
          <label class="checklist-check-item-container" title="Mark Completed">
            <div class="checklist-check-wrapper">
              <input type="checkbox" ${t.ActualEndDate ? 'checked' : ''} class="task-complete-check" data-task-id="${escHtml(t.ID)}">
              <span class="checklist-checkbox-custom">${svgIcon('check', 'w-2.5 h-2.5')}</span>
            </div>
            <span style="font-size:8px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">Done</span>
          </label>
        </div>
        <div class="checklist-info">
          <div class="checklist-header-info" style="display:flex;align-items:center;">
            ${toggleButton}
            <span class="checklist-id" style="margin-right:6px">${escHtml(t.ID)}</span>
            <span class="checklist-name">${escHtml(t.Name)}</span>
          </div>
          <div class="checklist-meta">
            <span class="checklist-meta-item">${svgIcon('user')} ${escHtml(t.Assignee || 'Unassigned')}</span>
            <span class="checklist-meta-item">${svgIcon('calendar')} ${formatDate(t.PlannedStartDate)} – ${formatDate(t.PlannedEndDate)}</span>
            ${t.DaysDelayed > 0 && !t.ActualEndDate ? `<span class="checklist-meta-item" style="color:var(--rose-400)">${svgIcon('alert-triangle')} ${t.DaysDelayed}d ongoing</span>` : ''}
          </div>
        </div>
      </div>
      <div class="checklist-card-actions">
        <div class="checklist-progress-wrapper">
          <span class="checklist-progress-text">${t.Progress || 0}%</span>
          <div class="checklist-progress-bar-track">
            <div class="checklist-progress-bar-fill" style="width: ${t.Progress || 0}%; background-color: ${statusCol}"></div>
          </div>
        </div>
        <div class="checklist-buttons">
          <button class="task-edit-btn" data-task-id="${escHtml(t.ID)}" title="Edit">${svgIcon('edit-3')}</button>
          <button class="task-delete-btn" data-task-id="${escHtml(t.ID)}" title="Delete">${svgIcon('trash-2')}</button>
        </div>
      </div>
    </div>`;
  }).join('') : `<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:12px;background:rgba(28,6,23,0.3);border:1px dashed var(--slate-850);border-radius:var(--r-xl)">No tasks logged. Add activity items using '+ Add Task' button.</div>`;

  return `<div class="glass-panel rounded-2xl p-5 space-y-4 animate-slide-up">
    <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Checklist:</span>
        <div class="filter-select-wrap">${svgIcon('user')}
          <select id="task-assignee-filter">
            <option value="">Filter by Assignee</option>
            ${assignees.map(a => `<option value="${escHtml(a)}" ${state.taskAssigneeFilter === a ? 'selected' : ''}>${escHtml(a)}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn-primary" id="add-task-btn">${svgIcon('plus')} Add Task / Activity</button>
    </div>
    <div class="checklist-tree-container">
      ${rows}
    </div>
  </div>`;
}

const SRF_STEPS = [
  { key: 'UploadedOn', label: 'Uploaded On' },
  { key: 'ApprovedOn', label: 'Approved On' },
  { key: 'ReceivedCCB', label: 'Received for CCB' },
  { key: 'SendCCB', label: 'Send for CCB' },
  { key: 'CCBReceived', label: 'CCB Received On' },
  { key: 'CCBAttached', label: 'CCB Attached in CRS On' },
  { key: 'FSDReceived', label: 'FSD Received On' },
  { key: 'FSDApproved', label: 'FSD Approved On' },
  { key: 'ReceivedUAT', label: 'Received for UAT' },
  { key: 'ActualTestingApproval', label: 'Actual Testing & Approval' },
  { key: 'SRFClose', label: 'SRF Close' }
];

function validateSRFChronology(srfItem) {
  const warnings = [];
  let lastDate = null, lastName = null;
  SRF_STEPS.forEach(step => {
    const dateStr = srfItem[step.key];
    if (dateStr) {
      const d = new Date(dateStr);
      if (lastDate && d < lastDate) {
        warnings.push(`"${step.label}" (${dateStr}) is earlier than preceding step "${lastName}" (${srfItem[SRF_STEPS.find(s => s.label === lastName).key]}).`);
      }
      lastDate = d; lastName = step.label;
    }
  });
  return warnings;
}

function renderSRFTab(project, projectSRFs) {
  if (projectSRFs.length === 0) {
    return `<div class="glass-panel rounded-2xl p-5 animate-slide-up">
      <div style="text-align:center;padding:80px;background:rgba(28,6,23,0.3);border:1px dashed var(--slate-800);border-radius:var(--r-2xl)">
        ${svgIcon('file-spreadsheet', 'w-12 h-12')}
        <h3 style="color:white;font-size:15px;font-weight:700;margin-top:12px">No SRF documents linked</h3>
        <p style="color:var(--text-dim);font-size:12px;margin-top:4px">No linked GITL SRF documents. Click 'Add SRF Document' to initiate tracking.</p>
        <button class="btn-danger" id="add-srf-btn" style="margin-top:20px">${svgIcon('plus')} Add SRF Document</button>
      </div>
    </div>`;
  }

  const idx = Math.min(state.selectedSRFIndex, projectSRFs.length - 1);
  const srfItem = projectSRFs[idx];
  const warnings = validateSRFChronology(srfItem);

  const srfPills = projectSRFs.map((s, i) =>
    `<button class="srf-tab ${i === idx ? 'active' : ''}" data-srf-index="${i}">${escHtml(s.SRFNo)}</button>`
  ).join('');

  const completedIndex = SRF_STEPS.map(step => !!srfItem[step.key]).lastIndexOf(true);
  const progressPct = completedIndex >= 0 ? (completedIndex / (SRF_STEPS.length - 1)) * 100 : 0;

  const stepNodes = SRF_STEPS.map((step, si) => {
    const dateVal = srfItem[step.key];
    const isDone = !!dateVal;
    const isCurrent = (si === completedIndex + 1) || (completedIndex === -1 && si === 0);
    const nextIsDone = si < SRF_STEPS.length - 1 ? !!srfItem[SRF_STEPS[si + 1].key] : false;

    return `<div class="srf-pipeline-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
      <div class="srf-node-row">
        ${si > 0 ? `<div class="srf-step-line-left ${isDone ? 'active' : ''}"></div>` : ''}
        <label class="srf-pipeline-node">
          <input type="checkbox" ${isDone ? 'checked' : ''} class="srf-step-check srf-pipeline-checkbox" data-step-index="${si}" data-srf-no="${escHtml(srfItem.SRFNo)}">
          <span class="srf-node-inner">${isDone ? svgIcon('check', 'w-4 h-4') : (si + 1)}</span>
        </label>
        ${si < SRF_STEPS.length - 1 ? `<div class="srf-step-line-right ${nextIsDone ? 'active' : ''}"></div>` : ''}
      </div>
      <div class="srf-pipeline-content">
        <div class="srf-pipeline-label">${escHtml(step.label)}</div>
        ${isDone ? `<div class="srf-pipeline-date">${formatDate(dateVal)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `<div class="glass-panel rounded-2xl p-5 space-y-6 animate-slide-up">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-bottom:16px;border-bottom:1px solid rgba(59,17,48,0.8)">
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
        <span style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-right:8px">Select SRF Item:</span>
        ${srfPills}
      </div>
      <button class="btn-danger" id="add-srf-btn">${svgIcon('plus')} Add SRF Document</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;background:rgba(28,6,23,0.4);border:1px solid rgba(59,17,48,0.6);border-radius:var(--r-2xl);padding:20px;font-size:13px">
      <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Development Descriptor</div><div style="font-weight:600;color:white;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(srfItem.Developments || 'N/A')}</div></div>
      <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Requester User</div><div style="font-weight:600;color:var(--text-secondary)">${escHtml(srfItem.User || 'N/A')}</div></div>
      <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Est. Mandays (FC/TC)</div><div style="font-weight:600;color:var(--text-secondary)">${srfItem.MandaysFC} FC + ${srfItem.MandaysTC} TC = <strong style="color:white">${srfItem.TotalMandays} Total</strong></div></div>
      <div><div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Development Cost (INR)</div><div style="font-weight:700;color:var(--emerald-400)">${escHtml(formatCurrency(srfItem.Cost))}</div></div>
      <div style="grid-column:1/-1;padding-top:12px;border-top:1px solid var(--slate-850);display:flex;justify-content:space-between;align-items:center;font-size:12px">
        <div style="color:var(--text-muted)">Current Phase: <span style="padding:2px 8px;background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:var(--rose-400);font-weight:700;border-radius:4px;text-transform:uppercase;font-size:10px;margin-left:6px">${escHtml(srfItem.Status)}</span></div>
        <div style="display:flex;gap:8px">
          <button class="btn-ghost" id="edit-srf-btn" style="font-size:11px;padding:4px 8px">${svgIcon('edit-3')} Edit SRF</button>
          <button class="btn-danger" id="delete-srf-btn" style="font-size:11px;padding:4px 8px">${svgIcon('trash-2')} Delete</button>
        </div>
      </div>
    </div>

    <div class="space-y-3" style="overflow-x:auto">
      <h4 style="font-size:12px;font-weight:700;color:white;display:flex;align-items:center;gap:8px;margin-bottom:12px">${svgIcon('clock', 'w-4 h-4')} SRF Tracker (Sequential Stepper)</h4>
      <div class="srf-pipeline-container" style="gap: 0">
        ${stepNodes}
      </div>
    </div>

    ${warnings.length > 0 ? `<div style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);border-radius:var(--r-xl);padding:16px;display:flex;flex-direction:column;gap:8px">
      <h4 style="font-size:12px;font-weight:700;color:var(--rose-400);display:flex;align-items:center;gap:8px">${svgIcon('alert-triangle')} Chronological Sequencing Warnings</h4>
      <ul style="list-style:disc;list-style-position:inside;font-size:12px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">${warnings.map(w => `<li>${escHtml(w)}</li>`).join('')}</ul>
    </div>` : ''}
  </div>`;
}

function renderKaizenTab(project, projectKaizens) {
  if (projectKaizens.length === 0) {
    return `<div class="glass-panel rounded-2xl p-5 animate-slide-up">
      <div style="text-align:center;padding:80px;background:rgba(28,6,23,0.3);border:1px dashed var(--slate-800);border-radius:var(--r-2xl)">
        ${svgIcon('award', 'w-12 h-12')}
        <h3 style="color:white;font-size:15px;font-weight:700;margin-top:12px">No Kaizen records linked</h3>
        <p style="color:var(--text-dim);font-size:12px;margin-top:4px">No Kaizen initiatives have been logged for this project yet.</p>
        <button class="btn-danger" id="add-kaizen-btn" style="margin-top:20px">${svgIcon('plus')} Add Kaizen</button>
      </div>
    </div>`;
  }

  const cardsHtml = projectKaizens.map(k => {
    const steps = [
      { label: 'Uploaded', key: 'UploadedOn' },
      { label: 'Approved L+1', key: 'ApprovedL1' },
      { label: 'Approved L+2', key: 'ApprovedL2' }
    ];

    const completedCount = steps.filter(s => !!k[s.key]).length;
    const progressPct = completedCount > 0 ? ((completedCount - 1) / (steps.length - 1)) * 100 : 0;

    const pipelineSteps = steps.map((s, si) => {
      const isDone = !!k[s.key];
      const isCurrent = (!isDone && (si === 0 || !!k[steps[si - 1].key])) || (isDone && si === completedCount - 1);
      return `<div class="kaizen-pipeline-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
        <label class="kaizen-pipeline-node">
          <input type="checkbox" ${isDone ? 'checked' : ''} class="kaizen-step-check kaizen-pipeline-checkbox" data-kaizen-id="${escHtml(k.ID)}" data-step-key="${s.key}">
          <span class="kaizen-node-inner">${svgIcon('check')}</span>
        </label>
        <div class="kaizen-pipeline-label-wrap">
          <span class="kaizen-pipeline-label">${escHtml(s.label)}</span>
          ${isDone ? `<span class="kaizen-pipeline-date">${formatDate(k[s.key])}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="kaizen-card">
      <div class="kaizen-card-header">
        <div class="kaizen-card-title">${escHtml(k.Title)}</div>
        <div class="kaizen-card-badge-group">
          <span class="kaizen-grade-badge">Grade ${escHtml(k.Grade)}</span>
          <span style="font-size:10px;color:var(--text-muted)">ID: ${escHtml(k.ID)}</span>
        </div>
      </div>
      <div class="kaizen-pipeline-wrapper">
        <div class="kaizen-pipeline-container">
          <div class="kaizen-pipeline-line"></div>
          <div class="kaizen-pipeline-progress-line" style="width: ${progressPct}%"></div>
          ${pipelineSteps}
        </div>
      </div>
      <div class="kaizen-card-actions">
        <button class="btn-ghost kaizen-edit-btn" data-kaizen-id="${escHtml(k.ID)}" style="font-size:11px;padding:4px 8px">${svgIcon('edit-3')} Edit</button>
        <button class="btn-danger kaizen-delete-btn" data-kaizen-id="${escHtml(k.ID)}" style="font-size:11px;padding:4px 8px">${svgIcon('trash-2')} Delete</button>
      </div>
    </div>`;
  }).join('');

  return `<div class="glass-panel rounded-2xl p-5 space-y-6 animate-slide-up">
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:1px solid rgba(59,17,48,0.8)">
      <h3 style="font-size:14px;font-weight:700;color:white;display:flex;align-items:center;gap:8px">${svgIcon('award')} Kaizen Improvement Initiatives</h3>
      <button class="btn-primary" id="add-kaizen-btn">${svgIcon('plus')} Add Kaizen</button>
    </div>
    <div class="kaizen-log-container">
      ${cardsHtml}
    </div>
  </div>`;
}

/* ============================================================
   14. TEAM PAGE
   ============================================================ */
function renderTeam(container) {
  const teamList = state.teamMembers.map(member => {
    const managedProjs = state.projects.filter(p => p.ProjectManager === member.name);
    const taskProjs = state.projects.filter(p => state.tasks.some(t => t.ProjectID === p.ID && t.Assignee === member.name));
    const allIds = new Set([...managedProjs.map(p => p.ID), ...taskProjs.map(p => p.ID)]);
    const assignedProjects = state.projects.filter(p => allIds.has(p.ID));
    const memberTasks = state.tasks.filter(t => t.Assignee === member.name);
    const completedTasks = memberTasks.filter(t => t.Status === 'completed').length;
    const activeTasks = memberTasks.filter(t => t.Status === 'in-progress').length;
    return { ...member, projects: assignedProjects, projectCount: assignedProjects.length, totalTasks: memberTasks.length, completedTasks, activeTasks };
  }).sort((a, b) => b.projectCount - a.projectCount);

  const chartHeight = 160;
  const maxProjCount = Math.max(1, ...teamList.map(t => t.projectCount));

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
    const val = Math.round(maxProjCount * ratio);
    const bottomPos = ratio * chartHeight + 32;
    return `<div style="position:absolute;width:100%;border-top:1px solid rgba(59,17,48,0.4);bottom:${bottomPos}px;display:flex;justify-content:flex-end;padding-right:16px;font-size:9px;color:var(--text-dim);font-weight:700">
      <span>${val} ${val === 1 ? 'Project' : 'Projects'}</span>
    </div>`;
  }).join('');

  const gradients = ['linear-gradient(to top, var(--brand-500), var(--brand-300))', 'linear-gradient(to top, var(--emerald-500), #2dd4bf)', 'linear-gradient(to top, #a855f7, #ec4899)'];
  const bars = teamList.slice(0, 10).map((m, i) => {
    const barH = Math.max(8, (m.projectCount / maxProjCount) * chartHeight);
    const grad = gradients[i % 3];
    return `<div class="team-bar-item" style="width:${100 / Math.min(10, teamList.length)}%">
      <div class="team-tooltip">${m.projectCount} Projects | ${m.totalTasks} Tasks</div>
      <div class="team-bar" style="height:${barH}px;background:${grad}"></div>
      <span class="team-bar-label">${escHtml(m.name)}</span>
    </div>`;
  }).join('');

  const tableRows = teamList.map(m => `<tr>
    <td style="padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="member-avatar">${escHtml(m.name.charAt(0).toUpperCase())}</div>
        <span style="font-weight:600;color:white">${escHtml(m.name)}</span>
      </div>
    </td>
    <td style="padding:14px 16px;color:var(--text-secondary);font-weight:500">${escHtml(m.role)}</td>
    <td style="padding:14px 16px;color:var(--text-muted);text-transform:capitalize;font-weight:500">${escHtml(m.department)}</td>
    <td style="padding:14px 16px">
      <div style="display:flex;flex-wrap:wrap;gap:4px;max-width:300px">
        ${m.projects.length > 0 ? m.projects.map(proj => `<span style="padding:2px 8px;background:var(--slate-800);color:var(--text-secondary);border-radius:4px;border:1px solid var(--slate-700);font-size:10px;font-weight:600">${escHtml(proj.Name)}</span>`).join('') : `<span style="color:var(--text-dim);font-style:italic;font-size:10px">No active project assignments</span>`}
      </div>
    </td>
    <td style="padding:14px 16px;text-align:center;font-weight:700;color:var(--text-secondary)">
      ${m.totalTasks > 0 ? `<span style="padding:2px 10px;background:rgba(129,0,85,0.1);border:1px solid rgba(129,0,85,0.2);color:var(--brand-300);border-radius:999px;font-weight:700">${m.totalTasks}</span>` : `<span style="color:var(--text-dim)">-</span>`}
    </td>
    <td style="padding:14px 16px;text-align:center">
      ${m.totalTasks > 0 ? `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <span style="color:var(--emerald-400);font-weight:600;font-size:12px">${m.completedTasks} / ${m.totalTasks}</span>
        <div class="progress-track h-1" style="width:48px"><div class="progress-fill fill-emerald" style="height:100%;border-radius:999px;background:var(--emerald-500);width:${Math.round((m.completedTasks / m.totalTasks) * 100)}%"></div></div>
      </div>` : `<span style="color:var(--text-dim)">-</span>`}
    </td>
  </tr>`).join('');

  container.innerHTML = `
  <div class="space-y-6 animate-fade-in">
    <div class="glass-panel rounded-2xl p-5 space-y-4">
      <h3 class="panel-title">${svgIcon('award')} Project Allocation Workload Chart</h3>
      <div class="team-chart-container">
        <div class="team-chart-bars" style="min-width:600px">
          ${gridLines}
          ${bars}
        </div>
      </div>
    </div>
    <div class="glass-panel rounded-2xl p-5 space-y-4">
      <h3 class="panel-title">${svgIcon('users')} Resource Directory &amp; Portfolio Index</h3>
      <div style="overflow-x:auto;border:1px solid rgba(43,11,35,0.8);border-radius:var(--r-xl)">
        <table class="team-table">
          <thead><tr>
            <th>Member Name</th><th>Role Descriptor</th><th>Department</th><th>Assigned Projects</th><th style="text-align:center">Tasks Load</th><th style="text-align:center">Completed</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   15. EMPTY STATE
   ============================================================ */
function renderEmpty(container) {
  container.innerHTML = `
  <div class="empty-state">
    <div class="empty-icon">${svgIcon('file-spreadsheet')}</div>
    <div style="text-align:center;display:flex;flex-direction:column;gap:8px">
      <h3 style="color:white;font-size:16px;font-weight:700">No Project Database Loaded</h3>
      <p style="color:var(--text-muted);font-size:12px;line-height:1.6">This management tracker relies on local spreadsheet data. Import your project tracking database (.xlsx) to analyze dashboards, timelines, and checklists.</p>
    </div>
    <button class="btn-primary" id="empty-import-btn">${svgIcon('upload')} Select Excel File</button>
  </div>`;
}

/* ============================================================
   16. MODALS
   ============================================================ */
function openModal(html, onMount) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';
  backdrop.innerHTML = `<div class="modal-box">${html}</div>`;
  document.body.appendChild(backdrop);
  lucide.createIcons();
  if (onMount) onMount(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  backdrop.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
}

function closeModal() {
  const modal = document.getElementById('active-modal');
  if (modal) modal.remove();
}

/* — Add/Edit Project — */
function openAddProjectModal() {
  const pm = state.teamMembers[0]?.name || '';
  const pmOptions = state.teamMembers.map(m => `<option value="${escHtml(m.name)}">${escHtml(m.name)} (${escHtml(m.role)})</option>`).join('');
  const todayStr = new Date().toISOString().split('T')[0];
  const oneMonthLater = new Date();
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];

  const departments = [...new Set(state.projects.map(p => p.Department).filter(Boolean))];
  const deptOptions = departments.map(d => `<option value="${escHtml(d)}"></option>`).join('');

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Create New Project</h3>
      <button class="modal-close">&times;</button>
    </div>
    <form id="add-project-form" class="space-y-4" style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project Name *</label>
          <input type="text" name="name" required class="form-input" placeholder="e.g. Finance Ledger Automation"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project Description</label>
          <textarea name="desc" rows="3" class="form-input" placeholder="Specify project scope, outputs and deliverables..."></textarea></div>
        <div class="form-group"><label class="form-label">Department *</label>
          <input type="text" name="dept" required class="form-input" list="existing-departments" placeholder="Select or type department...">
          <datalist id="existing-departments">
            ${deptOptions}
          </datalist>
        </div>
        <div class="form-group"><label class="form-label">Project Manager *</label>
          <select name="pm" class="form-input">${pmOptions}</select></div>
        <div class="form-group"><label class="form-label">Planned Start Date *</label>
          <input type="date" name="plannedStart" required class="form-input" value="${todayStr}"></div>
        <div class="form-group"><label class="form-label">Planned End Date *</label>
          <input type="date" name="plannedEnd" required class="form-input" value="${oneMonthLaterStr}"></div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn-primary">Create Project</button>
      </div>
    </form>`, (modal) => {
    modal.querySelector('#add-project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const newId = String(state.projects.length > 0 ? Math.max(...state.projects.map(p => Number(p.ID) || 0)) + 1 : 1);
      const newProj = {
        ID: newId,
        Name: fd.get('name'),
        Description: fd.get('desc'),
        Department: fd.get('dept') || 'Steel',
        ProjectManager: fd.get('pm') || pm,
        Spent: 0,
        BaseSpent: 0,
        PlannedStartDate: fd.get('plannedStart'),
        PlannedEndDate: fd.get('plannedEnd'),
        ActualStartDate: fd.get('plannedStart'),
        ActualEndDate: '',
        Progress: 0,
        Status: 'on-track',
        DaysDelayed: 0,
        Benefits: ''
      };
      state.projects = [...state.projects, newProj];
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      showToast(`Created Project: ${newProj.Name}`);
      closeModal();
      navigateTo('workspace', newId);
    });
  });
}

function openEditProjectModal() {
  const project = state.projects.find(p => p.ID === state.activeProjectId);
  if (!project) return;
  const pmOptions = state.teamMembers.map(m => `<option value="${escHtml(m.name)}" ${m.name === project.ProjectManager ? 'selected' : ''}>${escHtml(m.name)} (${escHtml(m.role)})</option>`).join('');
  const departments = [...new Set(state.projects.map(p => p.Department).filter(Boolean))];
  const deptOptions = departments.map(d => `<option value="${escHtml(d)}"></option>`).join('');

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Edit Project Workspace</h3>
      <button class="modal-close">&times;</button>
    </div>
    <form id="edit-project-form" class="space-y-4" style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project Name *</label>
          <input type="text" name="name" required class="form-input" value="${escHtml(project.Name)}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project Description</label>
          <textarea name="desc" rows="3" class="form-input">${escHtml(project.Description)}</textarea></div>
        <div class="form-group"><label class="form-label">Department *</label>
          <input type="text" name="dept" required class="form-input" list="existing-departments" value="${escHtml(project.Department)}">
          <datalist id="existing-departments">
            ${deptOptions}
          </datalist>
        </div>
        <div class="form-group"><label class="form-label">Project Manager *</label>
          <select name="pm" class="form-input">${pmOptions}</select></div>
        <div class="form-group"><label class="form-label">Spent (INR)</label>
          <input type="number" name="spent" class="form-input" value="${project.BaseSpent !== undefined ? project.BaseSpent : (project.Spent || 0)}"></div>
        <div class="form-group"><label class="form-label">Planned Start Date</label>
          <input type="date" name="plannedStart" class="form-input" value="${escHtml(project.PlannedStartDate || '')}"></div>
        <div class="form-group"><label class="form-label">Planned End Date</label>
          <input type="date" name="plannedEnd" class="form-input" value="${escHtml(project.PlannedEndDate || '')}"></div>
        <div class="form-group"><label class="form-label">Actual Start Date</label>
          <input type="date" name="actualStart" class="form-input" value="${escHtml(project.ActualStartDate || '')}"></div>
        <div class="form-group"><label class="form-label">Actual End Date</label>
          <input type="date" name="actualEnd" class="form-input" value="${escHtml(project.ActualEndDate || '')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Project Benefits / Savings (e.g. 10 man days, ₹250000)</label>
          <input type="text" name="benefits" class="form-input" value="${escHtml(project.Benefits || '')}"></div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn-primary">Save Changes</button>
      </div>
    </form>`, (modal) => {
    modal.querySelector('#edit-project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const baseSpent = Number(fd.get('spent')) || 0;
      const updated = { ...project, Name: fd.get('name'), Description: fd.get('desc'), Department: fd.get('dept'), ProjectManager: fd.get('pm'), BaseSpent: baseSpent, Spent: baseSpent, PlannedStartDate: fd.get('plannedStart'), PlannedEndDate: fd.get('plannedEnd'), ActualStartDate: fd.get('actualStart'), ActualEndDate: fd.get('actualEnd'), Benefits: fd.get('benefits') };
      state.projects = state.projects.map(p => p.ID === project.ID ? updated : p);
      recalculateAll();
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      showToast('Project workspace details updated.');
      closeModal();
      render();
    });
  });
}

/* — Add/Edit Task — */
function openAddTaskModal() {
  openTaskModal(null);
}

function openEditTaskModal(taskId) {
  const task = state.tasks.find(t => t.ProjectID === state.activeProjectId && t.ID === taskId);
  if (task) openTaskModal(task);
}

function openTaskModal(task) {
  const isEditing = !!task;
  const projectTasks = state.tasks.filter(t => t.ProjectID === state.activeProjectId);
  const topLevelIds = projectTasks.map(t => t.ID).filter(id => !id.includes('.')).map(Number).filter(n => !isNaN(n));
  const nextId = topLevelIds.length > 0 ? Math.max(...topLevelIds) + 1 : 1;
  const defaultTaskId = isEditing ? task.ID : String(nextId);

  const pmOptions = state.teamMembers.map(m => `<option value="${escHtml(m.name)}" ${task && task.Assignee === m.name ? 'selected' : (!task && m === state.teamMembers[0]) ? 'selected' : ''}>${escHtml(m.name)}</option>`).join('');
  const reporterOptions = `<option value="">Select reporter</option>${state.teamMembers.map(m => `<option value="${escHtml(m.name)}" ${task && task.DelayReportedBy === m.name ? 'selected' : ''}>${escHtml(m.name)}</option>`).join('')}`;

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">${isEditing ? 'Edit Checklist Task' : 'Add Checklist Task'}</h3>
      <button class="modal-close">&times;</button>
    </div>
    <form id="task-form" class="space-y-4" style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label class="form-label">Task ID * (e.g. 1, 1.1, 1.1.1)</label>
          <input type="text" name="taskId" required class="form-input" placeholder="e.g. 1.2" value="${escHtml(defaultTaskId)}"></div>
        <div class="form-group"><label class="form-label">Assignee *</label>
          <select name="assignee" class="form-input">${pmOptions}</select></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Activity Name *</label>
          <input type="text" name="taskName" required class="form-input" value="${escHtml(task ? task.Name : '')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Predecessors (comma-separated, e.g. 1.1, 1.2SS, 1.3FF, 1.4SF)</label>
          <input type="text" name="dependencies" class="form-input" placeholder="e.g. 1.1, 1.2SS" value="${escHtml(task && task.Dependencies ? task.Dependencies : '')}"></div>
        <div class="form-group"><label class="form-label">Planned Start Date</label>
          <input type="date" name="plannedStart" class="form-input" value="${escHtml(task ? task.PlannedStartDate || '' : '')}"></div>
        <div class="form-group"><label class="form-label">Planned End Date</label>
          <input type="date" name="plannedEnd" class="form-input" value="${escHtml(task ? task.PlannedEndDate || '' : '')}"></div>
        <div class="form-group"><label class="form-label">Actual Start Date</label>
          <input type="date" name="actualStart" class="form-input" value="${escHtml(task ? task.ActualStartDate || '' : '')}"></div>
        <div class="form-group"><label class="form-label">Actual End Date</label>
          <input type="date" name="actualEnd" class="form-input" value="${escHtml(task ? task.ActualEndDate || '' : '')}"></div>
        <div class="form-group" style="grid-column:1/-1;padding-top:12px;border-top:1px solid var(--slate-800)">
          <h4 style="font-weight:600;color:var(--text-secondary);margin-bottom:12px;font-size:12px">Timeline Delay Documentation (Fill if delayed)</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">Reported By</label>
              <select name="reportedBy" class="form-input">${reporterOptions}</select></div>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">Delay Root Cause</label>
              <input type="text" name="delayReason" class="form-input" placeholder="e.g. Server downtime, awaiting API specifications..." value="${escHtml(task ? task.DelayReason || '' : '')}"></div>
            <div class="form-group" style="grid-column:1/-1"><label class="form-label">Downstream Impact</label>
              <input type="text" name="delayImpact" class="form-input" placeholder="e.g. Delays staging deploy, blocks UAT start..." value="${escHtml(task ? task.DelayImpact || '' : '')}"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn-primary">Save Task</button>
      </div>
    </form>`, (modal) => {
    const taskIdInput = modal.querySelector('input[name="taskId"]');
    const startInput = modal.querySelector('input[name="plannedStart"]');
    const endInput = modal.querySelector('input[name="plannedEnd"]');

    const handleTaskIdChange = () => {
      const val = taskIdInput.value.trim();
      if (!val) return;

      const project = state.projects.find(p => p.ID === state.activeProjectId);
      if (!project) return;

      let parentStart = project.PlannedStartDate || '';
      let parentEnd = project.PlannedEndDate || '';

      const lastDotIndex = val.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        const parentId = val.substring(0, lastDotIndex);
        const parentTask = state.tasks.find(t => t.ProjectID === state.activeProjectId && t.ID === parentId);
        if (parentTask) {
          parentStart = parentTask.PlannedStartDate || parentStart;
          parentEnd = parentTask.PlannedEndDate || parentEnd;

          // Auto-assign parent's assignee if adding new task
          if (!isEditing && parentTask.Assignee) {
            const assigneeSelect = modal.querySelector('select[name="assignee"]');
            if (assigneeSelect) assigneeSelect.value = parentTask.Assignee;
          }
        }
      }

      // Populate default dates if they are empty
      if (!startInput.value && parentStart) {
        startInput.value = parentStart;
      }
      if (!endInput.value && parentEnd) {
        endInput.value = parentEnd;
      }

      // Set min and max limits
      if (parentStart) {
        startInput.setAttribute('min', parentStart);
        endInput.setAttribute('min', parentStart);
      }
      if (parentEnd) {
        startInput.setAttribute('max', parentEnd);
        endInput.setAttribute('max', parentEnd);
      }
    };

    taskIdInput.addEventListener('input', handleTaskIdChange);
    taskIdInput.addEventListener('change', handleTaskIdChange);
    taskIdInput.addEventListener('blur', handleTaskIdChange);

    // Run once on load
    handleTaskIdChange();

    modal.querySelector('#task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const depStr = fd.get('dependencies') || '';
      const deps = parseDependencies(depStr);

      for (const d of deps) {
        const exists = state.tasks.some(t => t.ProjectID === state.activeProjectId && t.ID === d.predecessorId && t.ID !== fd.get('taskId'));
        if (!exists) {
          showToast(`Predecessor task ${d.predecessorId} not found in this project.`, 'error');
          return;
        }
        if (wouldCreateCycle(state.activeProjectId, fd.get('taskId'), d.predecessorId)) {
          showToast(`Adding predecessor ${d.predecessorId} creates a circular dependency loop!`, 'error');
          return;
        }
      }

      const updatedTask = {
        ID: fd.get('taskId'),
        ProjectID: state.activeProjectId,
        Name: fd.get('taskName'),
        Assignee: fd.get('assignee'),
        PlannedStartDate: fd.get('plannedStart'),
        PlannedEndDate: fd.get('plannedEnd'),
        ActualStartDate: fd.get('actualStart'),
        ActualEndDate: fd.get('actualEnd'),
        Progress: task ? task.Progress || 0 : 0,
        Status: task ? task.Status || 'not-started' : 'not-started',
        DaysDelayed: task ? task.DaysDelayed || 0 : 0,
        DelayReason: fd.get('delayReason'),
        DelayImpact: fd.get('delayImpact'),
        DelayReportedBy: fd.get('reportedBy'),
        Dependencies: depStr
      };

      let newTasks = [...state.tasks];
      if (isEditing) {
        newTasks = newTasks.map(t => (t.ProjectID === state.activeProjectId && t.ID === task.ID) ? updatedTask : t);
      } else {
        newTasks.push(updatedTask);
      }

      state.tasks = newTasks;
      propagateSchedule(state.activeProjectId);
      const { updatedProjects } = performProjectRollups(state.activeProjectId, state.tasks, state.projects);
      state.projects = updatedProjects;

      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      showToast(isEditing ? 'Task updated.' : 'Task added.');
      closeModal();
      render();
    });
  });
}

/* — Add/Edit Kaizen — */
function openAddKaizenModal() {
  openKaizenModal(null);
}

function openEditKaizenModal(kaizen) {
  openKaizenModal(kaizen);
}

function openKaizenModal(kaizen) {
  const isEditing = !!kaizen;
  const gradeOptions = ['L1', 'L2', 'L3'].map(g => `<option value="${g}" ${kaizen && kaizen.Grade === g ? 'selected' : ''}>Grade ${g}</option>`).join('');

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">${isEditing ? 'Edit Kaizen Initiative' : 'Add Kaizen Initiative'}</h3>
      <button class="modal-close">&times;</button>
    </div>
    <form id="kaizen-form" class="space-y-4" style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label class="form-label">Kaizen ID * (e.g. K1, K2)</label>
          <input type="text" name="kaizenId" required class="form-input" placeholder="e.g. K1" value="${escHtml(kaizen ? kaizen.ID : '')}" ${isEditing ? 'readonly' : ''}></div>
        <div class="form-group"><label class="form-label">Grade *</label>
          <select name="grade" class="form-input">${gradeOptions}</select></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Title / Description *</label>
          <input type="text" name="title" required class="form-input" placeholder="e.g. Automate form field extraction using AI" value="${escHtml(kaizen ? kaizen.Title : '')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Uploaded On (Date)</label>
          <input type="date" name="uploadedOn" class="form-input" value="${escHtml(kaizen ? kaizen.UploadedOn || '' : '')}"></div>
        <div class="form-group"><label class="form-label">Approved by L+1 (Date)</label>
          <input type="date" name="approvedL1" class="form-input" value="${escHtml(kaizen ? kaizen.ApprovedL1 || '' : '')}"></div>
        <div class="form-group"><label class="form-label">Approved by L+2 (Date)</label>
          <input type="date" name="approvedL2" class="form-input" value="${escHtml(kaizen ? kaizen.ApprovedL2 || '' : '')}"></div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn-primary">Save Kaizen</button>
      </div>
    </form>`, (modal) => {
    modal.querySelector('#kaizen-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updatedKaizen = {
        ProjectID: state.activeProjectId,
        ID: fd.get('kaizenId'),
        Title: fd.get('title'),
        Grade: fd.get('grade'),
        UploadedOn: fd.get('uploadedOn') || '',
        ApprovedL1: fd.get('approvedL1') || '',
        ApprovedL2: fd.get('approvedL2') || ''
      };

      let newKaizens = [...state.kaizens];
      if (isEditing) {
        newKaizens = newKaizens.map(k => (k.ProjectID === state.activeProjectId && k.ID === kaizen.ID) ? updatedKaizen : k);
      } else {
        newKaizens.push(updatedKaizen);
      }
      state.kaizens = newKaizens;
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs, state.kaizens);
      showToast(isEditing ? 'Kaizen updated.' : 'Kaizen added.');
      closeModal();
      render();
    });
  });
}

/* — Add/Edit SRF — */
function openAddSRFModal() {
  openSRFModal(null);
}

function openEditSRFModal(srfNo) {
  const srfItem = state.srfs.find(s => s.ProjectID === state.activeProjectId && s.SRFNo === srfNo);
  if (srfItem) openSRFModal(srfItem);
}

function openSRFModal(srfItem) {
  const isEditing = !!srfItem;
  const project = state.projects.find(p => p.ID === state.activeProjectId);
  const projectSRFs = state.srfs.filter(s => s.ProjectID === state.activeProjectId);
  const defaultSRFNo = `SRF-${state.activeProjectId}-${projectSRFs.length + 1}`;

  const statusOptions = SRF_STEPS.map(s => `<option value="${escHtml(s.label)}" ${srfItem && srfItem.Status === s.label ? 'selected' : ''}>${escHtml(s.label)}</option>`).join('');
  const dateInputs = SRF_STEPS.map(step => `<div class="form-group"><label class="form-label">${escHtml(step.label)}</label>
    <input type="date" name="date_${step.key}" class="form-input" value="${escHtml(srfItem ? srfItem[step.key] || '' : '')}"></div>`).join('');

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">${isEditing ? 'Edit SRF Contract' : 'Add SRF Contract'}</h3>
      <button class="modal-close">&times;</button>
    </div>
    <form id="srf-form" class="space-y-4" style="font-size:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label class="form-label">SRF Number *</label>
          <input type="text" name="srfNo" required class="form-input" value="${escHtml(srfItem ? srfItem.SRFNo : defaultSRFNo)}"></div>
        <div class="form-group"><label class="form-label">User (Requester) *</label>
          <input type="text" name="user" required class="form-input" value="${escHtml(srfItem ? srfItem.User : project?.ProjectManager || '')}"></div>
        <div class="form-group" style="grid-column:1/-1"><label class="form-label">Developments Scope Description *</label>
          <input type="text" name="developments" required class="form-input" placeholder="e.g. Master forms integration, webhooks Callback module..." value="${escHtml(srfItem ? srfItem.Developments : '')}"></div>
        <div class="form-group"><label class="form-label">Mandays FC (Functional) *</label>
          <input type="number" name="mandaysFC" required class="form-input" value="${srfItem ? srfItem.MandaysFC : 0}"></div>
        <div class="form-group"><label class="form-label">Mandays TC (Technical) *</label>
          <input type="number" name="mandaysTC" required class="form-input" value="${srfItem ? srfItem.MandaysTC : 0}"></div>
        <div class="form-group"><label class="form-label">Development Cost (INR) *</label>
          <input type="number" name="cost" required class="form-input" value="${srfItem ? srfItem.Cost : 0}"></div>
        <div class="form-group"><label class="form-label">Status Stage *</label>
          <select name="status" class="form-input">${statusOptions}</select></div>
        <div class="form-group" style="grid-column:1/-1;padding-top:12px;border-top:1px solid var(--slate-800)">
          <h4 style="font-weight:600;color:var(--text-secondary);margin-bottom:12px">Milestone Phase Dates (YYYY-MM-DD)</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${dateInputs}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="submit" class="btn-primary" style="background:var(--rose-500)">Save SRF Contract</button>
      </div>
    </form>`, (modal) => {
    modal.querySelector('#srf-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const srfEntry = {
        ProjectID: state.activeProjectId,
        SRFNo: fd.get('srfNo'),
        Developments: fd.get('developments'),
        User: fd.get('user'),
        MandaysFC: Number(fd.get('mandaysFC')),
        MandaysTC: Number(fd.get('mandaysTC')),
        TotalMandays: Number(fd.get('mandaysFC')) + Number(fd.get('mandaysTC')),
        Cost: Number(fd.get('cost')),
        Status: fd.get('status'),
        ...Object.fromEntries(SRF_STEPS.map(s => [s.key, fd.get(`date_${s.key}`) || '']))
      };
      let newSRFs = [...state.srfs];
      if (isEditing) {
        newSRFs = newSRFs.map(s => (s.ProjectID === state.activeProjectId && s.SRFNo === srfItem.SRFNo) ? srfEntry : s);
      } else {
        newSRFs.push(srfEntry);
      }
      const { updatedProjects } = performProjectRollups(state.activeProjectId, state.tasks, state.projects, newSRFs);
      state.srfs = newSRFs;
      state.projects = updatedProjects;
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      showToast('SRF records updated.');
      closeModal();
      render();
    });
  });
}

/* ============================================================
   17. EVENT SETUP (called after each render)
   ============================================================ */
function setupViewEvents() {
  const vc = document.getElementById('view-container');
  if (!vc) return;

  // Dashboard events
  vc.querySelector('#clear-dept-filter')?.addEventListener('click', () => { state.selectedDept = null; render(); });
  vc.querySelector('#clear-dept-filter2')?.addEventListener('click', () => { state.selectedDept = null; render(); });
  vc.querySelector('#btn-convert-financial')?.addEventListener('click', () => { updateBenefitsUI(true); });
  vc.querySelector('#btn-show-mandays')?.addEventListener('click', () => { updateBenefitsUI(false); });

  vc.querySelectorAll('.dept-vertical-bar-col, .dept-chart-bar-row, .dept-item').forEach(el => {
    el.addEventListener('click', () => {
      const dept = el.dataset.dept;
      state.selectedDept = state.selectedDept === dept ? null : dept;
      render();
    });
  });

  vc.querySelectorAll('.project-list-row, .benefit-row').forEach(el => {
    el.addEventListener('click', () => navigateTo('workspace', el.dataset.projId));
  });

  // Projects page events
  const projSearch = vc.querySelector('#proj-search');
  if (projSearch) {
    projSearch.addEventListener('input', (e) => {
      state.projectSearch = e.target.value;
      const grid = vc.querySelector('.projects-grid');
      if (grid) {
        grid.innerHTML = getProjectCardsHTML();
        grid.querySelectorAll('.project-card').forEach(el => {
          el.addEventListener('click', () => navigateTo('workspace', el.dataset.projId));
        });
      }
    });
    projSearch.focus();
  }
  vc.querySelector('#proj-dept-filter')?.addEventListener('change', (e) => { state.projectDeptFilter = e.target.value; render(); });
  vc.querySelector('#proj-status-filter')?.addEventListener('change', (e) => { state.projectStatusFilter = e.target.value; render(); });
  vc.querySelector('#proj-sort')?.addEventListener('change', (e) => { state.projectSortBy = e.target.value; render(); });
  vc.querySelector('#clear-filters-btn')?.addEventListener('click', () => {
    state.projectSearch = '';
    state.projectDeptFilter = '';
    state.projectStatusFilter = '';
    state.projectSortBy = 'name';
    render();
  });
  vc.querySelectorAll('.project-card').forEach(el => {
    el.addEventListener('click', () => navigateTo('workspace', el.dataset.projId));
  });

  // Workspace events
  vc.querySelector('#ws-back-btn')?.addEventListener('click', () => navigateTo('projects'));
  vc.querySelector('#ws-edit-btn')?.addEventListener('click', openEditProjectModal);
  vc.querySelector('#ws-delete-btn')?.addEventListener('click', () => {
    if (window.confirm('Are you sure you want to delete this project? All associated tasks and SRFs will be deleted.')) {
      const id = state.activeProjectId;
      state.projects = state.projects.filter(p => p.ID !== id);
      state.tasks = state.tasks.filter(t => t.ProjectID !== id);
      state.srfs = state.srfs.filter(s => s.ProjectID !== id);
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      showToast('Project deleted.');
      navigateTo(state.projects.length > 0 ? 'projects' : 'empty');
    }
  });

  vc.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.workspaceTab = btn.dataset.tab; render(); });
  });

  if (state.workspaceTab === 'gantt') {
    initGanttViewEvents();
  }

  // Task events
  vc.querySelector('#add-task-btn')?.addEventListener('click', openAddTaskModal);
  vc.querySelector('#task-assignee-filter')?.addEventListener('change', (e) => { state.taskAssigneeFilter = e.target.value; render(); });

  const todayStr = new Date().toISOString().split('T')[0];

  vc.querySelectorAll('.task-start-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const taskId = e.target.dataset.taskId;
      const isChecked = e.target.checked;

      if (!isChecked) {
        const confirmClear = window.confirm("Are you sure you want to remove the start date? This will clear start and end dates for this task and all its subtasks.");
        if (!confirmClear) {
          e.target.checked = true;
          return;
        }
      }

      let newTasks = state.tasks.map(t => {
        if (t.ProjectID === state.activeProjectId && (t.ID === taskId || t.ID.startsWith(taskId + '.'))) {
          const updated = { ...t };
          if (isChecked) {
            updated.ActualStartDate = t.ActualStartDate || todayStr;
          } else {
            updated.ActualStartDate = '';
            updated.ActualEndDate = '';
            updated.Progress = 0;
            updated.Status = 'not-started';
          }
          return updated;
        }
        return t;
      });
      const { updatedProjects } = performProjectRollups(state.activeProjectId, newTasks, state.projects);
      state.tasks = newTasks;
      state.projects = updatedProjects;
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      render();
    });
  });

  vc.querySelectorAll('.task-complete-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const taskId = e.target.dataset.taskId;
      const isChecked = e.target.checked;

      if (!isChecked) {
        const confirmClear = window.confirm("Are you sure you want to remove the completion date? This will reset the completion status for this task and all its subtasks.");
        if (!confirmClear) {
          e.target.checked = true;
          return;
        }
      }

      let newTasks = state.tasks.map(t => {
        if (t.ProjectID === state.activeProjectId && (t.ID === taskId || t.ID.startsWith(taskId + '.'))) {
          const updated = { ...t };
          if (isChecked) {
            updated.ActualEndDate = t.ActualEndDate || todayStr;
            updated.ActualStartDate = t.ActualStartDate || todayStr;
          } else {
            updated.ActualEndDate = '';
            updated.Status = 'in-progress';
            if (updated.Progress === 100) {
              updated.Progress = 50;
            }
          }
          return updated;
        }
        return t;
      });
      const { updatedProjects } = performProjectRollups(state.activeProjectId, newTasks, state.projects);
      state.tasks = newTasks;
      state.projects = updatedProjects;
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      render();
    });
  });

  vc.querySelectorAll('.task-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      if (!state.collapsedTasks) state.collapsedTasks = [];
      const idx = state.collapsedTasks.indexOf(taskId);
      if (idx > -1) {
        state.collapsedTasks.splice(idx, 1);
      } else {
        state.collapsedTasks.push(taskId);
      }
      render();
    });
  });

  vc.querySelectorAll('.task-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditTaskModal(btn.dataset.taskId); });
  });

  vc.querySelectorAll('.task-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.confirm('Delete this task? Sub-tasks will remain but lose their parent rollup connection.')) {
        const taskId = btn.dataset.taskId;
        state.tasks = state.tasks.filter(t => !(t.ProjectID === state.activeProjectId && t.ID === taskId));
        saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
        render();
      }
    });
  });

  // SRF events
  vc.querySelector('#add-srf-btn')?.addEventListener('click', openAddSRFModal);
  vc.querySelector('#edit-srf-btn')?.addEventListener('click', () => {
    const srfs = state.srfs.filter(s => s.ProjectID === state.activeProjectId);
    const idx = Math.min(state.selectedSRFIndex, srfs.length - 1);
    if (srfs[idx]) openEditSRFModal(srfs[idx].SRFNo);
  });
  vc.querySelector('#delete-srf-btn')?.addEventListener('click', () => {
    const srfs = state.srfs.filter(s => s.ProjectID === state.activeProjectId);
    const idx = Math.min(state.selectedSRFIndex, srfs.length - 1);
    const srfItem = srfs[idx];
    if (!srfItem) return;
    if (window.confirm('Are you sure you want to delete this SRF?')) {
      state.srfs = state.srfs.filter(s => !(s.ProjectID === state.activeProjectId && s.SRFNo === srfItem.SRFNo));
      state.selectedSRFIndex = 0;
      const { updatedProjects } = performProjectRollups(state.activeProjectId, state.tasks, state.projects);
      state.projects = updatedProjects;
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      render();
    }
  });

  vc.querySelectorAll('.srf-tab').forEach(btn => {
    btn.addEventListener('click', () => { state.selectedSRFIndex = Number(btn.dataset.srfIndex); render(); });
  });

  vc.querySelectorAll('.srf-step-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const stepIdx = Number(e.target.dataset.stepIndex);
      const srfNo = e.target.dataset.srfNo;
      const srfItem = state.srfs.find(s => s.ProjectID === state.activeProjectId && s.SRFNo === srfNo);
      if (!srfItem) return;
      const step = SRF_STEPS[stepIdx];
      const isStepDone = !!srfItem[step.key];
      const newDateVal = isStepDone ? '' : new Date().toISOString().split('T')[0];
      const updated = { ...srfItem, [step.key]: newDateVal };
      let latestStatus = 'Uploaded On';
      for (let i = SRF_STEPS.length - 1; i >= 0; i--) {
        const s = SRF_STEPS[i];
        if ((i === stepIdx && !isStepDone) || (i !== stepIdx && !!srfItem[s.key])) {
          latestStatus = s.label; break;
        }
      }
      updated.Status = latestStatus;
      state.srfs = state.srfs.map(s => (s.ProjectID === state.activeProjectId && s.SRFNo === srfNo) ? updated : s);
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs);
      render();
    });
  });

  // Kaizen events
  vc.querySelector('#add-kaizen-btn')?.addEventListener('click', openAddKaizenModal);
  vc.querySelectorAll('.kaizen-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const kId = btn.dataset.kaizenId;
      const kaizen = state.kaizens.find(k => k.ProjectID === state.activeProjectId && k.ID === kId);
      if (kaizen) openEditKaizenModal(kaizen);
    });
  });
  vc.querySelectorAll('.kaizen-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const kId = btn.dataset.kaizenId;
      if (window.confirm('Are you sure you want to delete this Kaizen?')) {
        state.kaizens = state.kaizens.filter(k => !(k.ProjectID === state.activeProjectId && k.ID === kId));
        saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs, state.kaizens);
        render();
      }
    });
  });
  vc.querySelectorAll('.kaizen-step-check').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const stepKey = e.target.dataset.stepKey;
      const kaizenId = e.target.dataset.kaizenId;
      const kaizenItem = state.kaizens.find(k => k.ProjectID === state.activeProjectId && k.ID === kaizenId);
      if (!kaizenItem) return;
      const isDone = !!kaizenItem[stepKey];
      const newDateVal = isDone ? '' : new Date().toISOString().split('T')[0];
      const updated = { ...kaizenItem, [stepKey]: newDateVal };
      state.kaizens = state.kaizens.map(k => (k.ProjectID === state.activeProjectId && k.ID === kaizenId) ? updated : k);
      saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs, state.kaizens);
      render();
    });
  });

  // Empty state
  vc.querySelector('#empty-import-btn')?.addEventListener('click', () => {
    document.getElementById('excel-import-input').click();
  });
}

/* ============================================================
   18. STATIC UI SETUP (sidebar, header, etc.)
   ============================================================ */
function buildSidebarHTML() {
  return `
  <div class="sidebar-top">
    <div class="sidebar-brand">
      <span class="brand-emoji">🐊</span>
      <span class="brand-name">Nava<span>Gator</span></span>
    </div>
    <nav class="sidebar-nav">
      <button class="nav-btn" data-view="dashboard">${svgIcon('layout-dashboard')} Dashboard</button>
      <button class="nav-btn" data-view="projects">${svgIcon('folder-kanban')} Projects</button>
      <button class="nav-btn" data-view="team">${svgIcon('users')} Team</button>
    </nav>
  </div>
  <div class="sidebar-footer">
    <input type="file" id="excel-import-input" accept=".xlsx,.xls" style="display:none">
    <div class="sidebar-action-row">
      <button class="sidebar-action-btn" id="import-btn">${svgIcon('upload')} Import</button>
      <button class="sidebar-action-btn" id="export-btn" disabled>${svgIcon('download')} Export</button>
    </div>
    <div class="sidebar-meta">
      <span>Version 2.0.0</span>
      <button class="theme-btn" id="theme-btn" title="Toggle Theme">${svgIcon(state.theme === 'dark' ? 'sun' : 'moon')}</button>
    </div>
  </div>`;
}

function setupStaticEvents() {
  // Nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeProjectId = null;
      navigateTo(btn.dataset.view);
    });
  });

  // Theme toggle
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
  });

  // Department filter (in header)
  document.getElementById('header-dept-filter')?.addEventListener('change', (e) => {
    state.selectedDept = e.target.value || null;
    render();
  });

  // Import button
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('excel-import-input').click();
  });

  // File import
  document.getElementById('excel-import-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.isLoading = true;
    render();
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseExcelBuffer(evt.target.result);
        let importedMembers = parsed.teamMembers || [];
        if (importedMembers.length === 0) {
          const names = new Set();
          parsed.projects.forEach(p => p.ProjectManager && names.add(p.ProjectManager));
          parsed.tasks.forEach(t => t.Assignee && names.add(t.Assignee));
          importedMembers = [...names].map((name, i) => ({
            id: `tm${i + 1}`, name, role: 'Consultant', department: 'steel'
          }));
        }
        state.projects = parsed.projects;
        state.tasks = parsed.tasks;
        state.teamMembers = importedMembers;
        state.srfs = parsed.srfs;
        state.kaizens = parsed.kaizens || [];
        initBaseSpent();
        recalculateAll();
        state.currentView = state.projects.length > 0 ? 'dashboard' : 'empty';
        saveStateToServer(state.projects, state.tasks, state.teamMembers, state.srfs, state.kaizens);
        showToast('Database imported successfully!');
      } catch (err) {
        console.error('Import failed:', err);
        showToast('Invalid Excel database schema', 'error');
        state.currentView = 'empty';
      } finally {
        state.isLoading = false;
        e.target.value = '';
        render();
        updateExportBtn();
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Export button
  document.getElementById('export-btn')?.addEventListener('click', async () => {
    try {
      const buffer = await exportExcelWorkbook({ projects: state.projects, tasks: state.tasks, teamMembers: state.teamMembers, srfs: state.srfs });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'database.xlsx';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Workbook downloaded successfully!');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Failed to compile workbook', 'error');
    }
  });

  // Create project button (in header)
  document.getElementById('create-project-btn')?.addEventListener('click', openAddProjectModal);
}

function updateExportBtn() {
  const btn = document.getElementById('export-btn');
  if (btn) btn.disabled = state.projects.length === 0;
}

/* ============================================================
   19. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Build sidebar
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) {
    sidebar.innerHTML = buildSidebarHTML();
    lucide.createIcons({ nodes: [sidebar] });
  }

  applyTheme();
  setupStaticEvents();
  await initDatabase();
  updateExportBtn();
});
