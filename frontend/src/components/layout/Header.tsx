'use client';

import React from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onSync?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onSync }) => {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="h-[70px] bg-slate-900/30 border-b border-slate-800 px-8 flex items-center justify-between">
      {/* Title */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <input
          type="date"
          defaultValue={today}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm cursor-pointer hover:border-slate-600 transition-colors"
        />
        
        <button className="w-10 h-10 border border-slate-700 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all relative">
          <Bell className="w-5 h-5 mx-auto" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {onSync && (
          <Button onClick={onSync} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Sync Jira Tasks
          </Button>
        )}
      </div>
    </div>
  );
};
