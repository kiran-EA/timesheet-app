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
