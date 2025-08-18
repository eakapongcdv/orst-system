// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import ClientLayout from './ClientLayout';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ระบบฐานข้อมูลของสำนักงานราชบัณฑิตยสภา",
  description: "ระบบจัดการเอกสารและฐานข้อมูลสำหรับสำนักงานราชบัณฑิตยสภา",
};

async function verifyToken(token: string | undefined) {
  if (!token) return null;
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    return payload;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  const payload = await verifyToken(token);
  const isAuthenticated = !!payload;

  const navItems = [
    { name: "ค้นหาคำศัพท์", href: "/dictionaries" },
    { name: "ค้นหาคำทับศัพท์", href: "/search-transliteration" },
    //{ name: "ค้นหาเอกสารวิชาการ", href: "/search" },
    { name: "คลังเอกสาร", href: "/file-manager" },
    { name: "นำเข้าคำศัพท์", href: "/file-manager/upload-dictionary" },
    { name: "นำเข้าคำทับศัพท์", href: "/file-manager/upload-transliteration" },
    { name: "แดชบอร์ด", href: "/dashboard" },
    { name: "จัดการผู้ใช้", href: "/users" },
  ];

  return (
    <html lang="th">
      <head>
        {/* It's also good practice to include the viewport meta tag */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Next.js will merge this with metadata defined above and any head elements from pages */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-texture use-bullet-thai`}
      >
        <ClientLayout 
          isAuthenticated={isAuthenticated} 
          payload={payload} 
          navItems={navItems}
        >
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}