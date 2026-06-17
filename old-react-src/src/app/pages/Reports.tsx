import { mockProjects } from '../data/mockData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  'on-track': '#22c55e',
  'at-risk': '#f59e0b',
  'delayed': '#ef4444',
  'completed': '#3b82f6',
};

export function Reports() {
  // Budget vs Spent per project
  const budgetData = mockProjects.map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
    Budget: p.budget / 1000,
    Spent: p.spent / 1000,
  }));

  // Status breakdown
  const statusCounts = Object.entries(
    mockProjects.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Progress per project
  const progressData = mockProjects.map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
    Progress: p.progress,
    status: p.status,
  }));

  // Dept budget utilization
  const deptData = Object.entries(
    mockProjects.reduce<Record<string, { budget: number; spent: number }>>((acc, p) => {
      if (!acc[p.department]) acc[p.department] = { budget: 0, spent: 0 };
      acc[p.department].budget += p.budget;
      acc[p.department].spent += p.spent;
      return acc;
    }, {})
  ).map(([dept, { budget, spent }]) => ({
    dept,
    Utilization: Math.round((spent / budget) * 100),
  }));

  // Summary KPIs
  const totalBudget = mockProjects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = mockProjects.reduce((s, p) => s + p.spent, 0);
  const avgProgress = Math.round(mockProjects.reduce((s, p) => s + p.progress, 0) / mockProjects.length);
  const delayedCount = mockProjects.filter(p => p.status === 'delayed').length;

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">Portfolio-level insights across all projects</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Budget', value: fmt(totalBudget), sub: 'allocated' },
          { label: 'Total Spent', value: fmt(totalSpent), sub: `${Math.round((totalSpent / totalBudget) * 100)}% utilized` },
          { label: 'Avg Progress', value: `${avgProgress}%`, sub: 'across all projects' },
          { label: 'Delayed Projects', value: String(delayedCount), sub: `of ${mockProjects.length} total` },
        ].map(({ label, value, sub }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-2xl mb-0.5">{value}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Budget vs Spent</CardTitle>
            <CardDescription>Per project (in $k)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={budgetData} margin={{ top: 0, right: 0, left: -10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}k`} />
                <Tooltip formatter={(v: number) => `$${v}k`} />
                <Legend />
                <Bar dataKey="Budget" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Spent" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Status Breakdown</CardTitle>
            <CardDescription>Distribution by current status</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusCounts}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                  labelLine={false}
                >
                  {statusCounts.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
            <CardDescription>Completion % per project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={progressData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="Progress" radius={[0, 3, 3, 0]}>
                  {progressData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.status] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget Utilization by Department</CardTitle>
            <CardDescription>Spend as % of allocated budget</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="Utilization" fill="var(--color-primary)" radius={[3, 3, 0, 0]}>
                  {deptData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.Utilization > 90 ? '#ef4444' : entry.Utilization > 75 ? '#f59e0b' : 'var(--color-primary)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
