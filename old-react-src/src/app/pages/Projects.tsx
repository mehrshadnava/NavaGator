import { useState } from 'react';
import { Link } from 'react-router';
import { mockProjects } from '../data/mockData';
import { Department, ProjectStatus } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { StatusBadge } from '../components/StatusBadge';
import { Filter, Calendar, DollarSign, Users, ArrowRight } from 'lucide-react';

const departments: Array<Department | 'All'> = [
  'All', 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations',
];

const statuses: Array<ProjectStatus | 'All'> = ['All', 'on-track', 'at-risk', 'delayed', 'completed'];

const statusLabels: Record<ProjectStatus, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'delayed': 'Delayed',
  'completed': 'Completed',
};

export function Projects() {
  const [dept, setDept] = useState<Department | 'All'>('All');
  const [status, setStatus] = useState<ProjectStatus | 'All'>('All');

  const filtered = mockProjects.filter(p => {
    const deptMatch = dept === 'All' || p.department === dept;
    const statusMatch = status === 'All' || p.status === status;
    return deptMatch && statusMatch;
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1>Projects</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} of {mockProjects.length} projects</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Department:</span>
          {departments.map(d => (
            <Button
              key={d}
              variant={dept === d ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDept(d)}
            >
              {d}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-4" />
          <span className="text-sm text-muted-foreground">Status:</span>
          {statuses.map(s => (
            <Button
              key={s}
              variant={status === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatus(s)}
            >
              {s === 'All' ? 'All' : statusLabels[s]}
            </Button>
          ))}
        </div>
      </div>

      {/* Project cards */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(project => (
          <Card key={project.id} className="hover:shadow-md transition-shadow flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base leading-tight">{project.name}</CardTitle>
                  <CardDescription className="mt-1 line-clamp-2">{project.description}</CardDescription>
                </div>
                <StatusBadge status={project.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 flex flex-col">
              {/* Progress */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Progress</span>
                  <span className="text-xs">{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="h-1.5" />
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs">{fmt(project.spent)} / {fmt(project.budget)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs">{project.team.length + 1} members</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs">{fmtDate(project.startDate)} → {fmtDate(project.actualEndDate || project.endDate)}</span>
                </div>
              </div>

              {/* Dept tag */}
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="text-xs px-2 py-1 bg-muted rounded-full text-muted-foreground">
                  {project.department}
                </span>
                <Link to={`/projects/${project.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1 h-7">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
