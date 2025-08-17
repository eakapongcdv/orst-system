// app/ClientLayout.tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from "next/link";

export default function ClientLayout({ 
  isAuthenticated, 
  payload, 
  navItems, 
  children 
}: { 
  isAuthenticated: boolean; 
  payload: any; 
  navItems: any[]; 
  children: React.ReactNode; 
}) {
  const pathname = usePathname();
  
  // Check if we're on editor page
  const isEditorPage = pathname?.startsWith('/editor') || 
                       pathname?.startsWith('/view') || 
                       pathname?.startsWith('/search-vocabulary')|| 
                       pathname?.startsWith('/dictionaries/')  ;

  return (
    <>
      {/* Header - only show if not on editor page */}
      {!isEditorPage && (
        <header className="brand-header sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-2 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link href="/" className="flex-shrink-0 flex items-center">
                  <img
                    src="/logo.png"
                    alt="สำนักงานราชบัณฑิตยสภา"
                    className="brand-logo"
                  />
                  <div className="ml-3 hidden sm:flex flex-col">
                    <span className="brand-title text-xl leading-5">สำนักงานราชบัณฑิตยสภา</span>
                    <span className="brand-subtitle text-sm leading-4">Office of the Royal Society</span>
                  </div>
                </Link>
                {isAuthenticated && (
                  <nav className="hidden md:ml-6 md:flex md:space-x-8">
                    {navItems.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="inline-flex items-center px-2 pt-1 border-b-2 border-transparent text-md font-bold text-white hover:text-white hover:border-white/50"
                      >
                        {item.name}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
              
              <div className="flex items-center">
                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <span className="text-md text-white/90 hidden md:inline">
                      {payload?.firstName} {payload?.lastName}
                    </span>
                    <form action="/api/auth/logout" method="post">
                      <button
                        type="submit"
                        className="text-md font-bold text-white hover:text-white/80"
                      >
                        ออกจากระบบ
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex space-x-4">
                    <Link
                      href="/login"
                      className="text-md font-bold text-white hover:text-white/80"
                    >
                      เข้าสู่ระบบ
                    </Link>
                    <Link
                      href="/register"
                      className="text-md font-bold text-white hover:text-white/80"
                    >
                      ลงทะเบียน
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer - only show if not on editor page */}
      {!isEditorPage && (
        <footer className="brand-footer">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-2 lg:px-8">
            <p className="text-center text-md">
              © {new Date().getFullYear() + 543} ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา. สงวนลิขสิทธิ์
            </p>
          </div>
        </footer>
      )}
    </>
  );
}