import { Task, TaskStatus } from '../types';

interface GanttChartProps {
  tasks: Task[];
  startDate: string;
  endDate: string;
}

const taskStatusColors: Record<TaskStatus, { bar: string; text: string }> = {
  'completed': { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  'in-progress': { bar: 'bg-blue-500', text: 'text-blue-700' },
  'not-started': { bar: 'bg-slate-300', text: 'text-slate-500' },
  'blocked': { bar: 'bg-red-500', text: 'text-red-700' },
};

const taskStatusLabels: Record<TaskStatus, string> = {
  'completed': 'Done',
  'in-progress': 'Active',
  'not-started': 'Pending',
  'blocked': 'Blocked',
};

function parseDate(s: string) {
  return new Date(s).getTime();
}

function getDaysBetween(a: number, b: number) {
  return (b - a) / (1000 * 60 * 60 * 24);
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getMonthTicks(start: number, end: number) {
  const ticks: { label: string; offset: number }[] = [];
  const totalDays = getDaysBetween(start, end);
  const d = new Date(start);
  d.setDate(1);
  while (d.getTime() <= end) {
    const offset = Math.max(0, getDaysBetween(start, d.getTime()) / totalDays) * 100;
    ticks.push({ label: formatMonthLabel(d), offset });
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

function TodayMarker({ chartStart, chartEnd }: { chartStart: number; chartEnd: number }) {
  const today = Date.now();
  if (today < chartStart || today > chartEnd) return null;
  const totalDays = getDaysBetween(chartStart, chartEnd);
  const offset = (getDaysBetween(chartStart, today) / totalDays) * 100;
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-10 pointer-events-none"
      style={{ left: `${offset}%` }}
    >
      <div className="absolute -top-5 -translate-x-1/2 text-xs text-red-600 whitespace-nowrap px-1 bg-background rounded">
        Today
      </div>
    </div>
  );
}

export function GanttChart({ tasks, startDate, endDate }: GanttChartProps) {
  // Expand chart range slightly for padding
  const chartStart = parseDate(startDate) - 2 * 24 * 60 * 60 * 1000;
  const rawEnd = parseDate(endDate);
  const chartEnd = rawEnd + 7 * 24 * 60 * 60 * 1000;
  const totalDays = getDaysBetween(chartStart, chartEnd);

  const getBarStyle = (task: Task) => {
    const s = parseDate(task.startDate);
    const e = parseDate(task.endDate);
    const left = Math.max(0, (getDaysBetween(chartStart, s) / totalDays) * 100);
    const width = Math.max(0.5, (getDaysBetween(s, e) / totalDays) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  const monthTicks = getMonthTicks(chartStart, chartEnd);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Month header */}
        <div className="flex mb-3 pl-48 relative h-6">
          {monthTicks.map((tick, i) => (
            <div
              key={i}
              className="absolute text-xs text-muted-foreground"
              style={{ left: `calc(12rem + ${tick.offset}%)` }}
            >
              {tick.label}
            </div>
          ))}
        </div>

        {/* Grid + tasks */}
        <div className="relative">
          {/* Month grid lines */}
          <div className="absolute left-48 right-0 top-0 bottom-0 pointer-events-none">
            {monthTicks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-border/50"
                style={{ left: `${tick.offset}%` }}
              />
            ))}
            <TodayMarker chartStart={chartStart} chartEnd={chartEnd} />
          </div>

          {/* Task rows */}
          <div className="space-y-2">
            {tasks.map((task) => {
              const colors = taskStatusColors[task.status];
              const barStyle = getBarStyle(task);
              return (
                <div key={task.id} className="flex items-center group">
                  {/* Task label */}
                  <div className="w-48 shrink-0 pr-4">
                    <div className="text-sm truncate" title={task.name}>{task.name}</div>
                    {task.assignee && (
                      <div className="text-xs text-muted-foreground truncate">{task.assignee}</div>
                    )}
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative h-8">
                    {/* Row background */}
                    <div className="absolute inset-0 rounded group-hover:bg-muted/30 transition-colors" />

                    {/* Bar */}
                    <div
                      className="absolute top-1 h-6 rounded"
                      style={{ ...barStyle, backgroundColor: 'var(--color-muted)' }}
                    >
                      {/* Progress fill */}
                      <div
                        className={`h-full rounded ${colors.bar} transition-all`}
                        style={{ width: `${task.progress}%` }}
                      />
                      {/* Label inside bar */}
                      {parseFloat(barStyle.width) > 8 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-white/90 font-medium select-none">
                          {task.progress}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="w-16 shrink-0 flex justify-end">
                    <span className={`text-xs ${colors.text}`}>
                      {taskStatusLabels[task.status]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-6 pt-4 border-t border-border pl-48">
          {(Object.keys(taskStatusColors) as TaskStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-sm ${taskStatusColors[s].bar}`} />
              <span className="text-xs text-muted-foreground capitalize">{taskStatusLabels[s]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-px bg-red-500" />
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
