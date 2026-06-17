import { Project, Department } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DepartmentChartProps {
  projects: Project[];
}

export function DepartmentChart({ projects }: DepartmentChartProps) {
  const departments: Department[] = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];

  const data = departments.map(dept => {
    const deptProjects = projects.filter(p => p.department === dept);
    return {
      department: dept,
      total: deptProjects.length,
      onTrack: deptProjects.filter(p => p.status === 'on-track').length,
      atRisk: deptProjects.filter(p => p.status === 'at-risk').length,
      delayed: deptProjects.filter(p => p.status === 'delayed').length,
      completed: deptProjects.filter(p => p.status === 'completed').length,
    };
  }).filter(d => d.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects by Department</CardTitle>
        <CardDescription>Status breakdown across departments</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="department" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="completed" stackId="a" fill="#22c55e" name="Completed" />
            <Bar dataKey="onTrack" stackId="a" fill="#810055" name="On Track" />
            <Bar dataKey="atRisk" stackId="a" fill="#eab308" name="At Risk" />
            <Bar dataKey="delayed" stackId="a" fill="#ef4444" name="Delayed" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
