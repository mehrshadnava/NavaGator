import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { mockProjects } from '../data/mockData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { StatusBadge } from '../components/StatusBadge';
import { GanttChart } from '../components/GanttChart';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Users,
  AlertTriangle,
  User,
  Clock,
  BarChart2,
  ListTodo,
} from 'lucide-react';

export function ProjectDetail() {
  const { id } = useParams();
  const project = mockProjects.find(p => p.id === id);
  const [activeTab, setActiveTab] = useState<'overview' | 'gantt' | 'tasks'>('overview');

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4">Project Not Found</h1>
          <Link to="/projects">
            <Button>
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const budgetUtilization = Math.round((project.spent / project.budget) * 100);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'gantt', label: 'Gantt Chart', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
  ] as const;

  const taskStatusStyle: Record<string, string> = {
    'completed': 'bg-emerald-100 text-emerald-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    'not-started': 'bg-slate-100 text-slate-600',
    'blocked': 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="border-b bg-card px-6 py-5">
        <Link to="/projects">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            All Projects
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-1">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
            <span className="text-sm text-muted-foreground mt-1 inline-block">{project.department}</span>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b -mb-5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors',
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Overview tab */}
        {activeTab === 'overview' && (
          <>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">Progress</CardTitle>
                  <BarChart2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl mb-2">{project.progress}%</div>
                  <Progress value={project.progress} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">Budget</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl mb-1">{formatCurrency(project.spent)}</div>
                  <p className="text-sm text-muted-foreground">
                    of {formatCurrency(project.budget)} ({budgetUtilization}%)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">Timeline</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-sm mb-1">{formatDate(project.startDate)}</div>
                  <p className="text-sm text-muted-foreground">to {formatDate(project.actualEndDate || project.endDate)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm">Team Size</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{project.team.length + 1}</div>
                  <p className="text-sm text-muted-foreground">members including PM</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Project Team</CardTitle>
                  <CardDescription>People responsible for this project</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-4 rounded-lg bg-accent flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span>{project.projectManager.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded">PM</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{project.projectManager.role}</p>
                    </div>
                  </div>
                  {project.team.map(member => (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <div>{member.name}</div>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Delays & Issues
                  </CardTitle>
                  <CardDescription>
                    {project.delays.length > 0
                      ? `${project.delays.length} delay(s) reported`
                      : 'No delays reported'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {project.delays.length > 0 ? (
                    <div className="space-y-4">
                      {project.daysDelayed && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                          <div className="flex items-center gap-2 text-red-800">
                            <Clock className="h-4 w-4" />
                            <span>Total Delay: {project.daysDelayed} days</span>
                          </div>
                        </div>
                      )}
                      {project.delays.map(delay => (
                        <div key={delay.id} className="p-4 rounded-lg border bg-card space-y-2">
                          <div className="flex items-start justify-between">
                            <span className="text-sm text-muted-foreground">{formatDate(delay.date)}</span>
                            <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">Delay</span>
                          </div>
                          <div>
                            <h4 className="mb-1">Reason</h4>
                            <p className="text-sm text-muted-foreground">{delay.reason}</p>
                          </div>
                          <div>
                            <h4 className="mb-1">Impact</h4>
                            <p className="text-sm text-muted-foreground">{delay.impact}</p>
                          </div>
                          <div className="pt-2 border-t text-sm text-muted-foreground">
                            Reported by: {delay.reportedBy}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No delays reported for this project</p>
                      <p className="text-sm mt-1">Project is progressing as planned</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Gantt chart tab */}
        {activeTab === 'gantt' && (
          <Card>
            <CardHeader>
              <CardTitle>Project Timeline — Gantt Chart</CardTitle>
              <CardDescription>
                Task schedule from {formatDate(project.startDate)} to {formatDate(project.actualEndDate || project.endDate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <GanttChart
                tasks={project.tasks}
                startDate={project.startDate}
                endDate={project.actualEndDate || project.endDate}
              />
            </CardContent>
          </Card>
        )}

        {/* Tasks tab */}
        {activeTab === 'tasks' && (
          <Card>
            <CardHeader>
              <CardTitle>Task List</CardTitle>
              <CardDescription>{project.tasks.length} tasks for this project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {project.tasks.map((task, i) => (
                  <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span>{task.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${taskStatusStyle[task.status]}`}>
                          {task.status.replace('-', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{new Date(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → {new Date(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {task.assignee && <span>👤 {task.assignee}</span>}
                      </div>
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Progress</span>
                        <span className="text-xs">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
