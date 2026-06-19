/* app.js - Core Logic for Enterprise Project Tracker */

// App State
let state = {
  projects: [],
  teamMembers: [],
  tasks: [],
  delays: [],
  benefitsConverted: false
};

// Global active project ID for details view
let currentProjectId = null;
let ganttViewScale = 'month';

// Track collapsed state of Gantt tasks (keys are task IDs, value = true means collapsed)
let ganttCollapsedTasks = {};

// Theme state: 'dark' (default) or 'light'
let currentTheme = localStorage.getItem('tracker_theme') || 'dark';

// Helper: Parse Excel date serial number or string to YYYY-MM-DD
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
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return str;
}

// Helper: Parse Project Benefits into currency/cost or man days
function parseBenefits(benefitsStr) {
  if (!benefitsStr) return { type: 'unknown', value: 0, text: 'N/A' };
  const str = String(benefitsStr).trim();
  if (!str) return { type: 'unknown', value: 0, text: 'N/A' };

  // Check for man days
  const manDaysMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:man\s*days|mandays|man-days|md)$/i);
  if (manDaysMatch) {
    const val = parseFloat(manDaysMatch[1]);
    return { type: 'mandays', value: val, text: `${val} Man-Days` };
  }

  // Check if it has numeric content
  const cleanStr = str.replace(/[₹$,\s]/g, '');
  const num = parseFloat(cleanStr);
  if (!isNaN(num)) {
    return { type: 'cost', value: num, text: formatCurrency(num) };
  }

  return { type: 'text', value: 0, text: str };
}

// Render Project Benefits Widget on Dashboard
function renderBenefitsWidget() {
  const container = document.getElementById('benefits-widget-container');
  if (!container) return;

  let totalCostSavings = 0;
  let totalManDaysSaved = 0;
  const projectsBenefitsList = [];

  state.projects.forEach(p => {
    const parsed = parseBenefits(p.Benefits);
    if (parsed.type === 'cost') {
      totalCostSavings += parsed.value;
    } else if (parsed.type === 'mandays') {
      totalManDaysSaved += parsed.value;
    }
  });

  const convertedSaving = totalManDaysSaved * 2500;
  const finalFinancialValue = state.benefitsConverted ? (totalCostSavings + convertedSaving) : totalCostSavings;

  // Generate breakdown list
  const breakdownHtml = state.projects.map(p => {
    const parsed = parseBenefits(p.Benefits);
    if (!p.Benefits) return '';

    let displayText = p.Benefits;
    let badgeClass = 'badge-completed';

    if (parsed.type === 'cost') {
      displayText = formatCurrency(parsed.value);
      badgeClass = 'badge-on-track';
    } else if (parsed.type === 'mandays') {
      displayText = state.benefitsConverted ? formatCurrency(parsed.value * 2500) : `${parsed.value} Man-Days`;
      badgeClass = state.benefitsConverted ? 'badge-on-track' : 'badge-completed';
    }

    const capitalizedDept = p.Department === 'it' ? 'IT' : (p.Department === 'exim' ? 'EXIM' : (p.Department === 'MDM' ? 'MDM' : p.Department.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')));

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
        <div style="min-width: 0; flex: 1; padding-right: 12px;">
          <div style="font-size: 13px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.Name}</div>
          <div style="font-size: 10px; color: var(--text-muted); text-transform: capitalize; margin-top: 1px;">${capitalizedDept}</div>
        </div>
        <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 8px; border-radius: 4px; transition: all 0.3s ease;">
          ${displayText}
        </span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="benefits-widget" style="display: flex; flex-direction: column; gap: 20px; min-height: 230px;">
      <div id="benefits-kpis-wrapper" class="benefits-summary-kpis ${state.benefitsConverted ? 'converted' : ''}" style="display: flex; gap: 16px; position: relative; overflow: hidden; height: 72px;">
        
        <!-- Cost Savings KPI Card -->
        <div id="kpi-financial-savings" class="kpi-card financial-card" style="flex: 1; background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05)); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-md); padding: 14px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.05); cursor: pointer; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);">
          <div style="background-color: rgba(16, 185, 129, 0.2); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-success); flex-shrink: 0;">
            <i data-lucide="indian-rupee" style="width: 20px; height: 20px;"></i>
          </div>
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">Financial Savings</div>
            <div id="financial-savings-value" style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-top: 2px;">${formatCurrency(finalFinancialValue)}</div>
          </div>
        </div>

        <!-- Man Days Saved KPI Card -->
        <div id="kpi-mandays-saved" class="kpi-card mandays-card" style="flex: 1; background: linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(236, 72, 153, 0.05)); border: 1px solid rgba(236, 72, 153, 0.25); border-radius: var(--radius-md); padding: 14px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(236, 72, 153, 0.05); cursor: pointer; transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; max-width: 350px;">
          <div style="background-color: rgba(236, 72, 153, 0.2); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-info); flex-shrink: 0;">
            <i data-lucide="calendar" style="width: 20px; height: 20px;"></i>
          </div>
          <div class="mandays-content" style="transition: opacity 0.3s ease;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;">Man-Days Saved</div>
            <div style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-top: 2px;">${totalManDaysSaved} Days</div>
          </div>
        </div>

      </div>

      <!-- Scrollable Breakdown list of benefits -->
      <div class="benefits-breakdown-list" style="flex: 1; overflow-y: auto; background-color: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 12px; max-height: 130px;">
        ${breakdownHtml.trim() === '' ?
      `<div style="text-align: center; color: var(--text-secondary); padding: 24px; font-size: 13px;">No project benefits logged yet.</div>` :
      breakdownHtml
    }
      </div>
    </div>
  `;
  lucide.createIcons();
  setupBenefitsInteraction();
}

function setupBenefitsInteraction() {
  const cardMandays = document.getElementById('kpi-mandays-saved');
  const cardFinancial = document.getElementById('kpi-financial-savings');
  
  if (cardMandays) {
    cardMandays.addEventListener('click', () => {
      if (!state.benefitsConverted) {
        animateBenefitsToggled(true);
      }
    });
  }

  if (cardFinancial) {
    cardFinancial.addEventListener('click', () => {
      if (state.benefitsConverted) {
        animateBenefitsToggled(false);
      }
    });
  }
}

function animateBenefitsToggled(converted) {
  state.benefitsConverted = converted;
  saveState();

  const wrapper = document.getElementById('benefits-kpis-wrapper');
  const financialValueNode = document.getElementById('financial-savings-value');
  
  let totalCostSavings = 0;
  let totalManDaysSaved = 0;

  state.projects.forEach(p => {
    const parsed = parseBenefits(p.Benefits);
    if (parsed.type === 'cost') {
      totalCostSavings += parsed.value;
    } else if (parsed.type === 'mandays') {
      totalManDaysSaved += parsed.value;
    }
  });

  const convertedSaving = totalManDaysSaved * 2500;
  const startVal = converted ? totalCostSavings : (totalCostSavings + convertedSaving);
  const endVal = converted ? (totalCostSavings + convertedSaving) : totalCostSavings;

  // Toggle classes for layout transition
  if (wrapper) {
    if (converted) {
      wrapper.classList.add('converted');
    } else {
      wrapper.classList.remove('converted');
    }
  }

  // Animate counter number
  const duration = 500; // ms
  const startTime = performance.now();

  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (easeOutQuad)
    const ease = progress * (2 - progress);
    const currentVal = Math.round(startVal + (endVal - startVal) * ease);
    
    if (financialValueNode) {
      financialValueNode.textContent = formatCurrency(currentVal);
    }
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    } else {
      // Re-render full widget at the end to refresh project breakdown items list and badge styles
      renderBenefitsWidget();
    }
  }

  requestAnimationFrame(updateCounter);
}

// Fallback mock data has been removed to enforce empty database initialization.

// Helper: Save current state to localStorage
function saveState() {
  localStorage.setItem('tracker_state', JSON.stringify(state));
  autoSaveExcelLocal();
}

// Generate XLSX Workbook from current state
function generateWorkbookData() {
  const wb = XLSX.utils.book_new();

  // 1. Projects Sheet
  const projectRows = state.projects.map(p => ({
    'Project id': p.ID,
    'Project Name': p.Name,
    'Project Description': p.Description,
    'Project Planned Start Date': p.PlannedStartDate || '',
    'Project Planned End Date': p.PlannedEndDate || '',
    'Project Budget': p.Budget,
    'Project Spent': p.Spent,
    'Project Manager': p.ProjectManager,
    'Department': p.Department,
    'Project Status': p.Status,
    'Project Actual Start Date': p.ActualStartDate || '',
    'Project Actual End Date': p.ActualEndDate || '',
    'Project Progress': p.Progress,
    'Project Benefits': p.Benefits || ''
  }));

  // 2. Tasks Sheet
  const taskRows = state.tasks.map(t => ({
    'Project id': t.ProjectID,
    'Task Id': t.ID,
    'Task Name': t.Name,
    'Task Planned Start Date': t.PlannedStartDate || t.StartDate || '',
    'Task Planned End Date': t.PlannedEndDate || t.EndDate || '',
    'Task Actual Start Date': t.ActualStartDate || '',
    'Task Actual End Date': t.ActualEndDate || '',
    'Task Assignee': t.Assignee || '',
    'Task Status': t.Status || '',
    'Task Days Delayed': t.DaysDelayed || 0,
    'Task Delay Reason': t.DelayReason || '',
    'Task Delay Impact': t.DelayImpact || '',
    'Task Delay Reported By': t.DelayReportedBy || '',
    'Task Progress': t.Progress
  }));

  // 3. Team Members Sheet
  const memberRows = state.teamMembers.map(m => ({
    'id': m.id || m.ID || '',
    'name': m.name || '',
    'role': m.role || '',
    'department': m.department || ''
  }));

  const wsProjects = XLSX.utils.json_to_sheet(projectRows);
  const wsTasks = XLSX.utils.json_to_sheet(taskRows);
  const wsMembers = XLSX.utils.json_to_sheet(memberRows);

  XLSX.utils.book_append_sheet(wb, wsProjects, 'Project Details');
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks');
  XLSX.utils.book_append_sheet(wb, wsMembers, 'TeamMembers');

  return wb;
}

// Auto-save to local Excel file via local backend API
async function autoSaveExcelLocal() {
  try {
    const wb = generateWorkbookData();
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

    const response = await fetch('/api/save-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileData: wbout })
    });

    if (response.ok) {
      console.log('Autosaved database.xlsx successfully!');
      showAutoSaveToast();
    } else {
      console.warn('Local database autosave failed (server offline/error).');
    }
  } catch (err) {
    console.warn('Local database autosave failed:', err);
  }
}

// Display auto-saved toast notification
function showAutoSaveToast() {
  let toast = document.getElementById('autosave-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'autosave-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background-color: var(--bg-tertiary);
      border: 1px solid var(--color-success);
      color: var(--text-primary);
      padding: 12px 18px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 1000;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    `;
    toast.innerHTML = `
      <i data-lucide="check-circle" style="width:16px; height:16px; color:var(--color-success);"></i>
      <span>Autosaved to database.xlsx</span>
    `;
    document.body.appendChild(toast);
    lucide.createIcons();
  }

  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 2500);
}

// Format Currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// Format Date string to human readable format
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Chart.js instances
let deptChartInstance = null;
let statusChartInstance = null;

// ================= APP INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  setupNavigation();
  setupEventListeners();
  loadData();
});

