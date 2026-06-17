import XLSX from 'xlsx';

const projects = [
  {
    'Project id': '1',
    'Project Name': 'Digital Procurement Portal Integration',
    'Project Description': 'Develop and deploy a centralized web portal to digitize all vendor onboarding, bidding, and purchase order tracking.',
    'Project Planned Start Date': '2026-01-10',
    'Project Planned End Date': '2026-06-30',
    'Project Budget': 4500000,
    'Project Spent': 3200000,
    'Project Manager': 'Aarav Mehta',
    'Department': 'corporate procurement digital',
    'Project Status': 'delayed',
    'Project Actual Start Date': '2026-01-12',
    'Project Actual End Date': '',
    'Project Progress': 78
  },
  {
    'Project id': '2',
    'Project Name': 'Steel Foundry Capex Expansion',
    'Project Description': 'Install new electric arc furnace and expand foundry capacity at Odisha plant to meet increasing steel demand.',
    'Project Planned Start Date': '2025-11-01',
    'Project Planned End Date': '2026-05-31',
    'Project Budget': 15000000,
    'Project Spent': 14200000,
    'Project Manager': 'Rajesh Singh',
    'Department': 'steel',
    'Project Status': 'completed',
    'Project Actual Start Date': '2025-11-01',
    'Project Actual End Date': '2026-06-10',
    'Project Progress': 100
  },
  {
    'Project id': '3',
    'Project Name': 'EXIM Trade Banking API Automation',
    'Project Description': 'Automate letter of credit and bank guarantee issuance processes with banking partner APIs for export operations.',
    'Project Planned Start Date': '2026-03-01',
    'Project Planned End Date': '2026-08-31',
    'Project Budget': 2500000,
    'Project Spent': 1100000,
    'Project Manager': 'Divya Iyer',
    'Department': 'banking',
    'Project Status': 'on-track',
    'Project Actual Start Date': '2026-03-05',
    'Project Actual End Date': '',
    'Project Progress': 45
  }
];

