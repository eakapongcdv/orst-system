// middleware.ts (root directory)
import { NextRequest, NextFetchEvent, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// --- CORS Configuration ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://oss-cdv-doc-master.oss-ap-southeast-7.aliyuncs.com'
];

const isAllowedOrigin = (origin: string | null): origin is string => {
  if (!origin) return false;
  const ok = allowedOrigins.some(allowedOrigin =>
    origin === allowedOrigin ||
    (allowedOrigin.endsWith('*') && origin.startsWith(allowedOrigin.slice(0, -1)))
  );
  // Alternative for simple '*' check (less secure for production):
  // const ok = allowedOrigins.includes('*') || allowedOrigins.includes(origin);
  return ok;
};

// Function to apply CORS headers to a response
function setCORSHeaders(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get('origin');

  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }

  // Set common CORS headers for all responses where origin is handled
  // Adjust methods and headers based on your API needs
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400'); // Cache preflight

  // Optional: Add general security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY'); // Or 'SAMEORIGIN'
  response.headers.set('X-XSS-Protection', '1; mode=block');
  // Consider adding Strict-Transport-Security if using HTTPS in production
  // response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

// --- Authentication Configuration ---
// Define public routes that don't require authentication
const publicRoutes = [
  '/', // Allow access to home page
  '/login',
  '/register',
  '/forgot-password',
  '/api/auth', // Covers /api/auth/login, /api/auth/register, etc.
  '/api/search', // Allow access to search API (assuming it's public or handles auth internally)
  '/view', // Allow access to document viewer page
  // Add other explicitly public API routes or pages here if needed
];

const isPublicRoute = (pathname: string): boolean => {
  return publicRoutes.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
};

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const origin = request.headers.get('origin');
  const { pathname } = request.nextUrl;

  // --- Handle CORS Preflight (OPTIONS) Requests ---
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    setCORSHeaders(request, response);
    return response;
  }

  // --- Prepare the default response ---
  // We'll modify this response or create a new one based on auth/CORS needs.
  let response = NextResponse.next();

  // --- Apply CORS headers to the default response ---
  setCORSHeaders(request, response);

  // --- Smart redirects for root and login pages ---
  // If hit root '/', redirect to /dashboard when authenticated; otherwise to /login
  if (pathname === '/') {
    const token = request.cookies.get('auth-token')?.value ?? null;

    // default redirect target when unauthenticated
    const unauthTarget = new URL('/login', request.url);

    if (!token) {
      const r = NextResponse.redirect(unauthTarget);
      setCORSHeaders(request, r);
      return r;
    }

    try {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev_only_change_me'
      );
      await jwtVerify(token, secret);
      const authedTarget = new URL('/dashboard', request.url);
      const r = NextResponse.redirect(authedTarget);
      setCORSHeaders(request, r);
      return r;
    } catch {
      const r = NextResponse.redirect(unauthTarget);
      setCORSHeaders(request, r);
      return r;
    }
  }

  // If user navigates to /login but already authenticated, send to /dashboard
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    const token = request.cookies.get('auth-token')?.value ?? null;
    if (token) {
      try {
        const secret = new TextEncoder().encode(
          process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev_only_change_me'
        );
        await jwtVerify(token, secret);
        const r = NextResponse.redirect(new URL('/dashboard', request.url));
        setCORSHeaders(request, r);
        return r;
      } catch {
        // invalid token: allow reaching /login; middleware below may clear cookie on protected routes
      }
    }
  }

  // --- Handle Authentication for Non-Public Routes ---
  // Check if the current route requires authentication
  if (!isPublicRoute(pathname)) {
    // Get the auth token from cookies
    const token = request.cookies.get('auth-token')?.value;

    // If no token, redirect to login
    // Important: Only redirect browser navigation requests, not API requests or static assets.
    // The matcher should prevent this for /api, /_next, etc., but double-checking is safer.
    if (!token) {
      // Check if it's a page request (likely HTML) or an API/data request
      const isPageRequest = !pathname.startsWith('/api') && !pathname.includes('.');

      if (isPageRequest) {
        // Redirect browser page requests to login
        const loginUrl = new URL('/login', request.url);
        // Optionally pass the original URL as a query param for redirect after login
        // loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      } else {
        // For API requests without auth, return a 401 Unauthorized
        return new NextResponse(
          JSON.stringify({ error: 'Unauthorized: No token provided' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    try {
      // Verify the token
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev_only_change_me' // Ensure you have a strong secret in .env
      );

      await jwtVerify(token, secret);

      // Token is valid, proceed with the request
      // Return the response with CORS headers already set
      return response;
    } catch (error) {
      console.error("Middleware JWT Verification Error:", error);
      // Token is invalid, clear cookie and redirect (for pages) or return 401 (for APIs)
      const isPageRequest = !pathname.startsWith('/api') && !pathname.includes('.');

      // Clear the invalid token cookie
      const unauthorizedResponse = isPageRequest
        ? NextResponse.redirect(new URL('/login', request.url))
        : new NextResponse(
            JSON.stringify({ error: 'Unauthorized: Invalid token' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );

      unauthorizedResponse.cookies.delete('auth-token');
      // Ensure CORS headers are also set on the error response
      setCORSHeaders(request, unauthorizedResponse);
      return unauthorizedResponse;
    }
  }

  // --- For Public Routes or After Successful Auth ---
  // Return the response (either the default one or one modified by auth logic)
  // CORS headers were already set on it.
  return response;
}

// --- Configure Middleware Matcher ---
// Run middleware on all routes except static assets and Next.js internals.
// This is important to ensure CORS headers are added broadly and auth is checked.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (if you have specific ones not covered above)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp)$).*)',
    // This pattern matches everything except the specified static asset patterns.
    // You might need to adjust the file extensions list if you have other static assets.
  ],
};