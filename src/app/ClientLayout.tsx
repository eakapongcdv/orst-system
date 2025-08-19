// app/ClientLayout.tsx
// app/ClientLayout.tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from "next/link";
import {
  BookOpenIcon,
  LanguageIcon,
  FolderOpenIcon,
  ArrowUpTrayIcon,
  Squares2X2Icon,
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  UserPlusIcon
} from '@heroicons/react/24/solid';

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
  
  // Check if we're on a real full-screen page (editor/view, or /dictionaries/:id/preview)
  const isEditorPage = (/^\/dictionaries\/[^\/]+\/preview(?:\/|$)/.test(pathname ?? ''));
  // Detect dictionary routes for subnav highlight
  const dictActive = pathname?.startsWith('/dictionaries');
  const translitActive = pathname?.startsWith('/search-transliteration');

  // Map Thai menu names to Heroicons components
  const iconFor = (name: string) => {
    switch (name) {
      case 'ค้นหาคำศัพท์': return BookOpenIcon;
      case 'ค้นหาคำทับศัพท์': return LanguageIcon;
      case 'คลังเอกสาร': return FolderOpenIcon;
      case 'นำเข้าคำศัพท์': return ArrowUpTrayIcon;
      case 'แดชบอร์ด': return Squares2X2Icon;
      case 'จัดการผู้ใช้': return UserGroupIcon;
      default: return Squares2X2Icon;
    }
  };

  return (
    <>
      {/* Header - only show if not on editor page */}
      {!isEditorPage && (
        <header className="brand-header sticky  z-10 navbar">
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
                  <nav className="hidden md:ml-6 md:flex md:space-x-6" aria-label="เมนูหลัก">
                    {navItems.map((item) => {
                      const active = pathname?.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`nav-link ${active ? 'nav-link--active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                        >
                          {(() => { const Icon = iconFor(item.name); return <Icon className="h-5 w-5" aria-hidden="true" />; })()}
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
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
                        aria-label="ออกจากระบบ"
                        className="btn-primary btn--sm"
                      >
                        <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
                        ออกจากระบบ
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex space-x-4">
                    <Link
                      href="/login"
                      className="btn-primary btn--sm"
                    >
                      <ArrowLeftOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
                      เข้าสู่ระบบ
                    </Link>
                    <Link
                      href="/register"
                      className="btn-secondary btn--sm"
                    >
                      <UserPlusIcon className="h-5 w-5" aria-hidden="true" />
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
              © {new Date().getFullYear() + 543} A ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา. สงวนลิขสิทธิ์
            </p>
          </div>
        </footer>
      )}
    </>
  );
}