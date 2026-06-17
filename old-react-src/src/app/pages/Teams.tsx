import { useState } from 'react';
import { Link } from 'react-router';
import { allTeamMembers, mockProjects } from '../data/mockData';
import { Department } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { User, Briefcase, Filter } from 'lucide-react';

const departments: Array<Department | 'All'> = [
  'All', 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations',
];

const deptColors: Record<Department, string> = {
  Engineering: 'bg-blue-100 text-blue-800',
  Marketing: 'bg-purple-100 text-purple-800',
  Sales: 'bg-green-100 text-green-800',
  HR: 'bg-orange-100 text-orange-800',
  Finance: 'bg-yellow-100 text-yellow-800',
  Operations: 'bg-red-100 text-red-800',
};

export function Teams() {
  const [selectedDept, setSelectedDept] = useState<Department | 'All'>('All');

  const filtered = selectedDept === 'All'
    ? allTeamMembers
    : allTeamMembers.filter(m => m.department === selectedDept);

  const stats = departments.slice(1).map((dept) => ({
    dept,
    count: allTeamMembers.filter(m => m.department === dept).length,
  }));

  const getProjectNames = (projectIds: string[]) =>
    projectIds.map(id => mockProjects.find(p => p.id === id)?.name).filter(Boolean);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1>Team Members</h1>
        <p className="text-muted-foreground mt-1">
          {allTeamMembers.length} members across {stats.length} departments
        </p>
      </div>

      {/* Dept summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ dept, count }) => (
          <Card
            key={dept}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedDept(dept as Department)}
          >
            <CardContent className="pt-4 pb-4 text-center">
              <div className="text-2xl mb-1">{count}</div>
              <div className="text-xs text-muted-foreground">{dept}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {departments.map(dept => (
          <Button
            key={dept}
            variant={selectedDept === dept ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDept(dept)}
          >
            {dept}
          </Button>
        ))}
      </div>

      {/* Members grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((member) => {
          const projects = getProjectNames(member.projectIds);
          return (
            <Card key={member.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{member.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <span className={`text-xs px-2 py-1 rounded-full ${deptColors[member.department]}`}>
                  {member.department}
                </span>
                {projects.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <Briefcase className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Projects</span>
                    </div>
                    <div className="space-y-1">
                      {projects.map((name, i) => {
                        const project = mockProjects.find(p => p.name === name);
                        return (
                          <Link key={i} to={`/projects/${project?.id}`}>
                            <div className="text-xs text-primary hover:underline truncate">
                              {name}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
