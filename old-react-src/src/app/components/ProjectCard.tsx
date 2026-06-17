import { Project } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { StatusBadge } from './StatusBadge';
import { Progress } from './ui/progress';
import { User, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <Link to={`/projects/${project.id}`} className="block">
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{project.name}</CardTitle>
              <CardDescription className="mt-1">{project.description}</CardDescription>
            </div>
            <StatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm">{project.progress}%</span>
            </div>
            <Progress value={project.progress} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{project.projectManager.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(project.endDate)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{formatCurrency(project.spent)} / {formatCurrency(project.budget)}</span>
            </div>
            {project.daysDelayed && project.daysDelayed > 0 && (
              <div className="flex items-center gap-1 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span>{project.daysDelayed}d delay</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <span className="text-sm px-2 py-1 bg-accent rounded-md">{project.department}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
