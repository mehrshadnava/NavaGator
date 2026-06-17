/* app.js - Core Logic for Enterprise Project Tracker */

// App State
let state = {
  projects: [],
  teamMembers: [],
  tasks: [],
  delays: []
};

// Global active project ID for details view
let currentProjectId = null;

// Fallback mock data has been removed to enforce empty database initialization.

// Helper: Save current state to localStorage
function saveState() {
  localStorage.setItem('tracker_state', JSON.stringify(state));
}

// Format Currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
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

function parseExcelData(workbook) {
  const sheetProjectsTasks = workbook.Sheets['ProjectsAndTasks'];
  const sheetMembers = workbook.Sheets['TeamMembers'] || workbook.Sheets['Users'];

  if (!sheetProjectsTasks || !sheetMembers) {
    throw new Error('Missing worksheets! Make sure the Excel workbook has ProjectsAndTasks and TeamMembers sheets.');
  }

  const rows = XLSX.utils.sheet_to_json(sheetProjectsTasks) || [];
  const members = XLSX.utils.sheet_to_json(sheetMembers) || [];

  const projectsMap = new Map();
  const tasksMap = new Map();
  const delaysMap = new Map();

  rows.forEach((row, index) => {
    const projId = String(row.ProjectID || row.ProjectId || '');
    if (!projId) return;

    // 1. Process Project
    if (!projectsMap.has(projId)) {
      projectsMap.set(projId, {
        ID: projId,
        Name: row.ProjectName || '',
        Description: row.ProjectDescription || '',
        Department: row.Department || '',
        Status: row.ProjectStatus || 'on-track',
        Budget: Number(row.Budget || 0),
        Spent: Number(row.Spent || 0),
        PlannedStartDate: row.ProjectPlannedStartDate || row.ProjectStartDate || row.StartDate || '',
        PlannedEndDate: row.ProjectPlannedEndDate || row.ProjectEndDate || row.EndDate || '',
        ActualStartDate: row.ProjectActualStartDate || '',
        ActualEndDate: row.ProjectActualEndDate || '',
        DaysDelayed: 0, // Will be computed
        ProjectManager: row.ProjectManager || '',
        Progress: 0 // Will be computed
      });
    }

    // 2. Process Task
    const taskId = String(row.TaskID || row.TaskId || '');
    if (taskId) {
      if (!tasksMap.has(taskId)) {
        tasksMap.set(taskId, {
          ID: taskId,
          ProjectID: projId,
          Name: row.TaskName || '',
          StartDate: row.TaskStartDate || '',
          EndDate: row.TaskEndDate || '',
          Progress: Number(row.TaskProgress || 0),
          Status: row.TaskStatus || 'not-started',
          Assignee: row.TaskAssignee || ''
        });
      }
    }

    // 3. Process Delay
    const delayReason = row.DelayReason || '';
    const delayDays = Number(row.DelayDays || 0);
    if (delayReason || delayDays > 0) {
      const delayId = `d_${projId}_${taskId || index}`;
      if (!delaysMap.has(delayId)) {
        delaysMap.set(delayId, {
          ID: delayId,
          ProjectID: projId,
          Date: row.TaskStartDate || new Date().toISOString().split('T')[0],
          Reason: delayReason,
          Impact: row.DelayImpact || '',
          ReportedBy: row.DelayReportedBy || row.ProjectManager || '',
          DaysDelayed: delayDays
        });
      }
    }
  });

  state.projects = Array.from(projectsMap.values());
  state.tasks = Array.from(tasksMap.values());
  state.delays = Array.from(delaysMap.values());
  state.teamMembers = members;

  normalizeStateData();
  
  // Recalculate project progress, delays, and statuses
  state.projects.forEach(p => {
    const pTasks = state.tasks.filter(t => t.ProjectID === p.ID);
    if (pTasks.length > 0) {
      const sum = pTasks.reduce((s, t) => s + t.Progress, 0);
      p.Progress = Math.round(sum / pTasks.length);
    }
    calculateProjectDelaysAndStatus(p);
  });
}