// Load data (localStorage first, otherwise start empty)
async function loadData() {
  const localData = localStorage.getItem('tracker_state');
  if (localData) {
    try {
      state = JSON.parse(localData);
      console.log('Loaded state from localStorage:', state);
      if (state.projects && state.projects.length > 0) {
        initUI();
        return;
      }
    } catch (e) {
      console.error('Failed to parse localStorage data', e);
    }
  }

  // Start with empty state
  state.projects = [];
  state.teamMembers = [];
  state.tasks = [];
  state.delays = [];
  initUI();
}

// Helper: Get object property case-insensitively and space-insensitively
function getProp(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const key of Object.keys(obj)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanK === cleanKey) return obj[key];
    }
  }
  return undefined;
}

// Helper: Sort Task IDs hierarchically (e.g. 1, 1.1, 1.1.1, 2, 2.1)
function compareTaskIds(idA, idB) {
  const partsA = String(idA).split('.').map(Number);
  const partsB = String(idB).split('.').map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const valA = isNaN(partsA[i]) ? 0 : partsA[i];
    const valB = isNaN(partsB[i]) ? 0 : partsB[i];
    if (valA !== valB) {
      return valA - valB;
    }
  }
  return String(idA).localeCompare(String(idB));
}

// Helper: Roll up task progress and status from bottom of hierarchy to top
function rollupProjectTasks(projectId) {
  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);

  // Sort from deepest level to shallowest level
  const sortedTasks = [...projectTasks].sort((a, b) => {
    const depthA = String(a.ID).split('.').length;
    const depthB = String(b.ID).split('.').length;
    return depthB - depthA;
  });

  sortedTasks.forEach(parent => {
    const children = projectTasks.filter(child => {
      const parentParts = String(parent.ID).split('.');
      const childParts = String(child.ID).split('.');
      if (childParts.length === parentParts.length + 1) {
        return childParts.slice(0, parentParts.length).join('.') === parent.ID;
      }
      return false;
    });

    if (children.length > 0) {
      const totalProgress = children.reduce((sum, child) => sum + (child.Progress || 0), 0);
      parent.Progress = Math.round(totalProgress / children.length);

      if (parent.Progress === 100) {
        parent.Status = 'completed';
      } else if (parent.Progress > 0) {
        parent.Status = 'in-progress';
      } else {
        parent.Status = 'not-started';
      }

      if (children.some(child => child.Status === 'blocked')) {
        parent.Status = 'blocked';
      }
    }
  });
}

function parseExcelData(workbook) {
  // Find project details sheet
  const projectSheetName = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('project details') ||
    name.toLowerCase().includes('projectdetails') ||
    name.toLowerCase() === 'projects'
  ) || workbook.SheetNames[0];

  // Find tasks sheet
  const tasksSheetName = workbook.SheetNames.find(name =>
    name.toLowerCase() === 'tasks' ||
    name.toLowerCase().includes('task')
  ) || workbook.SheetNames[1];

  // Find team members sheet
  const membersSheetName = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('teammember') ||
    name.toLowerCase().includes('team member') ||
    name.toLowerCase().includes('user') ||
    name.toLowerCase().includes('member')
  );

  const sheetProjects = workbook.Sheets[projectSheetName];
  const sheetTasks = workbook.Sheets[tasksSheetName];
  const sheetMembers = membersSheetName ? workbook.Sheets[membersSheetName] : null;

  if (!sheetProjects || !sheetTasks) {
    throw new Error('Missing worksheets! Make sure the Excel workbook has Project Details and Tasks sheets.');
  }

  const projectRows = XLSX.utils.sheet_to_json(sheetProjects) || [];
  const taskRows = XLSX.utils.sheet_to_json(sheetTasks) || [];
  const members = sheetMembers ? XLSX.utils.sheet_to_json(sheetMembers) : [];

  state.projects = projectRows.map(row => {
    const id = String(getProp(row, ['Project id', 'ProjectID', 'ID']) || '');
    return {
      ID: id,
      Name: String(getProp(row, ['Project Name', 'ProjectName', 'Name']) || ''),
      Description: String(getProp(row, ['Project Description', 'ProjectDescription', 'Description']) || ''),
      Department: String(getProp(row, ['Department', 'Dept']) || 'steel'),
      Status: String(getProp(row, ['Project Status', 'ProjectStatus', 'Status']) || 'on-track'),
      Budget: Number(getProp(row, ['Project Budget', 'ProjectBudget', 'Budget']) || 0),
      Spent: Number(getProp(row, ['Project Spent', 'ProjectSpent', 'Spent']) || 0),
      PlannedStartDate: parseExcelDate(getProp(row, ['Project Planned Start Date', 'ProjectPlannedStartDate', 'PlannedStartDate', 'StartDate']) || ''),
      PlannedEndDate: parseExcelDate(getProp(row, ['Project Planned End Date', 'ProjectPlannedEndDate', 'PlannedEndDate', 'EndDate']) || ''),
      ActualStartDate: parseExcelDate(getProp(row, ['Project Actual Start Date', 'ProjectActualStartDate', 'ActualStartDate']) || ''),
      ActualEndDate: parseExcelDate(getProp(row, ['Project Actual End Date', 'ProjectActualEndDate', 'ActualEndDate']) || ''),
      DaysDelayed: Number(getProp(row, ['Project Days Delayed', 'ProjectDaysDelayed', 'DaysDelayed']) || 0),
      ProjectManager: String(getProp(row, ['Project Manager', 'ProjectManager', 'Manager']) || ''),
      Progress: Number(getProp(row, ['Project Progress', 'ProjectProgress', 'Progress']) || 0),
      Benefits: String(getProp(row, ['Project Benefits', 'ProjectBenefits', 'Benefits', 'benifits']) || '')
    };
  }).filter(p => p.ID);

  state.tasks = taskRows.map(row => {
    const projId = String(getProp(row, ['Project id', 'ProjectID']) || '');
    const taskId = String(getProp(row, ['Task Id', 'TaskID', 'ID']) || '');
    const daysDelayed = Number(getProp(row, ['Task Days Delayed', 'TaskDaysDelayed', 'DaysDelayed']) || 0);
    const delayReason = String(getProp(row, ['Task Delay Reason', 'TaskDelayReason', 'DelayReason', 'Reason']) || '');
    const delayImpact = String(getProp(row, ['Task Delay Impact', 'TaskDelayImpact', 'DelayImpact', 'Impact']) || '');
    const delayReportedBy = String(getProp(row, ['Task Delay Reported By', 'TaskDelayReportedBy', 'DelayReportedBy', 'ReportedBy']) || '');

    return {
      ID: taskId,
      ProjectID: projId,
      Name: String(getProp(row, ['Task Name', 'TaskName', 'Name']) || ''),
      PlannedStartDate: parseExcelDate(getProp(row, ['Task Planned Start Date', 'TaskPlannedStartDate', 'StartDate', 'PlannedStartDate']) || ''),
      PlannedEndDate: parseExcelDate(getProp(row, ['Task Planned End Date', 'TaskPlannedEndDate', 'EndDate', 'PlannedEndDate']) || ''),
      ActualStartDate: parseExcelDate(getProp(row, ['Task Actual Start Date', 'TaskActualStartDate', 'ActualStartDate']) || ''),
      ActualEndDate: parseExcelDate(getProp(row, ['Task Actual End Date', 'TaskActualEndDate', 'ActualEndDate']) || ''),
      Assignee: String(getProp(row, ['Task Assignee', 'TaskAssignee', 'Assignee']) || ''),
      Status: String(getProp(row, ['Task Status', 'TaskStatus', 'Status']) || 'not-started'),
      Progress: Number(getProp(row, ['Task Progress', 'TaskProgress', 'Progress']) || 0),
      DaysDelayed: daysDelayed,
      DelayReason: delayReason,
      DelayImpact: delayImpact,
      DelayReportedBy: delayReportedBy
    };
  }).filter(t => t.ID && t.ProjectID);

  state.teamMembers = members;

  normalizeStateData();

  // Recalculate project progress, delays, and statuses
  state.projects.forEach(p => {
    rollupProjectTasks(p.ID);

    const pTasks = state.tasks.filter(t => t.ProjectID === p.ID);
    if (pTasks.length > 0) {
      // average of level 0 tasks
      const rootTasks = pTasks.filter(t => !String(t.ID).includes('.'));
      const targetTasks = rootTasks.length > 0 ? rootTasks : pTasks;
      const sum = targetTasks.reduce((s, t) => s + t.Progress, 0);
      p.Progress = Math.round(sum / targetTasks.length);
    }
    calculateProjectDelaysAndStatus(p);
  });
}

