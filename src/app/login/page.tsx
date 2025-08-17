// app/login/page.tsx
"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'เข้าสู่ระบบล้มเหลว');
      }

      // ล้างข้อมูลผู้ใช้ที่มีอยู่
      localStorage.removeItem('user');
      
      // เก็บข้อมูลผู้ใช้ใน localStorage
      localStorage.setItem('user', JSON.stringify(data.user));

      // เปลี่ยนเส้นทางไปยังแดชบอร์ด
      router.push('/dashboard');
      router.refresh();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-body)] py-12 px-4 sm:px-2 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* ส่วนหัว */}
        <div className="text-center">
          <img src="/logo.png" alt="สำนักงานราชบัณฑิตยสภา" className="brand-logo mx-auto" />
          <h2 className="mt-6 text-3xl font-extrabold brand-title text-[var(--brand-green)]">
            ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา
          </h2>
          <p className="mt-2 text-md text-[color:var(--brand-green)]/80">
            ป้อนข้อมูลคุณเพื่อเข้าสู่ระบบ
          </p>
        </div>

        {/* ข้อความแสดงข้อผิดพลาด */}
        {error && (
          <div className="rounded-lg bg-red-50 p-2 border border-red-100">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-md font-bold text-red-800">
                  {error}
                </h3>
              </div>
            </div>
          </div>
        )}

        {/* แบบฟอร์มเข้าสู่ระบบ */}
        <div className="bg-white py-8 px-4 shadow rounded-lg sm:px-10 border border-[var(--brand-gold)]/25">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* ช่องอีเมล */}
            <div>
              <label htmlFor="email" className="block text-md font-bold text-[var(--brand-green)] mb-1">
                ที่อยู่อีเมล
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-[var(--brand-gold)] focus:border-[var(--brand-gold)] block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md placeholder-gray-400"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* ช่องรหัสผ่าน */}
            <div>
              <label htmlFor="password" className="block text-md font-bold text-[var(--brand-green)] mb-1">
                รหัสผ่าน
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-[var(--brand-gold)] focus:border-[var(--brand-gold)] block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md placeholder-gray-400"
                  placeholder="••••••••"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-[var(--brand-green)] focus:outline-none"
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                        <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* จำฉันไว้ & ลืมรหัสผ่าน */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-[var(--brand-green)] focus:ring-[var(--brand-gold)] border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-md text-gray-700">
                  จำฉันไว้
                </label>
              </div>

              <div className="text-sm">
                <Link href="/forgot-password" className="font-medium text-[var(--brand-gold)] hover:text-[var(--brand-green)]">
                  ลืมรหัสผ่าน?
                </Link>
              </div>
            </div>

            {/* ปุ่มส่ง */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 rounded-md shadow-sm text-md font-bold text-white bg-[var(--brand-green)] hover:bg-[var(--brand-green)]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand-gold)] disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังเข้าสู่ระบบ...
                  </>
                ) : (
                  'เข้าสู่ระบบ'
                )}
              </button>
            </div>
          </form>

          {/* ตัวแบ่ง */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[color:var(--brand-green)]/80">
                  หรือดำเนินการต่อผ่าน
                </span>
              </div>
            </div>

            {/* ปุ่มเข้าสู่ระบบผ่านโซเชียล */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <button
                  type="button"
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-md font-bold text-[color:var(--brand-green)] hover:bg-gray-50"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
                  </svg>
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-md font-bold text-[color:var(--brand-green)] hover:bg-gray-50"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.675 0H1.325C.593 0 0 .593 0 1.325v21.351C0 23.407.593 24 1.325 24H12.82v-9.294H9.692v-3.622h3.128V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12V24h6.116c.73 0 1.323-.593 1.323-1.325V1.325C24 .593 23.407 0 22.675 0z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ลิงก์ลงทะเบียน */}
        <div className="text-center">
          <p className="text-md text-gray-600">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="font-medium text-[var(--brand-gold)] hover:text-[var(--brand-green)]">
              ลงทะเบียนที่นี่
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}