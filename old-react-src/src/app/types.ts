export type ProjectStatus = 'on-track' | 'at-risk' | 'delayed' | 'completed';
export type TaskStatus = 'not-started' | 'in-progress' | 'completed' | 'blocked';

export type Department = 'Engineering' | 'Marketing' | 'Sales' | 'HR' | 'Finance' | 'Operations';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: Department;
  avatar?: string;
  projectIds: string[];
}

export interface Delay {
  id: string;
  date: string;
  reason: string;
  impact: string;
  reportedBy: string;
}

export interface Task {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: TaskStatus;
  assignee?: string;
  dependencies?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  department: Department;
  status: ProjectStatus;
  progress: number;
  startDate: string;
  endDate: string;
  actualEndDate?: string;
  budget: number;
  spent: number;
  projectManager: TeamMember;
  team: TeamMember[];
  delays: Delay[];
  daysDelayed?: number;
  tasks: Task[];
}