// Calculate delays and status automatically based on planned/actual dates
function calculateProjectDelaysAndStatus(project) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const plannedStart = project.PlannedStartDate ? new Date(project.PlannedStartDate) : null;
  const plannedEnd = project.PlannedEndDate ? new Date(project.PlannedEndDate) : null;
  const actualStart = project.ActualStartDate ? new Date(project.ActualStartDate) : null;
  const actualEnd = project.ActualEndDate ? new Date(project.ActualEndDate) : null;

  let daysDelayed = 0;

  // 1. Calculate delay in days from dates
  if (actualEnd && plannedEnd) {
    if (actualEnd > plannedEnd) {
      daysDelayed = Math.max(0, Math.round((actualEnd - plannedEnd) / (1000 * 60 * 60 * 24)));
    }
  } else if (actualStart) {
    if (plannedEnd && today > plannedEnd) {
      daysDelayed = Math.max(0, Math.round((today - plannedEnd) / (1000 * 60 * 60 * 24)));
    } else if (plannedStart && actualStart > plannedStart) {
      daysDelayed = Math.max(0, Math.round((actualStart - plannedStart) / (1000 * 60 * 60 * 24)));
    }
  } else {
    if (plannedStart && today > plannedStart) {
      daysDelayed = Math.max(0, Math.round((today - plannedStart) / (1000 * 60 * 60 * 24)));
    }
  }

  // Rollup delays: use maximum delay of root tasks (do not sum parallel/all tasks)
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);
  const rootTasks = projectTasks.filter(t => !String(t.ID).includes('.'));
  const targetTasks = rootTasks.length > 0 ? rootTasks : projectTasks;
  const maxTaskDelay = targetTasks.reduce((max, t) => Math.max(max, t.DaysDelayed || 0), 0);
  project.DaysDelayed = Math.max(daysDelayed, maxTaskDelay);

  // Determine status automatically
  if (project.Progress === 100 || actualEnd) {
    project.Status = 'completed';
  } else if (project.DaysDelayed > 0) {
    project.Status = 'delayed';
  } else if (project.Status !== 'at-risk') {
    project.Status = 'on-track';
  }
}

function normalizeStateData() {
  state.projects.forEach(p => {
    p.Progress = Number(p.Progress || 0);
    p.Budget = Number(p.Budget || 0);
    p.Spent = Number(p.Spent || 0);
    p.DaysDelayed = Number(p.DaysDelayed || 0);
    p.ID = String(p.ID);
    p.PlannedStartDate = p.PlannedStartDate || p.StartDate || '';
    p.PlannedEndDate = p.PlannedEndDate || p.EndDate || '';
    p.ActualStartDate = p.ActualStartDate || '';
    p.ActualEndDate = p.ActualEndDate || '';
    p.Benefits = p.Benefits || '';
  });
  state.tasks.forEach(t => {
    t.Progress = Number(t.Progress || 0);
    t.ProjectID = String(t.ProjectID);
    t.ID = String(t.ID);
    t.PlannedStartDate = t.PlannedStartDate || t.StartDate || '';
    t.PlannedEndDate = t.PlannedEndDate || t.EndDate || '';
    t.ActualStartDate = t.ActualStartDate || '';
    t.ActualEndDate = t.ActualEndDate || '';
    t.DaysDelayed = Number(t.DaysDelayed || 0);
  });

  // Re-build state.delays from task delays
  const delays = [];
  state.tasks.forEach(t => {
    if (t.DaysDelayed > 0 || t.DelayReason) {
      delays.push({
        ID: `d_${t.ProjectID}_${t.ID}`,
        ProjectID: t.ProjectID,
        TaskID: t.ID,
        Date: t.ActualStartDate || t.PlannedStartDate || new Date().toISOString().split('T')[0],
        Reason: t.DelayReason,
        Impact: t.DelayImpact,
        ReportedBy: t.DelayReportedBy || 'Unknown',
        DaysDelayed: t.DaysDelayed
      });
    }
  });
  state.delays = delays;

  state.teamMembers.forEach(m => {
    m.id = String(m.id || m.ID || '');
  });

  // Extract team members dynamically if the sheet was missing/empty
  if (!state.teamMembers || state.teamMembers.length === 0) {
    const uniqueMembers = new Set();
    const extractedMembers = [];

    const addMember = (name, role, department) => {
      if (!name) return;
      const cleanName = name.trim();
      if (!cleanName || uniqueMembers.has(cleanName)) return;
      uniqueMembers.add(cleanName);

      const memberId = 'tm' + (extractedMembers.length + 1);
      extractedMembers.push({
        id: memberId,
        name: cleanName,
        role: role,
        department: department || 'steel'
      });
    };

    state.projects.forEach(p => {
      addMember(p.ProjectManager, 'Senior Project Manager', p.Department);
    });

    state.tasks.forEach(t => {
      const proj = state.projects.find(p => p.ID === t.ProjectID);
      const dept = proj ? proj.Department : 'steel';
      addMember(t.Assignee, 'Team Member', dept);
    });

    state.teamMembers = extractedMembers;
  }
}

function initUI() {
  lucide.createIcons();
  const dbLoaded = state.projects && state.projects.length > 0;
  if (dbLoaded) {
    populateDropdowns();
    switchView('dashboard');
  } else {
    switchView('empty');
  }
}

// Populate Member and PM Dropdowns in Modals
function populateDropdowns() {
  const pmSelect = document.getElementById('project-form-pm');
  const reporterSelect = document.getElementById('delay-form-reporter');
  const assigneeSelect = document.getElementById('task-form-assignee');

  const pms = state.teamMembers.filter(m => m.role.toLowerCase().includes('manager') || m.role.toLowerCase().includes('director') || m.role.toLowerCase().includes('lead'));

  pmSelect.innerHTML = pms.map(m => `<option value="${m.name}">${m.name} (${m.role})</option>`).join('');
  reporterSelect.innerHTML = state.teamMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
  assigneeSelect.innerHTML = state.teamMembers.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
}

// Navigation Handling
function setupNavigation() {
  document.querySelectorAll('.sidebar .menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });
}

// Toggle Views
function switchView(viewName) {
  const dbLoaded = state.projects && state.projects.length > 0;

  if (!dbLoaded) {
    viewName = 'empty';
    // Hide export/add actions in empty state
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) btnExport.style.display = 'none';
    document.getElementById('btn-add-project').style.display = 'none';

    // Disable menu items
    document.querySelectorAll('.sidebar .menu-item').forEach(item => {
      item.classList.add('disabled');
      item.style.opacity = '0.3';
      item.style.pointerEvents = 'none';
    });
  } else {
    // Show normal actions
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) btnExport.style.display = 'inline-flex';
    document.getElementById('btn-add-project').style.display = 'inline-flex';

    // Enable menu items
    document.querySelectorAll('.sidebar .menu-item').forEach(item => {
      item.classList.remove('disabled');
      item.style.opacity = '1';
      item.style.pointerEvents = 'auto';
    });
  }

  // Update sidebar active state
  document.querySelectorAll('.sidebar .menu-item').forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Hide all views, show target view
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });

  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Update Header Title
  const titles = {
    'empty': 'Load Database',
    'dashboard': 'Dashboard',
    'projects': 'Projects Directory',
    'project-details': 'Project Workspace',
    'teams': 'Core Teams Directory',
    'reports': 'Portfolio Analysis Reports'
  };
  document.getElementById('header-view-title').textContent = titles[viewName] || 'Enterprise Tracker';

  // Render view-specific contents
  if (dbLoaded) {
    if (viewName === 'dashboard') {
      renderDashboard();
    } else if (viewName === 'projects') {
      renderProjectsList();
    } else if (viewName === 'teams') {
      renderTeams();
    } else if (viewName === 'reports') {
      renderReports();
    }
  }

  lucide.createIcons();
}

// ================= RENDER METHODS =================

// 1. Dashboard View
function renderDashboard() {
  // Calculations
  const totalProjects = state.projects.length;
  const activeProjects = state.projects.filter(p => p.Status !== 'completed').length;
  const completedProjects = totalProjects - activeProjects;

  const totalBudget = state.projects.reduce((sum, p) => sum + (p.Budget || 0), 0);
  const totalSpent = state.projects.reduce((sum, p) => sum + (p.Spent || 0), 0);
  const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const avgProgress = totalProjects > 0 ? Math.round(state.projects.reduce((sum, p) => sum + (p.Progress || 0), 0) / totalProjects) : 0;

  const delayedProjects = state.projects.filter(p => p.Status === 'delayed');
  const delayedCount = delayedProjects.length;
  const totalDelayDays = state.projects.reduce((sum, p) => sum + (p.DaysDelayed || 0), 0);

  // Update Metric Nodes for 6 Widgets
  document.getElementById('stat-total-projects').textContent = totalProjects;
  
  document.getElementById('stat-ongoing-projects').textContent = activeProjects;
  document.getElementById('stat-ongoing-desc').textContent = `${delayedCount} currently delayed`;
  
  document.getElementById('stat-completed-projects').textContent = completedProjects;
  
  document.getElementById('stat-total-budget').textContent = formatCurrency(10000000); // hardcode to 1 Crore (10000000 INR)
  
  document.getElementById('stat-budget-allocated').textContent = formatCurrency(totalBudget);
  document.getElementById('stat-allocated-desc').textContent = `${Math.round(totalBudget / 10000000 * 100)}% of limit`;
  
  document.getElementById('stat-budget-spent').textContent = formatCurrency(totalSpent);
  document.getElementById('stat-spent-desc').textContent = `${totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100) : 0}% of allocated`;

  // Draw Charts
  drawDashboardCharts();
  renderBenefitsWidget();

  // Render Recent Projects (up to 3)
  const recentContainer = document.getElementById('dashboard-recent-projects');
  const recent = [...state.projects].slice(-3).reverse();

  if (recent.length === 0) {
    recentContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 24px; color: var(--text-secondary);">No projects logged. Click "Add Project" to start tracking.</div>`;
  } else {
    recentContainer.innerHTML = recent.map(p => generateProjectCardHtml(p)).join('');
  }
}

