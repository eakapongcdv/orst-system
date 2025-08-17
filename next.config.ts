import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
        {
            // Apply these headers to all routes. Adjust the source pattern if needed.
            source: '/(.*)',
            headers: [
                {
                    // Remove X-Frame-Options to allow framing (less secure default)
                    key: 'X-Frame-Options',
                    value: 'SAMEORIGIN',
                },
                /*
                {
                    key: 'Content-Security-Policy',
                    value: `
                        default-src 'self';
                        script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
                        style-src 'self' 'unsafe-inline'; 
                        img-src 'self' data: https:;
                        font-src 'self' https: data:;
                        object-src 'none';
                        base-uri 'self';
                        connect-src 'self' https:;
                        frame-ancestors 'none';
                        form-action 'self';
                        upgrade-insecure-requests;
                        `.replace(/\s{2,}/g, ' ').trim(), // Minify the CSP string
                }*/
            ],
        },
        ];
    },
};

export default nextConfig;
