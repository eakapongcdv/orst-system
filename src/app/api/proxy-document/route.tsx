// app/api/proxy-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import OSS from 'ali-oss';

const prisma = new PrismaClient();

// Helper function to create OSS client
function createOSSClient() {
  // Ensure environment variables are defined
  const region = process.env.OSS_REGION;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET_NAME;

  if (!region || !accessKeyId || !accessKeySecret || !bucket) {
    console.error("Missing required OSS environment variables.");
    // It's critical to have these, so throwing an error is appropriate
    throw new Error('Server configuration error: Missing OSS credentials or settings.');
  }

  return new OSS({
    region: region,
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
    bucket: bucket,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let  ossKey = searchParams.get('ossKey');

  // 1. Validate Input Parameter
  if (!ossKey) {
    console.warn("Proxy API called without required 'ossKey' parameter.");
    return NextResponse.json({ error: 'Missing required parameter: ossKey' }, { status: 400 });
  }

  ossKey =  decodeURIComponent(ossKey)
  console.log(`Proxy API received request for ossKey: ${ossKey}`);

  try {
    // 2. Fetch document metadata from your database for validation/access check
    const document = await prisma.document.findUnique({
      where: { ossKey: ossKey }, // Prisma should handle the string matching correctly
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        ossKey: true, // Confirm the key retrieved
        // Add fields here if needed for future access control logic
      },
    });

    if (!document) {
      console.warn(`Document with ossKey '${ossKey}' not found in database.`);
      return NextResponse.json({ error: 'Document not found in database' }, { status: 404 });
    }

    console.log(`Document found in DB: ID=${document.id}, Name=${document.name}`);

    // 3. Generate a fresh signed URL for the OSS object using the SDK
    let signedOssUrl: string;
    try {
      const client = createOSSClient();
      // Generate a signed URL valid for a short time (e.g., 15 minutes = 900 seconds)
      // Adjust expiration based on your security/usability needs.
      // Ensure this is slightly longer than the expected time for WebViewer to fetch the file.
      signedOssUrl = client.signatureUrl(document.ossKey, { expires: 900 });
      console.log(`Generated signed URL for ${document.ossKey}`);
    } catch (ossSdkError: any) {
      console.error("Aliyun OSS SDK Error generating signed URL for key:", document.ossKey, ossSdkError);
      const errorMessage = ossSdkError.message || 'Unknown error from OSS SDK';
      // Return a 500 error as this is a server-side configuration/SDK issue
      return NextResponse.json({ error: `Failed to generate access link for document: ${errorMessage}` }, { status: 500 });
    }

    // 4. Fetch the document content from OSS using the generated signed URL
    // Use native fetch (Node.js 18+ built-in)
    console.log(`Fetching document content from OSS using signed URL...`);
    const ossResponse = await fetch(signedOssUrl);

    if (!ossResponse.ok) {
      console.error(`Failed to fetch from OSS: ${ossResponse.status} ${ossResponse.statusText}`, signedOssUrl);
      // Log the response body if possible for debugging (be cautious with large bodies)
      // const errorBody = await ossResponse.text().catch(() => 'Could not read error body');
      // console.error("OSS Error Body:", errorBody);

      // Map common OSS errors to appropriate HTTP status codes for the client
      if (ossResponse.status === 404) {
         console.error(`OSS Object not found for key: ${document.ossKey}`);
         return NextResponse.json({ error: 'Document content not found on storage (Object Missing)' }, { status: 404 });
      }
      if (ossResponse.status === 403) {
         console.error(`Access denied fetching from OSS for key: ${document.ossKey}`);
         return NextResponse.json({ error: 'Access denied to storage backend' }, { status: 403 });
      }
      // Return a generic Bad Gateway error for other upstream issues
      console.error(`Unexpected error fetching from OSS for key: ${document.ossKey}. Status: ${ossResponse.status}`);
      return NextResponse.json({ error: `Failed to retrieve document from storage (Upstream error: ${ossResponse.status})` }, { status: 502 });
    }

    // 5. Get the ReadableStream from the OSS response body
    const ossStream = ossResponse.body;
    if (!ossStream) {
      const errorMsg = 'OSS response body is null or undefined';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // 6. Prepare headers to forward from OSS response
    // These are important for correct rendering/downloading by the browser/client (e.g., WebViewer)
    const responseHeaders = new Headers();

    // Essential headers
    const contentType = ossResponse.headers.get('content-type');
    if (contentType) {
        responseHeaders.set('Content-Type', contentType);
    } else {
        // Fallback to the type stored in your database if OSS doesn't provide one
        // Ensure document.type is a valid MIME type
        responseHeaders.set('Content-Type', document.type || 'application/octet-stream');
    }

    const contentLength = ossResponse.headers.get('content-length');
    if (contentLength) {
        responseHeaders.set('Content-Length', contentLength);
    }
    // Note: Content-Length might not always be present, especially for streamed responses.
    // WebViewer generally handles this.

    const etag = ossResponse.headers.get('etag');
    if (etag) {
        responseHeaders.set('ETag', etag);
    }

    const lastModified = ossResponse.headers.get('last-modified');
    if (lastModified) {
        responseHeaders.set('Last-Modified', lastModified);
    }

    // Add Cache-Control header (optional)
    // Example: cache privately for 5 minutes on the client
    // responseHeaders.set('Cache-Control', 'private, max-age=300');

    // Remove headers that Node.js/Next.js handles or could cause issues if forwarded
    // 'transfer-encoding' is managed by the HTTP stack.
    // Other headers like 'connection', 'keep-alive' are also typically handled.

    // 7. Create and return the Next.js Response object
    // Pass the ReadableStream directly to NextResponse for efficient streaming
    // Set status to the OSS response status (should be 200 for success)
    console.log(`Successfully fetched document ${document.ossKey} from OSS, streaming ${contentLength ? contentLength + ' bytes' : 'content'} back to client.`);
    return new NextResponse(ossStream as unknown as ReadableStream, {
      status: ossResponse.status,
      statusText: ossResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Proxy Document API unexpected error:', error);
    // Return a generic server error for unhandled exceptions in the proxy logic
    const errorMessage = error.message || 'Internal server error while fetching document';
    return NextResponse.json({ error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  } finally {
    // Ensure Prisma client is disconnected to prevent potential memory leaks or connection pool issues
    await prisma.$disconnect().catch((disconnectError) => {
       console.warn("Warning: Error disconnecting Prisma client in proxy API:", disconnectError);
    });
  }
}

// Optional: Handle HEAD requests if needed (e.g., for checking if a document exists/size/type without downloading the body).
// WebViewer might perform a HEAD request first.
// export async function HEAD(request: NextRequest) {
//   // Similar logic to GET but only fetch headers (potentially using client.head() from OSS SDK),
//   // not the body, and return a response with status 200/404 etc. and the relevant headers.
//   // ... implementation ...
// }