function drawDashboardCharts() {
  const ctxDept = document.getElementById('chart-departments').getContext('2d');

  if (deptChartInstance) deptChartInstance.destroy();

  const depts = [
    'corp proc digital', 'imports', 'MDM', 'capex', 'it',
    'exports', 'exim', 'banking', 'finance', 'steel'
  ];
  const deptLabels = depts.map(d => {
    if (d === 'it') return 'IT';
    if (d === 'exim') return 'EXIM';
    if (d === 'MDM') return 'MDM';
    return d.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  });
  const deptCounts = depts.map(d => state.projects.filter(p => String(p.Department).toLowerCase() === d.toLowerCase()).length);

  const isLight = currentTheme === 'light';
  const tickColor = isLight ? '#4a3644' : '#d7c8d1';
  const gridColor = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';

  deptChartInstance = new Chart(ctxDept, {
    type: 'bar',
    data: {
      labels: deptLabels,
      datasets: [{
        label: 'Projects',
        data: deptCounts,
        backgroundColor: '#810055',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: {
          ticks: { color: tickColor, stepSize: 1 },
          grid: { color: gridColor },
          title: {
            display: true,
            text: 'Number of Projects',
            color: tickColor,
            font: { size: 13, weight: '600' }
          }
        }
      }
    }
  });
}

function generateProjectCardHtml(project) {
  const statusLabels = {
    'on-track': 'On Track',
    'at-risk': 'At Risk',
    'delayed': 'Delayed',
    'completed': 'Completed'
  };

  const barColorClass = {
    'on-track': 'fill-emerald',
    'at-risk': 'fill-amber',
    'delayed': 'fill-rose',
    'completed': 'fill-pink'
  }[project.Status] || 'fill-cyan';

  // Count team size from tasks
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);
  const uniqueAssignees = new Set(projectTasks.map(t => t.Assignee).filter(Boolean));
  uniqueAssignees.add(project.ProjectManager);
  const teamSize = uniqueAssignees.size;

  const dateString = project.Status === 'completed' || project.ActualEndDate
    ? `Completed: ${formatDate(project.ActualEndDate || project.PlannedEndDate)}`
    : `Target: ${formatDate(project.PlannedEndDate)}`;

  const capitalizedDept = project.Department === 'it' ? 'IT' : (project.Department === 'exim' ? 'EXIM' : (project.Department === 'MDM' ? 'MDM' : project.Department.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')));

  const statusBadgeHtml = project.Status === 'completed'
    ? `<span class="badge badge-completed">Completed</span>`
    : '';

  return `
    <div class="project-card" onclick="app.showProjectDetails('${project.ID}')">
      <div class="project-card-header">
        <div style="flex: 1; min-width: 0;">
          <h3 class="project-card-title">${project.Name}</h3>
          <p class="project-card-desc">${project.Description}</p>
        </div>
        ${statusBadgeHtml}
      </div>
      
      <div class="project-card-body">
        <div class="progress-container">
          <div class="progress-label-row">
            <span>Progress</span>
            <span>${project.Progress}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${barColorClass}" style="width: ${project.Progress}%"></div>
          </div>
        </div>
        
        <div class="project-meta-grid">
          <div class="meta-item">
            <i data-lucide="indian-rupee"></i>
            <span>Spent: ${formatCurrency(project.Spent)}</span>
          </div>
          <div class="meta-item">
            <i data-lucide="users"></i>
            <span>Team: ${teamSize} members</span>
          </div>
          <div class="meta-item" style="grid-column: 1 / -1;">
            <i data-lucide="calendar"></i>
            <span>${dateString}</span>
          </div>
        </div>
      </div>
      
      <div class="project-card-footer">
        <span class="badge badge-dept">${capitalizedDept}</span>
        <button class="btn btn-ghost btn-sm" style="padding: 0 4px;">
          <span>Workspace</span>
          <i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i>
        </button>
      </div>
    </div>
  `;
}

// 2. Projects Directory View
function renderProjectsList() {
  const searchQuery = document.getElementById('project-search').value.toLowerCase();
  const selectedDept = document.getElementById('filter-dept').value;
  const selectedStatus = document.getElementById('filter-status').value;

  const filtered = state.projects.filter(p => {
    const matchesSearch = p.Name.toLowerCase().includes(searchQuery) || p.Description.toLowerCase().includes(searchQuery);
    const matchesDept = selectedDept === 'All' || p.Department === selectedDept;

    let matchesStatus = true;
    if (selectedStatus === 'completed') {
      matchesStatus = p.Status === 'completed';
    } else if (selectedStatus === 'active') {
      matchesStatus = p.Status !== 'completed';
    }

    return matchesSearch && matchesDept && matchesStatus;
  });

  const listContainer = document.getElementById('projects-list');
  if (filtered.length === 0) {
    listContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary); width: 100%;">No projects found matching the criteria.</div>`;
  } else {
    listContainer.innerHTML = filtered.map(p => generateProjectCardHtml(p)).join('');
  }
}

// 3. Project Details Workspace View
function showProjectDetails(id) {
  currentProjectId = id;
  const project = state.projects.find(p => p.ID === id);
  if (!project) return;

  // Render Title Info
  document.getElementById('detail-project-name').textContent = project.Name;
  document.getElementById('detail-project-desc').textContent = project.Description;
  document.getElementById('detail-project-dept').textContent = project.Department;
  document.getElementById('detail-project-pm').textContent = `PM: ${project.ProjectManager}`;

  const statusBadge = document.getElementById('detail-project-status-badge');
  if (project.Status === 'completed') {
    statusBadge.style.display = 'inline-flex';
    statusBadge.className = 'badge badge-completed';
    statusBadge.textContent = 'Completed';
  } else {
    statusBadge.style.display = 'none';
  }

  // Metrics
  document.getElementById('detail-progress-val').textContent = `${project.Progress}%`;
  document.getElementById('detail-progress-bar').style.width = `${project.Progress}%`;

  document.getElementById('detail-spent-val').textContent = formatCurrency(project.Spent);
  const budgetUtil = project.Budget > 0 ? Math.round((project.Spent / project.Budget) * 100) : 0;
  document.getElementById('detail-budget-val').textContent = `of ${formatCurrency(project.Budget)} (${budgetUtil}% utilized)`;

  document.getElementById('detail-planned-dates').textContent = `${formatDate(project.PlannedStartDate)} - ${formatDate(project.PlannedEndDate)}`;

  const actualStartText = project.ActualStartDate ? formatDate(project.ActualStartDate) : 'Not Started';
  const actualEndText = project.ActualEndDate ? formatDate(project.ActualEndDate) : (project.ActualStartDate ? 'In Progress' : '');
  document.getElementById('detail-actual-dates').textContent = actualEndText ? `${actualStartText} - ${actualEndText}` : actualStartText;

  document.getElementById('detail-delayed-days-sub').textContent = `${project.DaysDelayed || 0} delay days calculated`;

  // Tabs Default setup
  document.querySelectorAll('.detail-tabs .detail-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.getAttribute('data-tab') === 'overview') tab.classList.add('active');
  });
  document.querySelectorAll('#view-project-details .tab-content').forEach(c => {
    c.classList.remove('active');
    if (c.id === 'tab-overview') c.classList.add('active');
  });

  // Render tabs content
  renderProjectOverviewTab(project);
  renderProjectGanttTab(project);
  renderProjectTasksTab(project);

  switchView('project-details');
}

