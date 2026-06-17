import { useState } from 'react';
import { Link } from 'react-router';
import { mockProjects } from '../data/mockData';
import { DashboardStats } from '../components/DashboardStats';
import { ProjectCard } from '../components/ProjectCard';
import { TimelineChart } from '../components/TimelineChart';
import { DepartmentChart } from '../components/DepartmentChart';
import { Department } from '../types';
import { Button } from '../components/ui/button';
import { Filter, ArrowRight } from 'lucide-react';

export function Dashboard() {
  const [selectedDepartment, setSelectedDepartment] = useState<Department | 'All'>('All');

  const departments: Array<Department | 'All'> = [
    'All', 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations',
  ];

  const filteredProjects = selectedDepartment === 'All'
    ? mockProjects
    : mockProjects.filter(p => p.department === selectedDepartment);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage projects across all departments</p>
        </div>
        <Link to="/projects">
          <Button variant="outline" size="sm" className="gap-1">
            All Projects <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <DashboardStats projects={mockProjects} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TimelineChart projects={mockProjects} />
        <DepartmentChart projects={mockProjects} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2>Recent Projects</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {departments.map(dept => (
              <Button
                key={dept}
                variant={selectedDepartment === dept ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDepartment(dept)}
              >
                {dept}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.slice(0, 6).map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </div>
  );
}
