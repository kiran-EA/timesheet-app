'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (token) {
        router.push('/timesheet');
      } else {
        router.push('/login');
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl animate-pulse">
          📊
        </div>
        <p className="text-slate-400">Loading TimeSync...</p>
      </div>
    </div>
  );
}
