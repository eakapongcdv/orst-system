import { NextResponse } from 'next/server';

export async function GET() {
  const collection = {
    info: {
      name: "ORST Open API",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      _postman_id: "orst-openapi"
    },
    item: [
      {
        name: "Ping (API key required)",
        request: {
          method: "GET",
          header: [{ key: "X-API-Key", value: "{{API_KEY}}" }],
          url: "{{BASE_URL}}/api/open-api/ping"
        }
      },
      {
        name: "Search Dictionary",
        request: {
          method: "GET",
          header: [{ key: "X-API-Key", value: "{{API_KEY}}" }],
          url: {
            raw: "{{BASE_URL}}/api/search-dictionary?q=เคมี&page=1&pageSize=10",
            host: ["{{BASE_URL}}"],
            path: ["api", "search-dictionary"],
            query: [
              { key: "q", value: "เคมี" },
              { key: "page", value: "1" },
              { key: "pageSize", value: "10" }
            ]
          }
        }
      },
      {
        name: "Search Transliteration",
        request: {
          method: "GET",
          header: [{ key: "X-API-Key", value: "{{API_KEY}}" }],
          url: {
            raw: "{{BASE_URL}}/api/search-transliteration?q=sake&page=1&pageSize=10",
            host: ["{{BASE_URL}}"],
            path: ["api", "search-transliteration"],
            query: [
              { key: "q", value: "sake" },
              { key: "page", value: "1" },
              { key: "pageSize", value: "10" }
            ]
          }
        }
      }
    ],
    variable: [
      { key: "BASE_URL", value: "http://localhost:3000" },
      { key: "API_KEY", value: "sk_live_xxx" }
    ]
  };

  return new NextResponse(JSON.stringify(collection, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="orst-openapi.postman_collection.json"'
    }
  });
}