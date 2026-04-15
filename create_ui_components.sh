#!/bin/bash

# TimeSync - UI Components Generator

set -e

cd "$(dirname "$0")/frontend/src/components"

# ============================================
# ui/Button.tsx
# ============================================
cat > ui/Button.tsx << 'ENDOFFILE'
import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}) => {
  const baseStyles = 'font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2';
  
  const variants = {
    primary: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90',
    secondary: 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 border border-slate-600',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
};
ENDOFFILE

# ============================================
# ui/Input.tsx
# ============================================
cat > ui/Input.tsx << 'ENDOFFILE'
import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ className, label, ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg',
          'text-white placeholder:text-slate-500 focus:outline-none',
          'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
          'transition-all duration-200',
          className
        )}
        {...props}
      />
    </div>
  );
};
ENDOFFILE

echo "✅ UI components created!"