function renderProjectOverviewTab(project) {
  // Renders the team members list
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);
  const teamAssignees = new Set(projectTasks.map(t => t.Assignee).filter(Boolean));

  const pmInfo = state.teamMembers.find(m => m.name === project.ProjectManager) || { name: project.ProjectManager, role: 'Project Manager' };

  const teamListContainer = document.getElementById('detail-team-list');
  let teamHtml = `
    <div class="team-member-row">
      <div class="avatar-circle pm">${pmInfo.name ? pmInfo.name.split(' ').map(n => n[0]).join('') : 'PM'}</div>
      <div class="member-info">
        <div class="member-name">${pmInfo.name} <span class="badge" style="background-color: var(--color-primary-glow); color: var(--color-primary); border-radius: 4px; padding: 2px 6px; font-size: 9px; vertical-align: middle;">PM</span></div>
        <div class="member-role">${pmInfo.role}</div>
      </div>
    </div>
  `;

  teamAssignees.forEach(name => {
    if (name === project.ProjectManager) return; // Skip PM duplicate
    const info = state.teamMembers.find(m => m.name === name) || { name: name, role: 'Contributor' };
    teamHtml += `
      <div class="team-member-row">
        <div class="avatar-circle">${info.name ? info.name.split(' ').map(n => n[0]).join('') : 'C'}</div>
        <div class="member-info">
          <div class="member-name">${info.name}</div>
          <div class="member-role">${info.role}</div>
        </div>
      </div>
    `;
  });

  if (teamAssignees.size === 0 && !project.ProjectManager) {
    teamListContainer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 12px 0;">No team assigned.</div>';
  } else {
    teamListContainer.innerHTML = teamHtml;
  }

  // Renders Project Delays List
  const projectDelays = state.delays.filter(d => d.ProjectID === project.ID);
  const delaysContainer = document.getElementById('detail-delays-list');

  if (projectDelays.length === 0) {
    delaysContainer.innerHTML = `
      <div class="no-delays-banner">
        <i data-lucide="smile"></i>
        <p>No delays reported for this project</p>
        <p style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">Project is progressing as planned</p>
      </div>
    `;
  } else {
    delaysContainer.innerHTML = projectDelays.map(d => `
      <div class="delay-card">
        <div class="delay-card-header">
          <span class="delay-date">${formatDate(d.Date)}</span>
          <span class="delay-label">Delay Logged</span>
        </div>
        <div class="delay-field">
          <div class="delay-field-title">Cause/Reason</div>
          <div class="delay-field-content">${d.Reason}</div>
        </div>
        <div class="delay-field">
          <div class="delay-field-title">Impact</div>
          <div class="delay-field-content">${d.Impact}</div>
        </div>
        <div class="delay-reporter">Reported by: ${d.ReportedBy}</div>
      </div>
    `).join('');
  }
}


function renderProjectGanttTab(project) {
  const container = document.getElementById('gantt-chart-container');
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);

  // Update view scale button active classes
  const btnMonth = document.getElementById('btn-gantt-month');
  const btnWeek = document.getElementById('btn-gantt-week');
  const btnDay = document.getElementById('btn-gantt-day');
  if (btnMonth && btnWeek && btnDay) {
    btnMonth.classList.remove('active');
    btnWeek.classList.remove('active');
    btnDay.classList.remove('active');
    if (ganttViewScale === 'month') btnMonth.classList.add('active');
    else if (ganttViewScale === 'week') btnWeek.classList.add('active');
    else if (ganttViewScale === 'day') btnDay.classList.add('active');
  }

  if (projectTasks.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--text-secondary);">Add tasks to view the Gantt chart timeline.</div>`;
    return;
  }

  // Sort tasks hierarchically
  projectTasks.sort((a, b) => compareTaskIds(a.ID, b.ID));

  // Initialize collapsed state: collapse all parent tasks by default on first render
  const collapseKey = `gantt_${project.ID}`;
  if (!ganttCollapsedTasks[collapseKey]) {
    ganttCollapsedTasks[collapseKey] = {};
    // Collapse all tasks that have children by default
    projectTasks.forEach(t => {
      const hasChildren = projectTasks.some(child => {
        const parentParts = String(t.ID).split('.');
        const childParts = String(child.ID).split('.');
        return childParts.length === parentParts.length + 1 &&
          childParts.slice(0, parentParts.length).join('.') === String(t.ID);
      });
      if (hasChildren) {
        ganttCollapsedTasks[collapseKey][t.ID] = true;
      }
    });
  }

  // Determine visible tasks based on collapse state
  const collapsedSet = ganttCollapsedTasks[collapseKey];
  const visibleTasks = projectTasks.filter(t => {
    // A task is visible if none of its ancestors are collapsed
    const parts = String(t.ID).split('.');
    if (parts.length <= 1) return true; // Root tasks always visible
    // Check all ancestors
    for (let i = 1; i < parts.length; i++) {
      const ancestorId = parts.slice(0, i).join('.');
      if (collapsedSet[ancestorId]) return false;
    }
    return true;
  });

  // Find overall chart start and end dates (use all tasks, not just visible)
  // Consider BOTH planned and actual dates to ensure delay portions are visible
  const taskTimings = projectTasks.map(t => {
    const pStartStr = t.PlannedStartDate || t.StartDate;
    const pEndStr = t.PlannedEndDate || t.EndDate;
    const aStartStr = t.ActualStartDate;
    const aEndStr = t.ActualEndDate;

    const starts = [];
    const ends = [];

    if (pStartStr) starts.push(new Date(pStartStr).getTime());
    if (aStartStr) starts.push(new Date(aStartStr).getTime());
    if (pEndStr) ends.push(new Date(pEndStr).getTime());
    if (aEndStr) ends.push(new Date(aEndStr).getTime());

    // If a task has DaysDelayed > 0 and a planned end, add the delayed end
    if (t.DaysDelayed > 0 && pEndStr) {
      const delayedEnd = new Date(pEndStr).getTime() + t.DaysDelayed * 24 * 60 * 60 * 1000;
      ends.push(delayedEnd);
    }

    return {
      start: starts.length > 0 ? Math.min(...starts) : new Date().getTime(),
      end: ends.length > 0 ? Math.max(...ends) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime()
    };
  });

  let minTime = Math.min(...taskTimings.map(t => t.start));
  let maxTime = Math.max(...taskTimings.map(t => t.end));

  // Expand start/end slightly for buffer
  minTime = minTime - 3 * 24 * 60 * 60 * 1000;
  maxTime = maxTime + 7 * 24 * 60 * 60 * 1000;

  const totalDuration = maxTime - minTime;

  // Scale Ticks calculation
  const ticks = [];
  let current = new Date(minTime);

  if (ganttViewScale === 'month') {
    current.setDate(1); // Set to start of month
    while (current.getTime() <= maxTime) {
      ticks.push({
        label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        offset: ((current.getTime() - minTime) / totalDuration) * 100
      });
      current.setMonth(current.getMonth() + 1);
    }
  } else if (ganttViewScale === 'week') {
    // Roll back to the start of the week (Sunday)
    const day = current.getDay();
    current.setDate(current.getDate() - day);
    while (current.getTime() <= maxTime) {
      ticks.push({
        label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        offset: ((current.getTime() - minTime) / totalDuration) * 100
      });
      current.setDate(current.getDate() + 7);
    }
  } else if (ganttViewScale === 'day') {
    while (current.getTime() <= maxTime) {
      ticks.push({
        label: current.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        offset: ((current.getTime() - minTime) / totalDuration) * 100
      });
      current.setDate(current.getDate() + 1);
    }
  }

  // Set Gantt container width dynamically in pixels to support horizontal scrolling
  const labelColWidth = 220;
  let timelineWidthPx = 800; // minimum fallback
  if (ganttViewScale === 'month') {
    timelineWidthPx = Math.max(800, ticks.length * 110);
  } else if (ganttViewScale === 'week') {
    timelineWidthPx = Math.max(1000, ticks.length * 80);
  } else if (ganttViewScale === 'day') {
    timelineWidthPx = Math.max(1200, ticks.length * 45);
  }
  container.style.width = `${labelColWidth + timelineWidthPx}px`;

  // Grid Lines HTML
  const gridLinesHtml = ticks.map(t => `
    <div class="gantt-grid-line" style="left: ${t.offset}%"></div>
  `).join('');

  // Month/Week/Day Headers HTML
  const scaleHeadersHtml = ticks.map(t => `
    <div class="gantt-month-label" style="left: calc(220px + ${t.offset}%)">${t.label}</div>
  `).join('');

  // Today marker line — use real today's date
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayTime = todayDate.getTime();
  let todayLineHtml = '';
  let todayOffsetPercent = -1;
  if (todayTime >= minTime && todayTime <= maxTime) {
    todayOffsetPercent = ((todayTime - minTime) / totalDuration) * 100;
    todayLineHtml = `
      <div class="gantt-today-line" id="gantt-today-marker" style="left: calc(220px + ${todayOffsetPercent}%)">
        <div class="gantt-today-badge">Today</div>
      </div>
    `;
  }

  // Tasks rows HTML
  const colorsMap = {
    'completed': '#10b981',
    'in-progress': '#ec4899',
    'not-started': '#937b8b',
    'blocked': '#ef4444'
  };

  const taskRowsHtml = visibleTasks.map(t => {
    // Compute planned and actual dates separately for delay visualization
    const plannedStartStr = t.PlannedStartDate || t.StartDate;
    const plannedEndStr = t.PlannedEndDate || t.EndDate;
    const actualStartStr = t.ActualStartDate;
    const actualEndStr = t.ActualEndDate;

    // The "display" bar uses actual dates when available, planned otherwise
    const barStartStr = actualStartStr || plannedStartStr;
    const barEndStr = actualEndStr || plannedEndStr;
    const tStart = barStartStr ? new Date(barStartStr).getTime() : new Date().getTime();
    const tEnd = barEndStr ? new Date(barEndStr).getTime() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime();

    const leftOffset = ((tStart - minTime) / totalDuration) * 100;
    const width = ((tEnd - tStart) / totalDuration) * 100;

    const level = String(t.ID).split('.').length - 1;
    const hasChildren = projectTasks.some(child => {
      const parentParts = String(t.ID).split('.');
      const childParts = String(child.ID).split('.');
      return childParts.length === parentParts.length + 1 &&
        childParts.slice(0, parentParts.length).join('.') === String(t.ID);
    });
    const isCollapsed = collapsedSet[t.ID] || false;

    // Collapse toggle icon for parent tasks
    let toggleIcon = '';
    if (hasChildren) {
      toggleIcon = `<span class="gantt-collapse-toggle" data-task-id="${t.ID}" data-project-id="${project.ID}" title="${isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${isCollapsed ? '<polyline points="9 18 15 12 9 6"></polyline>' : '<polyline points="6 9 12 15 18 9"></polyline>'}
        </svg>
      </span>`;
    }

    // --- Delay Calculation ---
    let delayHtml = '';
    let plannedEndMarkerHtml = '';
    const daysDelayed = t.DaysDelayed || 0;

    if (!hasChildren && plannedEndStr) {
      const plannedEndTime = new Date(plannedEndStr).getTime();
      const actualEndTime = actualEndStr ? new Date(actualEndStr).getTime() : null;

      // Determine if there is a delay: either from DaysDelayed field or actual end > planned end
      let delayEndTime = null;
      let computedDelayDays = 0;

      if (actualEndTime && actualEndTime > plannedEndTime) {
        // Actual end extends beyond planned end
        delayEndTime = actualEndTime;
        computedDelayDays = Math.ceil((actualEndTime - plannedEndTime) / (1000 * 60 * 60 * 24));
      } else if (daysDelayed > 0) {
        // Use DaysDelayed field to project the delay
        delayEndTime = plannedEndTime + daysDelayed * 24 * 60 * 60 * 1000;
        computedDelayDays = daysDelayed;
      }

      if (delayEndTime && computedDelayDays > 0) {
        // Delay bar: starts at planned end, extends to delay end
        const delayLeft = ((plannedEndTime - minTime) / totalDuration) * 100;
        const delayWidth = ((delayEndTime - plannedEndTime) / totalDuration) * 100;

        // Planned end marker inside the main bar
        const plannedEndOffsetInBar = ((plannedEndTime - tStart) / (tEnd - tStart)) * 100;

        // Only show marker if it's inside the bar
        if (plannedEndOffsetInBar > 0 && plannedEndOffsetInBar < 100) {
          plannedEndMarkerHtml = `<div class="gantt-planned-marker" style="left: ${plannedEndOffsetInBar}%;" title="Planned End: ${formatDate(plannedEndStr)}"></div>`;
        }

        const delayReasonText = t.DelayReason ? ` — ${t.DelayReason}` : '';
        delayHtml = `
          <div class="gantt-bar-delay" style="left: ${delayLeft}%; width: ${delayWidth}%;" title="${computedDelayDays}d delayed${delayReasonText}">
            <span class="gantt-delay-label">${computedDelayDays > 2 ? `+${computedDelayDays}d` : ''}</span>
            <div class="gantt-bar-delay-tooltip">
              ⚠ ${computedDelayDays} day${computedDelayDays !== 1 ? 's' : ''} delayed${delayReasonText}
            </div>
          </div>
        `;
      }
    }

    let barStyleHtml = '';
    if (hasChildren) {
      // Summary task styling — show max delay of child tasks
      const childTasks = projectTasks.filter(child => {
        const parentParts = String(t.ID).split('.');
        const childParts = String(child.ID).split('.');
        return childParts.length > parentParts.length &&
          childParts.slice(0, parentParts.length).join('.') === String(t.ID);
      });
      const maxChildDelay = childTasks.reduce((max, c) => Math.max(max, c.DaysDelayed || 0), 0);
      const delayIndicator = maxChildDelay > 0 ? `<span class="delay-badge-parent">⚠ ${maxChildDelay}d</span>` : '';

      barStyleHtml = `
        <div class="gantt-bar parent-bar" style="left: ${leftOffset}%; width: ${width}%; background: linear-gradient(90deg, #ec4899, #810055);">
          <div class="gantt-bar-text">${t.Progress}% ${delayIndicator}</div>
        </div>
      `;
    } else {
      const color = colorsMap[t.Status] || '#810055';
      barStyleHtml = `
        <div class="gantt-bar leaf-bar" style="left: ${leftOffset}%; width: ${width}%">
          <div class="gantt-bar-progress" style="width: ${t.Progress}%; background-color: ${color}"></div>
          ${plannedEndMarkerHtml}
          <div class="gantt-bar-text">${t.Progress}%</div>
        </div>
        ${delayHtml}
      `;
    }

    return `
      <div class="gantt-row ${hasChildren ? 'gantt-row-parent' : 'gantt-row-child'} ${isCollapsed ? 'gantt-row-collapsed' : ''}" data-level="${level}">
        <div class="gantt-task-label" style="padding-left: ${24 + level * 16}px;">
          <div class="gantt-task-name" style="font-weight: ${level === 0 ? '600' : '400'}; color: ${level === 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};">
            ${toggleIcon}<span class="task-id-badge" style="font-size: 10px; opacity: 0.6; margin-right: 4px;">${t.ID}</span>${t.Name}
          </div>
          <div class="gantt-task-assignee">${t.Assignee || 'Unassigned'}${daysDelayed > 0 ? ` <span style="color: var(--color-danger); font-size: 10px; font-weight: 600;">⚠ ${daysDelayed}d</span>` : ''}</div>
        </div>
        <div class="gantt-bar-container">
          ${barStyleHtml}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Gantt Header -->
    <div class="gantt-header">
      <div class="gantt-label-column-header">Tasks / Assignee</div>
      <div class="gantt-timeline-header">
        ${scaleHeadersHtml}
      </div>
    </div>
    
    <!-- Gantt Body -->
    <div class="gantt-body">
      <div class="gantt-grid-lines">
        ${gridLinesHtml}
      </div>
      ${todayLineHtml}
      ${taskRowsHtml}
    </div>
  `;

  // Attach collapse toggle event listeners
  container.querySelectorAll('.gantt-collapse-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = toggle.getAttribute('data-task-id');
      const projId = toggle.getAttribute('data-project-id');
      const key = `gantt_${projId}`;
      if (ganttCollapsedTasks[key][taskId]) {
        delete ganttCollapsedTasks[key][taskId];
      } else {
        ganttCollapsedTasks[key][taskId] = true;
      }
      // Re-render
      const proj = state.projects.find(p => p.ID === projId);
      if (proj) renderProjectGanttTab(proj);
    });
  });

  // Auto-scroll to today's marker
  scrollGanttToToday(todayOffsetPercent, labelColWidth, timelineWidthPx);
}

