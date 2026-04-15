'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, CheckCircle, BarChart3, Users } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Timesheet', href: '/timesheet', icon: Clock },
  { name: 'Approvals', href: '/approvals', icon: CheckCircle, badge: 3 },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Team', href: '/team', icon: Users },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  return (
    <div className="w-64 bg-gradient-to-b from-[#12121a] to-[#0a0a0f] border-r border-slate-800 flex flex-col h-screen">
      {/* Logo Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-2xl">
            📊
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              TimeSync
            </h1>
            <p className="text-[11px] text-slate-500">Express Analytics</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg mb-1',
                'text-slate-400 font-medium transition-all duration-200',
                'hover:bg-slate-800/50 hover:text-white',
                isActive && 'bg-gradient-to-r from-blue-500/15 to-purple-600/15 text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 p-3 bg-[#16161f] border border-slate-800 rounded-xl">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center font-semibold text-sm">
            {user?.avatar || 'KM'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">
              {user?.full_name || 'Kiran Mangalvedhe'}
            </h3>
            <p className="text-[11px] text-slate-500 uppercase font-semibold">
              {user?.role || 'Resource'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
