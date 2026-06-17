import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Project } from '../types';
import { FolderKanban, AlertCircle, TrendingUp, DollarSign } from 'lucide-react';

interface DashboardStatsProps {
  projects: Project[];
}

export function DashboardStats({ projects }: DashboardStatsProps) {
  const totalProjects = projects.length;
  const delayedProjects = projects.filter(p => p.status === 'delayed' || p.status === 'at-risk').length;
  const onTrackProjects = projects.filter(p => p.status === 'on-track').length;
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
  const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
  const budgetUtilization = Math.round((totalSpent / totalBudget) * 100);

  const stats = [
    {
      title: 'Total Projects',
      value: totalProjects,
      icon: FolderKanban,
      color: 'text-[#810055]',
    },
    {
      title: 'On Track',
      value: onTrackProjects,
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      title: 'Delayed / At Risk',
      value: delayedProjects,
      icon: AlertCircle,
      color: 'text-red-600',
    },
    {
      title: 'Budget Utilization',
      value: `${budgetUtilization}%`,
      icon: DollarSign,
      color: 'text-blue-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
