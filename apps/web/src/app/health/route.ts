export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ service: 'nadm-web', status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