// Calculate delays and status automatically based on planned/actual dates
function calculateProjectDelaysAndStatus(project) {
  const todayStr = '2026-06-13'; // Simulated simulation date
  const today = new Date(todayStr);

  const plannedStart = project.PlannedStartDate ? new Date(project.PlannedStartDate) : null;
  const plannedEnd = project.PlannedEndDate ? new Date(project.PlannedEndDate) : null;
  const actualStart = project.ActualStartDate ? new Date(project.ActualStartDate) : null;
  const actualEnd = project.ActualEndDate ? new Date(project.ActualEndDate) : null;

  let daysDelayed = 0;

  // 1. Calculate delay in days
  if (actualEnd && plannedEnd) {
    // Project is complete
    if (actualEnd > plannedEnd) {
      daysDelayed = Math.max(0, Math.round((actualEnd - plannedEnd) / (1000 * 60 * 60 * 24)));
    }
  } else if (actualStart) {
    // Project is in progress
    if (plannedEnd && today > plannedEnd) {
      // Exceeded planned end date
      daysDelayed = Math.max(0, Math.round((today - plannedEnd) / (1000 * 60 * 60 * 24)));
    } else if (plannedStart && actualStart > plannedStart) {
      // Started late (carries over as a current delay)
      daysDelayed = Math.max(0, Math.round((actualStart - plannedStart) / (1000 * 60 * 60 * 24)));
    }
  } else {
    // Project has not started
    if (plannedStart && today > plannedStart) {
      // Exceeded planned start date without starting
      daysDelayed = Math.max(0, Math.round((today - plannedStart) / (1000 * 60 * 60 * 24)));
    }
  }

  project.DaysDelayed = daysDelayed;

  // Determine status automatically
  if (project.Progress === 100 || actualEnd) {
    project.Status = 'completed';
  } else if (daysDelayed > 0) {
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
  });
  state.tasks.forEach(t => {
    t.Progress = Number(t.Progress || 0);
    t.ProjectID = String(t.ProjectID);
    t.ID = String(t.ID);
  });
  state.delays.forEach(d => {
    d.ProjectID = String(d.ProjectID);
    d.ID = String(d.ID);
    d.DaysDelayed = Number(d.DaysDelayed || 0);
  });
  state.teamMembers.forEach(m => {
    m.id = String(m.id || m.ID || m.id || '');
  });
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
    document.getElementById('btn-export-excel').style.display = 'none';
    document.getElementById('btn-add-project').style.display = 'none';
    
    // Disable menu items
    document.querySelectorAll('.sidebar .menu-item').forEach(item => {
      item.classList.add('disabled');
      item.style.opacity = '0.3';
      item.style.pointerEvents = 'none';
    });
  } else {
    // Show normal actions
    document.getElementById('btn-export-excel').style.display = 'inline-flex';
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

  // Update Metric Nodes
  document.getElementById('stat-total-projects').textContent = totalProjects;
  document.getElementById('stat-projects-breakdown').textContent = `${activeProjects} active | ${completedProjects} completed`;
  
  document.getElementById('stat-total-budget').textContent = formatCurrency(totalBudget);
  document.getElementById('stat-budget-spent').textContent = `Spent: ${formatCurrency(totalSpent)} (${budgetUtilization}%)`;

  document.getElementById('stat-avg-progress').textContent = `${avgProgress}%`;
  
  document.getElementById('stat-delayed-count').textContent = delayedCount;
  document.getElementById('stat-delayed-days').textContent = `${totalDelayDays} total delay days logged`;

  // Draw Charts
  drawDashboardCharts();

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
  const ctxStatus = document.getElementById('chart-statuses').getContext('2d');

  if (deptChartInstance) deptChartInstance.destroy();
  if (statusChartInstance) statusChartInstance.destroy();

  const depts = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
  const deptCounts = depts.map(d => state.projects.filter(p => p.Department === d).length);

  deptChartInstance = new Chart(ctxDept, {
    type: 'bar',
    data: {
      labels: depts,
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
        x: { ticks: { color: '#d7c8d1' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#d7c8d1', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  const statuses = ['on-track', 'at-risk', 'delayed', 'completed'];
  const statusLabels = ['On Track', 'At Risk', 'Delayed', 'Completed'];
  const statusCounts = statuses.map(s => state.projects.filter(p => p.Status === s).length);

  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: statusLabels,
      datasets: [{
        data: statusCounts,
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#ec4899'],
        borderColor: '#1b0e16',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#d7c8d1', font: { family: 'Plus Jakarta Sans', size: 12 } }
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

  return `
    <div class="project-card" onclick="app.showProjectDetails('${project.ID}')">
      <div class="project-card-header">
        <div style="flex: 1; min-width: 0;">
          <h3 class="project-card-title">${project.Name}</h3>
          <p class="project-card-desc">${project.Description}</p>
        </div>
        <span class="badge badge-${project.Status}">${statusLabels[project.Status]}</span>
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
            <i data-lucide="dollar-sign"></i>
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
        <span class="badge badge-dept">${project.Department}</span>
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
    const matchesStatus = selectedStatus === 'All' || p.Status === selectedStatus;
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
  statusBadge.className = `badge badge-${project.Status}`;
  statusBadge.textContent = project.Status.replace('-', ' ');

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
      <div class="avatar-circle pm">${pmInfo.name ? pmInfo.name.split(' ').map(n=>n[0]).join('') : 'PM'}</div>
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
        <div class="avatar-circle">${info.name ? info.name.split(' ').map(n=>n[0]).join('') : 'C'}</div>
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

  if (projectTasks.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--text-secondary);">Add tasks to view the Gantt chart timeline.</div>`;
    return;
  }

  // Find overall chart start and end dates
  const taskTimings = projectTasks.map(t => ({ start: new Date(t.StartDate).getTime(), end: new Date(t.EndDate).getTime() }));
  
  let minTime = Math.min(...taskTimings.map(t => t.start));
  let maxTime = Math.max(...taskTimings.map(t => t.end));
  
  // Expand start/end slightly for buffer
  minTime = minTime - 3 * 24 * 60 * 60 * 1000;
  maxTime = maxTime + 7 * 24 * 60 * 60 * 1000;

  const totalDuration = maxTime - minTime;

  // Month Ticks calculation
  const months = [];
  let current = new Date(minTime);
  current.setDate(1); // Set to start of month
  
  while (current.getTime() <= maxTime) {
    months.push({
      label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      offset: ((current.getTime() - minTime) / totalDuration) * 100
    });
    current.setMonth(current.getMonth() + 1);
  }

  // Grid Lines HTML
  const gridLinesHtml = months.map(m => `
    <div class="gantt-grid-line" style="left: ${m.offset}%"></div>
  `).join('');

  // Month Headers HTML
  const monthHeadersHtml = months.map(m => `
    <div class="gantt-month-label" style="left: calc(220px + ${m.offset}%)">${m.label}</div>
  `).join('');

  // Today marker line
  const todayTime = new Date('2026-06-13').getTime(); // Current simulation date
  let todayLineHtml = '';
  if (todayTime >= minTime && todayTime <= maxTime) {
    const todayOffset = ((todayTime - minTime) / totalDuration) * 100;
    todayLineHtml = `
      <div class="gantt-today-line" style="left: calc(220px + ${todayOffset}%)">
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

  const taskRowsHtml = projectTasks.map(t => {
    const tStart = new Date(t.StartDate).getTime();
    const tEnd = new Date(t.EndDate).getTime();
    
    const leftOffset = ((tStart - minTime) / totalDuration) * 100;
    const width = ((tEnd - tStart) / totalDuration) * 100;
    const color = colorsMap[t.Status] || '#810055';

    return `
      <div class="gantt-row">
        <div class="gantt-task-label">
          <div class="gantt-task-name">${t.Name}</div>
          <div class="gantt-task-assignee">${t.Assignee || 'Unassigned'}</div>
        </div>
        <div class="gantt-bar-container">
          <div class="gantt-bar" style="left: ${leftOffset}%; width: ${width}%">
            <div class="gantt-bar-progress" style="width: ${t.Progress}%; background-color: ${color}"></div>
            <div class="gantt-bar-text">${t.Progress}%</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Gantt Header -->
    <div class="gantt-header">
      <div class="gantt-label-column-header">Tasks / Assignee</div>
      <div class="gantt-timeline-header">
        ${monthHeadersHtml}
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

    <!-- Gantt Legend -->
    <div class="gantt-legend">
      <div class="legend-item"><div class="legend-color" style="background-color: #10b981;"></div><span>Completed</span></div>
      <div class="legend-item"><div class="legend-color" style="background-color: #ec4899;"></div><span>In Progress</span></div>
      <div class="legend-item"><div class="legend-color" style="background-color: #937b8b;"></div><span>Not Started</span></div>
      <div class="legend-item"><div class="legend-color" style="background-color: #ef4444;"></div><span>Blocked</span></div>
    </div>
  `;
}

function renderProjectTasksTab(project) {
  const projectTasks = state.tasks.filter(t => t.ProjectID === project.ID);
  const tasksContainer = document.getElementById('detail-tasks-list');

  if (projectTasks.length === 0) {
    tasksContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-secondary);">No tasks created. Click "Add Task" to initialize project timeline.</div>`;
    return;
  }

  tasksContainer.innerHTML = projectTasks.map((t, index) => {
    const isChecked = t.Status === 'completed';
    return `
      <div class="task-item">
        <div class="task-checkbox-wrapper">
          <input type="checkbox" class="task-checkbox" data-task-id="${t.ID}" ${isChecked ? 'checked' : ''} onchange="app.toggleTaskComplete('${t.ID}', this.checked)">
        </div>
        <div class="task-details">
          <div class="task-title-row">
            <span class="task-title">${t.Name}</span>
            <span class="task-badge task-badge-${t.Status}">${t.Status.replace('-', ' ')}</span>
          </div>
          <div class="task-meta">
            <span>Assignee: <strong>${t.Assignee || 'Unassigned'}</strong></span>
            <span>Schedule: ${formatDate(t.StartDate)} - ${formatDate(t.EndDate)}</span>
          </div>
        </div>
        <div class="task-progress-col">
          <div class="progress-label-row">
            <span>Progress</span>
            <span>${t.Progress}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill fill-cyan" style="width: ${t.Progress}%"></div>
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
        <td style="font-weight: 600; color: white;">${m.name}</td>
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
  const task = state.tasks.find(t => t.ID === taskId);
  if (!task) return;

  if (isChecked) {
    task.Status = 'completed';
    task.Progress = 100;
  } else {
    task.Status = 'in-progress';
    task.Progress = 50;
  }

  // Recalculate project progress
  recalculateProjectProgress(task.ProjectID);
}

// Recalculate average progress for a project based on its tasks
function recalculateProjectProgress(projectId) {
  const project = state.projects.find(p => p.ID === projectId);
  if (!project) return;

  const projectTasks = state.tasks.filter(t => t.ProjectID === projectId);
  if (projectTasks.length > 0) {
    const sum = projectTasks.reduce((s, t) => s + t.Progress, 0);
    project.Progress = Math.round(sum / projectTasks.length);
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

  document.getElementById('btn-add-delay').addEventListener('click', () => {
    document.getElementById('form-delay').reset();
    document.getElementById('delay-form-date').value = new Date().toISOString().split('T')[0];
    openModal('modal-delay');
  });

  document.getElementById('btn-add-task').addEventListener('click', () => {
    document.getElementById('form-task').reset();
    document.getElementById('task-form-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('task-form-end').value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    openModal('modal-task');
  });

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
      
      // Auto create a default task for it
      state.tasks.push({
        ID: `task${newId}-1`,
        ProjectID: newId,
        Name: 'Project Kickoff & Setup',
        StartDate: actualStart || plannedStart,
        EndDate: new Date(new Date(actualStart || plannedStart).getTime() + 5*24*60*60*1000).toISOString().split('T')[0],
        Progress: progress,
        Status: progress === 100 ? 'completed' : (progress > 0 ? 'in-progress' : 'not-started'),
        Assignee: pm
      });
    }

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
    const date = document.getElementById('delay-form-date').value;
    const days = Number(document.getElementById('delay-form-days').value);
    const reason = document.getElementById('delay-form-reason').value;
    const impact = document.getElementById('delay-form-impact').value;
    const reporter = document.getElementById('delay-form-reporter').value;

    const delayId = `d${state.delays.length + 1}`;
    const newDelay = {
      ID: delayId,
      ProjectID: currentProjectId,
      Date: date,
      Reason: reason,
      Impact: impact,
      ReportedBy: reporter,
      DaysDelayed: days
    };

    state.delays.push(newDelay);

    // Save state and recalculate parent project delay status
    const project = state.projects.find(p => p.ID === currentProjectId);
    if (project) {
      calculateProjectDelaysAndStatus(project);
    }

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

    const taskId = `task${currentProjectId}-${state.tasks.filter(t => t.ProjectID === currentProjectId).length + 1}`;
    const progressMap = { 'not-started': 0, 'in-progress': 50, 'completed': 100, 'blocked': 20 };

    const newTask = {
      ID: taskId,
      ProjectID: currentProjectId,
      Name: name,
      StartDate: start,
      EndDate: end,
      Progress: progressMap[status] || 0,
      Status: status,
      Assignee: assignee
    };

    state.tasks.push(newTask);
    saveState();
    
    // Recalculate average project progress
    recalculateProjectProgress(currentProjectId);
    
    closeModal('modal-task');
  });

  // EXCEL INTERFACES

  // Export Excel
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    try {
      const wb = XLSX.utils.book_new();
      
      const flatRows = [];
      
      state.projects.forEach(p => {
        const pTasks = state.tasks.filter(t => t.ProjectID === p.ID);
        const pDelays = state.delays.filter(d => d.ProjectID === p.ID);
        
        const rowCount = Math.max(pTasks.length, pDelays.length, 1);
        
        for (let i = 0; i < rowCount; i++) {
          const task = pTasks[i] || {};
          const delay = pDelays[i] || {};
          
          flatRows.push({
            ProjectID: p.ID,
            ProjectName: p.Name,
            ProjectDescription: p.Description,
            Department: p.Department,
            ProjectStatus: p.Status,
            Budget: p.Budget,
            Spent: p.Spent,
            ProjectManager: p.ProjectManager,
            ProjectPlannedStartDate: p.PlannedStartDate || '',
            ProjectPlannedEndDate: p.PlannedEndDate || '',
            ProjectActualStartDate: p.ActualStartDate || '',
            ProjectActualEndDate: p.ActualEndDate || '',
            
            TaskID: task.ID || '',
            TaskName: task.Name || '',
            TaskStartDate: task.StartDate || '',
            TaskEndDate: task.EndDate || '',
            TaskProgress: task.Progress !== undefined ? task.Progress : '',
            TaskStatus: task.Status || '',
            TaskAssignee: task.Assignee || '',
            
            DelayDays: delay.DaysDelayed !== undefined ? delay.DaysDelayed : '',
            DelayReason: delay.Reason || '',
            DelayImpact: delay.Impact || '',
            DelayReportedBy: delay.ReportedBy || ''
          });
        }
      });
      
      const wsProjectsTasks = XLSX.utils.json_to_sheet(flatRows);
      const wsMembers = XLSX.utils.json_to_sheet(state.teamMembers);

      XLSX.utils.book_append_sheet(wb, wsProjectsTasks, 'ProjectsAndTasks');
      XLSX.utils.book_append_sheet(wb, wsMembers, 'TeamMembers');

      XLSX.writeFile(wb, 'database.xlsx');
      alert('Database exported successfully as database.xlsx! Overwrite the old database.xlsx in your workspace to persist it permanently.');
    } catch (err) {
      console.error('Failed to export Excel workbook:', err);
      alert('Error exporting database to Excel: ' + err.message);
    }
  });

  // Import Excel
  document.getElementById('excel-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
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
  toggleTaskComplete
};