function setGanttViewScale(scale) {
  ganttViewScale = scale;
  if (currentProjectId) {
    const project = state.projects.find(p => p.ID === currentProjectId);
    if (project) {
      renderProjectGanttTab(project);
    }
  }
}

// Scroll the Gantt chart wrapper so that today's line is visible (roughly centered)
function scrollGanttToToday(todayOffsetPercent, labelColWidth, timelineWidthPx) {
  if (todayOffsetPercent < 0) return; // today not in range
  const wrapper = document.querySelector('.gantt-chart-wrapper');
  if (!wrapper) return;

  // Calculate the pixel position of today within the full gantt width
  const todayPixel = labelColWidth + (todayOffsetPercent / 100) * timelineWidthPx;
  // Center today in the visible area
  const scrollTarget = todayPixel - wrapper.clientWidth / 2;
  requestAnimationFrame(() => {
    wrapper.scrollLeft = Math.max(0, scrollTarget);
  });
}

// ================= THEME SYSTEM =================
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tracker_theme', theme);

  // Update toggle button icon if exists
  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    const iconEl = themeBtn.querySelector('[data-lucide]');
    if (iconEl) {
      iconEl.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
    }
    const labelEl = themeBtn.querySelector('.theme-label');
    if (labelEl) {
      labelEl.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
    }
    lucide.createIcons();
  }

  // Re-draw charts if they exist (to pick up new theme colors)
  if (deptChartInstance) {
    drawDashboardCharts();
  }
}

function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

