// app/api/auth/logout/route.ts
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';

export async function POST(request: NextRequest) {
  // Get cookies instance
  const cookieStore = await cookies();
  
  // Clear the auth token cookie
  cookieStore.delete('auth-token');
  
  // Also clear any other auth-related cookies if you have them
  // cookieStore.delete('refresh-token'); // example for refresh tokens
  // cookieStore.delete('session-id'); // example for session IDs
  
  // Redirect to login page
  redirect('/login');
}

// Also handle GET requests (for direct navigation to /api/auth/logout)
export async function GET(request: NextRequest) {
  // Get cookies instance
  const cookieStore = await cookies();
  
  // Clear the auth token cookie
  cookieStore.delete('auth-token');
  
  // Redirect to login page
  redirect('/login');
}