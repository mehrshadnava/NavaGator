import { ProjectStatus } from '../types';
import { Badge } from './ui/badge';
import { Clock, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';

interface StatusBadgeProps {
  status: ProjectStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    'on-track': {
      variant: 'success' as const,
      label: 'On Track',
      icon: TrendingUp,
    },
    'at-risk': {
      variant: 'warning' as const,
      label: 'At Risk',
      icon: AlertTriangle,
    },
    'delayed': {
      variant: 'danger' as const,
      label: 'Delayed',
      icon: Clock,
    },
    'completed': {
      variant: 'success' as const,
      label: 'Completed',
      icon: CheckCircle2,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
