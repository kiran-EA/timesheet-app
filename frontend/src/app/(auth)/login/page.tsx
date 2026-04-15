'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email });
      const { access_token, user } = response.data;
      
      setAuth(user, access_token);
      router.push('/timesheet');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md p-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">
            📊
          </div>
          <h1 className="text-4xl font-bold mb-2">TimeSync</h1>
          <p className="text-slate-400">Express Analytics</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-lg border border-slate-700 rounded-2xl p-10">
          <h2 className="text-2xl font-semibold mb-6">Sign in with Jira</h2>
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <Input
              label="Email Address"
              type="email"
              placeholder="your.name@expressanalytics.net"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mb-6"
            />

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Having trouble?{' '}
            <a href="#" className="text-blue-400 hover:text-blue-300">
              Contact admin
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
