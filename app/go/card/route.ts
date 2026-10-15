// Stable destination for future cards. Existing QR routes remain unchanged.
export function GET() {
  return new Response(null, {
    status: 302,
    headers: { Location: '/demo/', 'Cache-Control': 'no-store' },
  });
}