const tasks = [
  // Project 1 Tasks
  {
    'Project id': '1',
    'Task Id': '1',
    'Task Name': 'Requirement Specification',
    'Task Planned Start Date': '2026-01-10',
    'Task Planned End Date': '2026-02-15',
    'Task Actual Start Date': '2026-01-12',
    'Task Actual End Date': '2026-02-16',
    'Task Assignee': 'Aarav Mehta',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '1',
    'Task Id': '1.1',
    'Task Name': 'Vendor Registration Workflow',
    'Task Planned Start Date': '2026-01-15',
    'Task Planned End Date': '2026-02-05',
    'Task Actual Start Date': '2026-01-15',
    'Task Actual End Date': '2026-02-04',
    'Task Assignee': 'Neha Sharma',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '1',
    'Task Id': '1.2',
    'Task Name': 'PO Approval Flow Definition',
    'Task Planned Start Date': '2026-02-01',
    'Task Planned End Date': '2026-02-15',
    'Task Actual Start Date': '2026-02-02',
    'Task Actual End Date': '2026-02-16',
    'Task Assignee': 'Rahul Verma',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '1',
    'Task Id': '2',
    'Task Name': 'Portal Core Development',
    'Task Planned Start Date': '2026-02-20',
    'Task Planned End Date': '2026-05-15',
    'Task Actual Start Date': '2026-02-22',
    'Task Actual End Date': '',
    'Task Assignee': 'Amit Patel',
    'Task Status': 'in-progress',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 80
  },
  {
    'Project id': '1',
    'Task Id': '2.1',
    'Task Name': 'MDM Database Synchronization',
    'Task Planned Start Date': '2026-02-20',
    'Task Planned End Date': '2026-03-25',
    'Task Actual Start Date': '2026-02-24',
    'Task Actual End Date': '2026-03-30',
    'Task Assignee': 'Amit Patel',
    'Task Status': 'completed',
    'Task Days Delayed': 5,
    'Task Delay Reason': 'Master Data Schema mismatched with legacy systems',
    'Task Delay Impact': 'Database sync took 5 days extra',
    'Task Delay Reported By': 'Amit Patel',
    'Task Progress': 100
  },
  {
    'Project id': '1',
    'Task Id': '2.2',
    'Task Name': 'Bidding Module Implementation',
    'Task Planned Start Date': '2026-03-26',
    'Task Planned End Date': '2026-05-15',
    'Task Actual Start Date': '2026-04-01',
    'Task Actual End Date': '',
    'Task Assignee': 'Neha Sharma',
    'Task Status': 'in-progress',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 60
  },
  {
    'Project id': '1',
    'Task Id': '2.2.1',
    'Task Name': 'Reverse Auction Engine',
    'Task Planned Start Date': '2026-03-26',
    'Task Planned End Date': '2026-04-20',
    'Task Actual Start Date': '2026-04-01',
    'Task Actual End Date': '2026-04-25',
    'Task Assignee': 'Neha Sharma',
    'Task Status': 'completed',
    'Task Days Delayed': 5,
    'Task Delay Reason': 'Complex business logic approval from finance was delayed',
    'Task Delay Impact': 'Reverse auction deployment delayed by 5 days',
    'Task Delay Reported By': 'Aarav Mehta',
    'Task Progress': 100
  },
  {
    'Project id': '1',
    'Task Id': '2.2.2',
    'Task Name': 'Bid Security Verification',
    'Task Planned Start Date': '2026-04-21',
    'Task Planned End Date': '2026-05-15',
    'Task Actual Start Date': '2026-04-26',
    'Task Actual End Date': '',
    'Task Assignee': 'Rahul Verma',
    'Task Status': 'in-progress',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 20
  },
  
  // Project 2 Tasks
  {
    'Project id': '2',
    'Task Id': '1',
    'Task Name': 'Site Preparation & Foundation Work',
    'Task Planned Start Date': '2025-11-01',
    'Task Planned End Date': '2025-12-15',
    'Task Actual Start Date': '2025-11-01',
    'Task Actual End Date': '2025-12-15',
    'Task Assignee': 'Rajesh Singh',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '2',
    'Task Id': '2',
    'Task Name': 'Furnace Procurement & Import',
    'Task Planned Start Date': '2025-12-16',
    'Task Planned End Date': '2026-03-10',
    'Task Actual Start Date': '2025-12-20',
    'Task Actual End Date': '2026-03-25',
    'Task Assignee': 'Vikram Malhotra',
    'Task Status': 'completed',
    'Task Days Delayed': 15,
    'Task Delay Reason': 'Suez Canal route congestion delayed customs clearance at Mumbai port',
    'Task Delay Impact': 'Furnace arrival delayed by 15 days',
    'Task Delay Reported By': 'Vikram Malhotra',
    'Task Progress': 100
  },
  {
    'Project id': '2',
    'Task Id': '2.1',
    'Task Name': 'Customs Clearance & EXIM Paperwork',
    'Task Planned Start Date': '2026-02-10',
    'Task Planned End Date': '2026-03-10',
    'Task Actual Start Date': '2026-02-15',
    'Task Actual End Date': '2026-03-25',
    'Task Assignee': 'Vikram Malhotra',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '2',
    'Task Id': '3',
    'Task Name': 'Erection & Commissioning',
    'Task Planned Start Date': '2026-03-11',
    'Task Planned End Date': '2026-05-31',
    'Task Actual Start Date': '2026-03-26',
    'Task Actual End Date': '2026-06-10',
    'Task Assignee': 'Sanjay Dutt',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  
  // Project 3 Tasks
  {
    'Project id': '3',
    'Task Id': '1',
    'Task Name': 'Banking API Integration Guide',
    'Task Planned Start Date': '2026-03-01',
    'Task Planned End Date': '2026-04-10',
    'Task Actual Start Date': '2026-03-05',
    'Task Actual End Date': '2026-04-12',
    'Task Assignee': 'Kunal Sen',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '3',
    'Task Id': '2',
    'Task Name': 'API Security & Token Engine',
    'Task Planned Start Date': '2026-04-11',
    'Task Planned End Date': '2026-05-31',
    'Task Actual Start Date': '2026-04-13',
    'Task Actual End Date': '2026-05-30',
    'Task Assignee': 'Kunal Sen',
    'Task Status': 'completed',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 100
  },
  {
    'Project id': '3',
    'Task Id': '3',
    'Task Name': 'Letter of Credit Automation Module',
    'Task Planned Start Date': '2026-06-01',
    'Task Planned End Date': '2026-08-31',
    'Task Actual Start Date': '2026-06-01',
    'Task Actual End Date': '',
    'Task Assignee': 'Divya Iyer',
    'Task Status': 'in-progress',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 45
  },
  {
    'Project id': '3',
    'Task Id': '3.1',
    'Task Name': 'Draft LC Generation Form',
    'Task Planned Start Date': '2026-06-01',
    'Task Planned End Date': '2026-07-15',
    'Task Actual Start Date': '2026-06-02',
    'Task Actual End Date': '',
    'Task Assignee': 'Meera Nair',
    'Task Status': 'in-progress',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 70
  },
  {
    'Project id': '3',
    'Task Id': '3.2',
    'Task Name': 'Bank API Callback Webhook',
    'Task Planned Start Date': '2026-07-16',
    'Task Planned End Date': '2026-08-31',
    'Task Actual Start Date': '',
    'Task Actual End Date': '',
    'Task Assignee': 'Meera Nair',
    'Task Status': 'not-started',
    'Task Days Delayed': 0,
    'Task Delay Reason': '',
    'Task Delay Impact': '',
    'Task Delay Reported By': '',
    'Task Progress': 0
  }
];

const teamMembers = [
  { id: 'tm1', name: 'Aarav Mehta', role: 'Senior Project Manager', department: 'corporate procurement digital' },
  { id: 'tm2', name: 'Rajesh Singh', role: 'Senior Project Manager', department: 'steel' },
  { id: 'tm3', name: 'Divya Iyer', role: 'Senior Project Manager', department: 'banking' },
  { id: 'tm4', name: 'Neha Sharma', role: 'Lead Frontend Engineer', department: 'corporate procurement digital' },
  { id: 'tm5', name: 'Rahul Verma', role: 'Workflow Designer', department: 'corporate procurement digital' },
  { id: 'tm6', name: 'Amit Patel', role: 'Full Stack Developer', department: 'corporate procurement digital' },
  { id: 'tm7', name: 'Vikram Malhotra', role: 'EXIM Logistics Manager', department: 'exports' },
  { id: 'tm8', name: 'Sanjay Dutt', role: 'Commissioning Engineer', department: 'steel' },
  { id: 'tm9', name: 'Kunal Sen', role: 'API Security Engineer', department: 'it' },
  { id: 'tm10', name: 'Meera Nair', role: 'Software Engineer', department: 'banking' }
];

try {
  const wb = XLSX.utils.book_new();
  const wsProjects = XLSX.utils.json_to_sheet(projects);
  const wsTasks = XLSX.utils.json_to_sheet(tasks);
  const wsMembers = XLSX.utils.json_to_sheet(teamMembers);

  XLSX.utils.book_append_sheet(wb, wsProjects, 'Project Details');
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks');
  XLSX.utils.book_append_sheet(wb, wsMembers, 'TeamMembers');

  XLSX.writeFile(wb, 'database.xlsx');
  console.log('Successfully generated database.xlsx');
} catch (e) {
  console.error(e);
}
