import * as React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'secondary';
}

export function Badge({ className = "", variant = 'default', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    secondary: 'bg-secondary text-secondary-foreground',
  };

  return (
    <div 
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 transition-colors ${variants[variant]} ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
}
