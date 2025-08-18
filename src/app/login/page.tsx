// app/login/page.tsx
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// --- Heroicons (outline) ---
import {
  ShieldCheckIcon,
  ArrowRightEndOnRectangleIcon,
  EnvelopeIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Ensure login screen fills the remaining viewport after header/footer dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const header = document.querySelector('header.brand-header') as HTMLElement | null;
    const footer = document.querySelector('footer.brand-footer') as HTMLElement | null;

    const setOffsets = () => {
      const headerH = header?.offsetHeight ?? 0;
      const footerH = footer?.offsetHeight ?? 0;
      root.style.setProperty('--header-h', `${headerH}px`);
      root.style.setProperty('--footer-h', `${footerH}px`);
    };

    setOffsets();

    // Observe header/footer size changes (e.g., responsive wrap)
    const ro = new ResizeObserver(() => setOffsets());
    header && ro.observe(header);
    footer && ro.observe(footer);

    // On mobile, browser UI chrome changes visual viewport height
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const handleVV = () => setOffsets();
    vv?.addEventListener('resize', handleVV);
    vv?.addEventListener('scroll', handleVV);

    window.addEventListener('orientationchange', setOffsets);
    window.addEventListener('resize', setOffsets);

    return () => {
      ro.disconnect();
      vv?.removeEventListener('resize', handleVV);
      vv?.removeEventListener('scroll', handleVV);
      window.removeEventListener('orientationchange', setOffsets);
      window.removeEventListener('resize', setOffsets);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "เข้าสู่ระบบล้มเหลว");

      localStorage.removeItem("user");
      localStorage.setItem("user", JSON.stringify(data.user));

      // สำเร็จ → /dictionaries
      router.push("/dictionaries");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบล้มเหลว");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-layout app-viewport theme-royal">
      {/* LEFT: Full-screen Royal background (image + gradient + thai pattern) */}
      <section className="login-pane--left center-both">
        <div className="login-brand text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="brand-seal">
              <Image
                src="/logo.png"
                alt="ราชบัณฑิตยสภา"
                width={84}
                height={84}
                priority
                className="brand-seal__img"
              />
            </div>
          </div>
          <p className="title tracking-wide emboss-gold">
            ระบบฐานข้อมูล
          </p>
          <span className="title flex items-center gap-2 emboss-gold">
              <ShieldCheckIcon className="h-7 w-7 text-[var(--brand-gold)]" />
                 สำนักงานราชบัณฑิตยสภา
            </span>
          
        </div>
      </section>

      {/* RIGHT: Login Form */}
      <section className="login-pane--right center-both bg-login-right">
        <div className="w-full max-w-md login-card">
          {/* หัวข้อย่อสำหรับจอเล็ก */}
          <div className="mb-4 text-center lg:hidden">
            <h2 className="mt-1 h2 font-extrabold text-[var(--brand-ink)] flex items-center justify-center gap-2">
              <ArrowRightEndOnRectangleIcon className="h-6 w-6" />
              เข้าสู่ระบบ
            </h2>
            <p className="mt-1 text-lead">ป้อนข้อมูลของคุณเพื่อเข้าสู่ระบบ</p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 border border-red-100 mb-4">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mt-[1px]" />
                <p className="ml-2  font-medium text-red-800">
                  {error}
                </p>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label block mb-1.5">
                ที่อยู่อีเมล
              </label>
              <div className="input-affix rounded-xl">
                <span className="affix-left">
                  <EnvelopeIcon className="h-5 w-5" />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 rounded-xl border border-gray-300 placeholder-gray-400 focus:border-[var(--brand-gold)] focus:ring-[var(--brand-gold)]"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="form-label block mb-1.5">
                รหัสผ่าน
              </label>
              <div className="input-affix rounded-xl">
                <span className="affix-left">
                  <KeyIcon className="h-5 w-5" />
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 placeholder-gray-400 focus:border-[var(--brand-gold)] focus:ring-[var(--brand-gold)]"
                  placeholder="••••••••"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[var(--muted-ink)] hover:text-[var(--brand-ink)] focus:outline-none"
                    aria-label="toggle password"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-[var(--brand-green)] focus:ring-[var(--brand-gold)] border-gray-300 rounded"
                />
                <span className=" text-[var(--brand-ink)]">จำฉันไว้</span>
              </label>
              <Link
                href="/forgot-password"
                className=" font-medium text-[var(--brand-gold)] hover:text-[var(--brand-green)]"
              >
                ลืมรหัสผ่าน?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl  font-bold text-white bg-[var(--brand-green)] hover:brightness-[1.06] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand-gold)] disabled:opacity-60 transition"
            >
              {loading ? (
                <>
                  {/* spinner */}
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                <>
                  เข้าสู่ระบบ
                  <ArrowRightIcon className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* Register */}
          <p className="mt-6 text-center  text-[var(--muted-ink)]">
            ยังไม่มีบัญชี?{" "}
            <Link
              href="/register"
              className="font-semibold text-[var(--brand-gold)] hover:text-[var(--brand-green)]"
            >
              ลงทะเบียนที่นี่
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}