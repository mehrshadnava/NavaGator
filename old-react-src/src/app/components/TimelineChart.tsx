import { Project } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { StatusBadge } from './StatusBadge';

interface TimelineChartProps {
  projects: Project[];
}

export function TimelineChart({ projects }: TimelineChartProps) {
  const getDatePosition = (date: string, minDate: Date, maxDate: Date) => {
    const dateObj = new Date(date);
    const totalDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    const daysFromStart = (dateObj.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return (daysFromStart / totalDays) * 100;
  };

  const getBarWidth = (startDate: string, endDate: string, minDate: Date, maxDate: Date) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    const projectDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return (projectDays / totalDays) * 100;
  };

  // Find min and max dates
  const allDates = projects.flatMap(p => [new Date(p.startDate), new Date(p.actualEndDate || p.endDate)]);
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

  // Generate month markers
  const months: Date[] = [];
  const current = new Date(minDate);
  current.setDate(1);
  while (current <= maxDate) {
    months.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Timeline</CardTitle>
        <CardDescription>Visual timeline showing project schedules and delays</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Timeline Header */}
          <div className="relative h-8 border-b">
            {months.map((month, idx) => {
              const pos = getDatePosition(month.toISOString(), minDate, maxDate);
              return (
                <div
                  key={idx}
                  className="absolute top-0 text-xs text-muted-foreground"
                  style={{ left: `${pos}%` }}
                >
                  {month.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </div>
              );
            })}
          </div>

          {/* Project Bars */}
          <div className="space-y-6">
            {projects.map((project) => {
              const startPos = getDatePosition(project.startDate, minDate, maxDate);
              const plannedWidth = getBarWidth(project.startDate, project.endDate, minDate, maxDate);
              const actualWidth = project.actualEndDate 
                ? getBarWidth(project.startDate, project.actualEndDate, minDate, maxDate)
                : plannedWidth;

              return (
                <div key={project.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="truncate">{project.name}</span>
                      <StatusBadge status={project.status} />
                    </div>
                    <span className="text-sm text-muted-foreground ml-2">
                      {formatDate(project.startDate)} → {formatDate(project.actualEndDate || project.endDate)}
                    </span>
                  </div>
                  <div className="relative h-8 bg-muted/30 rounded">
                    {/* Planned timeline */}
                    <div
                      className="absolute h-full bg-primary/20 rounded border-2 border-primary/40 border-dashed"
                      style={{
                        left: `${startPos}%`,
                        width: `${plannedWidth}%`,
                      }}
                    />
                    {/* Actual timeline */}
                    <div
                      className={`absolute h-full rounded transition-all ${
                        project.status === 'delayed' 
                          ? 'bg-red-500' 
                          : project.status === 'at-risk'
                          ? 'bg-yellow-500'
                          : project.status === 'completed'
                          ? 'bg-green-500'
                          : 'bg-[#810055]'
                      }`}
                      style={{
                        left: `${startPos}%`,
                        width: `${(actualWidth * project.progress) / 100}%`,
                      }}
                    />
                    {/* Progress percentage */}
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 text-xs px-2"
                      style={{ left: `${startPos + 2}%` }}
                    >
                      {project.progress}%
                    </div>
                  </div>
                  {project.daysDelayed && project.daysDelayed > 0 && (
                    <div className="text-sm text-red-600 ml-2">
                      Delayed by {project.daysDelayed} days
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