function renderProjectTasksTab(project) {
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);
  const tasksContainer = document.getElementById('detail-tasks-list');

  if (projectTasks.length === 0) {
    tasksContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-secondary);">No tasks created. Click "Add Task" to initialize project timeline.</div>`;
    return;
  }

  // Sort tasks hierarchically
  projectTasks.sort((a, b) => compareTaskIds(a.ID, b.ID));

  tasksContainer.innerHTML = projectTasks.map((t, index) => {
    const level = String(t.ID).split('.').length - 1;
    const isChecked = t.Status === 'completed';
    const hasChildren = projectTasks.some(child => String(child.ID).startsWith(t.ID + '.'));

    // Add visual delay warnings
    let delayWarningHtml = '';
    if (t.DaysDelayed > 0) {
      delayWarningHtml = `
        <div class="task-delay-alert" style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #f87171; margin-top: 6px; background-color: rgba(239, 68, 68, 0.08); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.15); width: fit-content;">
          <i data-lucide="alert-triangle" style="width: 14px; height: 14px;"></i>
          <span>Delayed by ${t.DaysDelayed} days: "${t.DelayReason}" (${t.DelayReportedBy})</span>
        </div>
      `;
    }

    return `
      <div class="task-item" style="margin-left: ${level * 24}px; border-left: ${level > 0 ? '2px dashed rgba(255,255,255,0.1)' : 'none'}; padding-left: ${level > 0 ? '16px' : '0'};">
        <div class="task-checkbox-wrapper">
          <input type="checkbox" class="task-checkbox" data-task-id="${t.ID}" ${isChecked ? 'checked' : ''} onchange="app.toggleTaskComplete('${t.ID}', this.checked)">
        </div>
        <div class="task-details">
          <div class="task-title-row">
            <span class="task-title" style="font-weight: ${level === 0 ? '600' : '400'}; color: ${level === 0 ? 'white' : 'var(--text-secondary)'};">
              <span class="task-id-badge" style="font-size: 10px; background-color: rgba(255,255,255,0.08); border-radius: 4px; padding: 1px 4px; margin-right: 6px; font-weight: normal; color: var(--text-muted);">${t.ID}</span>${t.Name}
            </span>
            <span class="task-badge task-badge-${t.Status}">${t.Status.replace('-', ' ')}</span>
          </div>
          <div class="task-meta">
            <span>Assignee: <strong>${t.Assignee || 'Unassigned'}</strong></span>
            <span>Schedule: ${formatDate(t.PlannedStartDate || t.StartDate)} - ${formatDate(t.PlannedEndDate || t.EndDate)}</span>
          </div>
          ${delayWarningHtml}
        </div>
        <div class="task-progress-col">
          <div class="progress-label-row">
            <span>Progress</span>
            <span>${t.Progress}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${hasChildren ? 'fill-pink' : 'fill-cyan'}" style="width: ${t.Progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Teams Directory View
function renderTeams() {
  const container = document.getElementById('teams-list');

  const rows = state.teamMembers.map(m => {
    // Find all projects where this member is active (either PM or assigned to a task)
    const pmProjects = state.projects.filter(p => p.ProjectManager === m.name).map(p => p.Name);
    const taskProjects = state.tasks.filter(t => t.Assignee === m.name)
      .map(t => state.projects.find(p => p.ID === t.ProjectID)?.Name)
      .filter(Boolean);

    // Union unique projects
    const allProjNames = Array.from(new Set([...pmProjects, ...taskProjects]));

    const badgesHtml = allProjNames.map(name => `
      <span class="badge badge-dept" style="background-color: var(--color-primary-glow); border-color: rgba(129, 0, 85, 0.2); color: var(--color-primary);">${name}</span>
    `).join(' ');

    return `
      <tr>
        <td style="font-weight: 600; color: var(--text-primary);">${m.name}</td>
        <td style="color: var(--text-secondary);">${m.role}</td>
        <td><span class="badge badge-dept">${m.department}</span></td>
        <td>
          <div class="team-badge-row">
            ${badgesHtml || '<span style="color: var(--text-muted); font-size: 12px;">No assignments</span>'}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = rows;
}

// 5. Reports View
function renderReports() {
  const total = state.projects.length;
  const delayed = state.projects.filter(p => p.Status === 'delayed').length;
  const delayedPercent = total > 0 ? Math.round((delayed / total) * 100) : 0;

  const totalSpent = state.projects.reduce((sum, p) => sum + p.Spent, 0);
  const totalBudget = state.projects.reduce((sum, p) => sum + p.Budget, 0);
  const deficit = totalSpent - totalBudget;
  const totalDelayDays = state.projects.reduce((sum, p) => sum + (p.DaysDelayed || 0), 0);

  // Update Report nodes
  document.getElementById('report-delayed-percent').textContent = `${delayedPercent}%`;
  document.getElementById('report-delayed-ratio').textContent = `${delayed} of ${total} projects delayed`;

  document.getElementById('report-budget-deficit').textContent = formatCurrency(Math.max(0, deficit));
  document.getElementById('report-spent-breakdown').textContent = `Spent: ${formatCurrency(totalSpent)} / Budget: ${formatCurrency(totalBudget)}`;

  document.getElementById('report-total-delays').textContent = `${totalDelayDays} Days`;

  // Render comprehensive audit list of delays
  const auditContainer = document.getElementById('reports-delays-list');
  if (state.delays.length === 0) {
    auditContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 24px; color: var(--text-secondary);">No issues reported across the portfolio.</div>`;
  } else {
    auditContainer.innerHTML = state.delays.map(d => {
      const p = state.projects.find(proj => proj.ID === d.ProjectID) || { Name: 'Unknown Project' };
      return `
        <div class="delay-card" style="background-color: var(--bg-secondary);">
          <div class="delay-card-header">
            <strong style="color: var(--color-primary); font-size: 14px;">${p.Name}</strong>
            <span class="delay-date">${formatDate(d.Date)}</span>
          </div>
          <div class="delay-field" style="margin-top: 10px;">
            <div class="delay-field-title">Delay Cause</div>
            <div class="delay-field-content">${d.Reason}</div>
          </div>
          <div class="delay-field">
            <div class="delay-field-title">Stated Impact</div>
            <div class="delay-field-content">${d.Impact}</div>
          </div>
          <div class="delay-reporter" style="display:flex; justify-content:space-between;">
            <span>Reported by: ${d.ReportedBy}</span>
            <span style="color: var(--color-danger); font-weight:600;">Issue Logged</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ================= CRUD OPERATORS =================

// Task Checkbox Toggle
function toggleTaskComplete(taskId, isChecked) {
  const task = state.tasks.find(t => t.ID === taskId && t.ProjectID === currentProjectId);
  if (!task) return;

  const targetProgress = isChecked ? 100 : 0;
  const targetStatus = isChecked ? 'completed' : 'not-started';

  // Toggle this task and all its descendants
  const projectTasks = state.tasks.filter(t => t.ProjectID === task.ProjectID);
  const descendants = projectTasks.filter(t =>
    t.ID === taskId || String(t.ID).startsWith(taskId + '.')
  );

  descendants.forEach(d => {
    d.Progress = targetProgress;
    d.Status = targetStatus;
    // Clear delays if marked complete
    if (isChecked) {
      d.DaysDelayed = 0;
      d.DelayReason = '';
      d.DelayImpact = '';
      d.DelayReportedBy = '';
    }
  });

  // Recalculate rollup progress from bottom up
  rollupProjectTasks(task.ProjectID);

  // Recalculate project progress
  recalculateProjectProgress(task.ProjectID);
}

// Recalculate average progress for a project based on its tasks
function recalculateProjectProgress(projectId) {
  const project = state.projects.find(p => p.ID === projectId);
  if (!project) return;

  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);
  if (projectTasks.length > 0) {
    // Re-run rollup
    rollupProjectTasks(projectId);

    // Project progress is calculated as average of Level 0 tasks
    const rootTasks = projectTasks.filter(t => !String(t.ID).includes('.'));
    const targetTasks = rootTasks.length > 0 ? rootTasks : projectTasks;
    const sum = targetTasks.reduce((s, t) => s + t.Progress, 0);
    project.Progress = Math.round(sum / targetTasks.length);
  }

  calculateProjectDelaysAndStatus(project);

  saveState();

  // Refresh Details screen
  showProjectDetails(projectId);
}

// Open modals
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

// Close modals
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Event Listeners for Forms and Modals
function setupEventListeners() {

  // Navigation Search & Filters
  document.getElementById('project-search').addEventListener('input', renderProjectsList);
  document.getElementById('filter-dept').addEventListener('change', renderProjectsList);
  document.getElementById('filter-status').addEventListener('change', renderProjectsList);

  // Tab details switching
  document.querySelectorAll('.detail-tabs .detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      document.querySelectorAll('.detail-tabs .detail-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('#view-project-details .tab-content').forEach(c => {
        c.classList.remove('active');
        if (c.id === `tab-${targetTab}`) c.classList.add('active');
      });

      if (targetTab === 'gantt' && currentProjectId) {
        const project = state.projects.find(p => p.ID === currentProjectId);
        renderProjectGanttTab(project);
      }
    });
  });

  // Modal Open Buttons
  document.getElementById('btn-add-project').addEventListener('click', () => {
    document.getElementById('form-project').reset();
    document.getElementById('project-form-id').value = '';
    document.getElementById('modal-project-title').textContent = 'Add New Project';
    openModal('modal-project');
  });

  document.getElementById('btn-edit-project-details').addEventListener('click', () => {
    const project = state.projects.find(p => p.ID === currentProjectId);
    if (!project) return;

    document.getElementById('project-form-id').value = project.ID;
    document.getElementById('project-form-name').value = project.Name;
    document.getElementById('project-form-desc').value = project.Description;
    document.getElementById('project-form-dept').value = project.Department;
    document.getElementById('project-form-status').value = project.Status;
    document.getElementById('project-form-planned-start').value = project.PlannedStartDate || '';
    document.getElementById('project-form-planned-end').value = project.PlannedEndDate || '';
    document.getElementById('project-form-actual-start').value = project.ActualStartDate || '';
    document.getElementById('project-form-actual-end').value = project.ActualEndDate || '';
    document.getElementById('project-form-budget').value = project.Budget;
    document.getElementById('project-form-spent').value = project.Spent;
    document.getElementById('project-form-pm').value = project.ProjectManager;
    document.getElementById('project-form-progress').value = project.Progress;

    document.getElementById('modal-project-title').textContent = 'Edit Project Details';
    openModal('modal-project');
  });

  document.getElementById('btn-delete-project-details').addEventListener('click', () => {
    if (confirm('Are you sure you want to delete this project? This action will remove all tasks and delays associated with it.')) {
      state.projects = state.projects.filter(p => p.ID !== currentProjectId);
      state.tasks = state.tasks.filter(t => t.ProjectID !== currentProjectId);
      state.delays = state.delays.filter(d => d.ProjectID !== currentProjectId);
      saveState();
      switchView('projects');
    }
  });

  function updateParentTaskDropdown() {
    const level = document.getElementById('task-form-level').value;
    const parentGroup = document.getElementById('task-form-parent-group');
    const parentSelect = document.getElementById('task-form-parent');

    const projectTasks = state.tasks.filter(t => t.ProjectID === currentProjectId);
    projectTasks.sort((a, b) => compareTaskIds(a.ID, b.ID));

    if (level === '1') {
      parentGroup.style.display = 'none';
      parentSelect.removeAttribute('required');
    } else if (level === '2') {
      parentGroup.style.display = 'block';
      parentSelect.setAttribute('required', 'required');
      const level1Tasks = projectTasks.filter(t => !String(t.ID).includes('.'));
      parentSelect.innerHTML = level1Tasks.map(t => `<option value="${t.ID}">${t.ID} - ${t.Name}</option>`).join('');
      if (level1Tasks.length === 0) {
        parentSelect.innerHTML = '<option value="">No level 1 tasks available</option>';
      }
    } else if (level === '3') {
      parentGroup.style.display = 'block';
      parentSelect.setAttribute('required', 'required');
      const level2Tasks = projectTasks.filter(t => {
        const parts = String(t.ID).split('.');
        return parts.length === 2;
      });
      parentSelect.innerHTML = level2Tasks.map(t => `<option value="${t.ID}">${t.ID} - ${t.Name}</option>`).join('');
      if (level2Tasks.length === 0) {
        parentSelect.innerHTML = '<option value="">No level 2 tasks available</option>';
      }
    }
  }

  function getNextTaskId(projectId, level, parentId) {
    const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);

    if (level === '1') {
      const level1Ids = projectTasks
        .filter(t => !String(t.ID).includes('.'))
        .map(t => Number(t.ID))
        .filter(n => !isNaN(n));
      const nextInt = level1Ids.length > 0 ? Math.max(...level1Ids) + 1 : 1;
      return String(nextInt);
    } else if (level === '2') {
      const prefix = parentId + '.';
      const level2Ids = projectTasks
        .filter(t => String(t.ID).startsWith(prefix))
        .map(t => String(t.ID).slice(prefix.length))
        .filter(suffix => !suffix.includes('.'))
        .map(Number)
        .filter(n => !isNaN(n));
      const nextSub = level2Ids.length > 0 ? Math.max(...level2Ids) + 1 : 1;
      return parentId + '.' + nextSub;
    } else if (level === '3') {
      const prefix = parentId + '.';
      const level3Ids = projectTasks
        .filter(t => String(t.ID).startsWith(prefix))
        .map(t => String(t.ID).slice(prefix.length))
        .filter(suffix => !suffix.includes('.'))
        .map(Number)
        .filter(n => !isNaN(n));
      const nextSubSub = level3Ids.length > 0 ? Math.max(...level3Ids) + 1 : 1;
      return parentId + '.' + nextSubSub;
    }
    return '';
  }

  document.getElementById('btn-add-delay').addEventListener('click', () => {
    document.getElementById('form-delay').reset();
    document.getElementById('delay-form-date').value = new Date().toISOString().split('T')[0];

    // Populate task dropdown
    const taskSelect = document.getElementById('delay-form-task');
    const projectTasks = state.tasks.filter(t => t.ProjectID === currentProjectId);
    projectTasks.sort((a, b) => compareTaskIds(a.ID, b.ID));
    if (projectTasks.length === 0) {
      taskSelect.innerHTML = '<option value="">No tasks available</option>';
    } else {
      taskSelect.innerHTML = projectTasks.map(t => `<option value="${t.ID}">${t.ID} - ${t.Name}</option>`).join('');
    }

    openModal('modal-delay');
  });

  document.getElementById('btn-add-task').addEventListener('click', () => {
    document.getElementById('form-task').reset();
    document.getElementById('task-form-level').value = '1';
    updateParentTaskDropdown();
    document.getElementById('task-form-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('task-form-end').value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    openModal('modal-task');
  });

  // Listen to level change to dynamically update parent dropdown
  document.getElementById('task-form-level').addEventListener('change', updateParentTaskDropdown);

  // Modal Closures
  const setupModalClose = (modalId) => {
    document.getElementById(`${modalId}-close`).addEventListener('click', () => closeModal(modalId));
    document.getElementById(`${modalId}-cancel`).addEventListener('click', () => closeModal(modalId));
  };
  setupModalClose('modal-project');
  setupModalClose('modal-delay');
  setupModalClose('modal-task');

  // FORM SUBMISSIONS

  // Add / Edit Project Form Submit
  document.getElementById('form-project').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('project-form-id').value;
    const name = document.getElementById('project-form-name').value;
    const desc = document.getElementById('project-form-desc').value;
    const dept = document.getElementById('project-form-dept').value;
    const status = document.getElementById('project-form-status').value;
    const plannedStart = document.getElementById('project-form-planned-start').value;
    const plannedEnd = document.getElementById('project-form-planned-end').value;
    const actualStart = document.getElementById('project-form-actual-start').value;
    const actualEnd = document.getElementById('project-form-actual-end').value;
    const budget = Number(document.getElementById('project-form-budget').value);
    const spent = Number(document.getElementById('project-form-spent').value);
    const pm = document.getElementById('project-form-pm').value;
    const progress = Number(document.getElementById('project-form-progress').value || 0);

    if (id) {
      // Edit
      const project = state.projects.find(p => p.ID === id);
      if (project) {
        project.Name = name;
        project.Description = desc;
        project.Department = dept;
        project.Status = status;
        project.PlannedStartDate = plannedStart;
        project.PlannedEndDate = plannedEnd;
        project.ActualStartDate = actualStart;
        project.ActualEndDate = actualEnd;
        project.Budget = budget;
        project.Spent = spent;
        project.ProjectManager = pm;
        project.Progress = progress;
        calculateProjectDelaysAndStatus(project);
      }
    } else {
      // Add New
      const newId = String(state.projects.length > 0 ? Math.max(...state.projects.map(p => Number(p.ID))) + 1 : 1);
      const newProj = {
        ID: newId,
        Name: name,
        Description: desc,
        Department: dept,
        Status: status,
        PlannedStartDate: plannedStart,
        PlannedEndDate: plannedEnd,
        ActualStartDate: actualStart,
        ActualEndDate: actualEnd,
        Budget: budget,
        Spent: spent,
        DaysDelayed: 0,
        ProjectManager: pm,
        Progress: progress
      };
      calculateProjectDelaysAndStatus(newProj);
      state.projects.push(newProj);

      // Auto create a default task for it (Parent task 1)
      state.tasks.push({
        ID: '1',
        ProjectID: newId,
        Name: 'Project Kickoff & Setup',
        PlannedStartDate: actualStart || plannedStart,
        PlannedEndDate: new Date(new Date(actualStart || plannedStart).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ActualStartDate: actualStart || plannedStart,
        ActualEndDate: '',
        Progress: progress,
        Status: progress === 100 ? 'completed' : (progress > 0 ? 'in-progress' : 'not-started'),
        Assignee: pm,
        DaysDelayed: 0,
        DelayReason: '',
        DelayImpact: '',
        DelayReportedBy: ''
      });
    }

    // Refresh dynamic team members check
    normalizeStateData();
    saveState();
    closeModal('modal-project');

    if (id) {
      showProjectDetails(id);
    } else {
      switchView('projects');
    }
  });

  // Log Delay Form Submit
  document.getElementById('form-delay').addEventListener('submit', (e) => {
    e.preventDefault();
    const taskId = document.getElementById('delay-form-task').value;
    const date = document.getElementById('delay-form-date').value;
    const days = Number(document.getElementById('delay-form-days').value);
    const reason = document.getElementById('delay-form-reason').value;
    const impact = document.getElementById('delay-form-impact').value;
    const reporter = document.getElementById('delay-form-reporter').value;

    if (taskId) {
      const task = state.tasks.find(t => t.ID === taskId && t.ProjectID === currentProjectId);
      if (task) {
        task.DaysDelayed = days;
        task.DelayReason = reason;
        task.DelayImpact = impact;
        task.DelayReportedBy = reporter;
        if (task.Status !== 'completed') {
          task.Status = 'blocked';
        }
      }
    }

    // Recalculate parent project delay status
    const project = state.projects.find(p => p.ID === currentProjectId);
    if (project) {
      calculateProjectDelaysAndStatus(project);
    }

    normalizeStateData();
    saveState();
    closeModal('modal-delay');
    showProjectDetails(currentProjectId);
  });

  // Add Task Form Submit
  document.getElementById('form-task').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('task-form-name').value;
    const start = document.getElementById('task-form-start').value;
    const end = document.getElementById('task-form-end').value;
    const status = document.getElementById('task-form-status').value;
    const assignee = document.getElementById('task-form-assignee').value;
    const level = document.getElementById('task-form-level').value;
    const parentId = document.getElementById('task-form-parent').value;

    // Generate task ID hierarchically
    const taskId = getNextTaskId(currentProjectId, level, parentId);
    const progressMap = { 'not-started': 0, 'in-progress': 50, 'completed': 100, 'blocked': 20 };

    const newTask = {
      ID: taskId,
      ProjectID: currentProjectId,
      Name: name,
      PlannedStartDate: start,
      PlannedEndDate: end,
      ActualStartDate: status === 'not-started' ? '' : start,
      ActualEndDate: status === 'completed' ? end : '',
      Progress: progressMap[status] || 0,
      Status: status,
      Assignee: assignee,
      DaysDelayed: 0,
      DelayReason: '',
      DelayImpact: '',
      DelayReportedBy: ''
    };

    state.tasks.push(newTask);

    // Recalculate rollup progress and project progress
    recalculateProjectProgress(currentProjectId);

    closeModal('modal-task');
  });

  // EXCEL INTERFACES

  // Export Excel (safe check)
  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      try {
        const wb = generateWorkbookData();
        XLSX.writeFile(wb, 'database.xlsx');
        alert('Database exported successfully as database.xlsx! Overwrite the old database.xlsx in your workspace to persist it permanently.');
      } catch (err) {
        console.error('Failed to export Excel workbook:', err);
        alert('Error exporting database to Excel: ' + err.message);
      }
    });
  }

  // Import Excel
  document.getElementById('excel-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });

        parseExcelData(workbook);
        saveState();
        alert('Database imported successfully from ' + file.name + '!');

        // Refresh Current Screen
        initUI();
      } catch (err) {
        console.error('Excel Import Error:', err);
        alert('Failed to parse Excel file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Global Export namespace for events from HTML
window.app = {
  switchView,
  showProjectDetails,
  toggleTaskComplete,
  setGanttViewScale,
  toggleTheme
};
