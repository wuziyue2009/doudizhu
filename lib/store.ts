import { env } from 'cloudflare:workers';
import { normalizeRoom, type Room } from './game';
export const db = () => {
  if (!env.DB) throw Error('比赛服务暂时不可用');
  return env.DB;
};
export async function readRoom(code: string) {
  if (!/^[A-Z2-9]{8}$/.test(code)) return null;
  const row = await db()
    .prepare('SELECT state, revision FROM rooms WHERE code = ?')
    .bind(code)
    .first<{ state: string; revision: number }>();
  return row
    ? {
        room: normalizeRoom(JSON.parse(row.state) as Room),
        revision: row.revision,
      }
    : null;
}
export async function saveRoom(room: Room, revision: number) {
  const result = await db()
    .prepare(
      'UPDATE rooms SET state = ?, revision = revision + 1, updated = ? WHERE code = ? AND revision = ?',
    )
    .bind(JSON.stringify(room), Date.now(), room.code, revision)
    .run();
  return result.meta.changes === 1;
}
export async function identity(req: Request) {
  const existing = req.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)paiju_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token =
    existing ||
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  const session = Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  return {
    session,
    cookie: existing
      ? null
      : `paiju_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`,
  };
}
export function respond(
  data: unknown,
  status = 200,
  cookie: string | null = null,
) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  };
  if (cookie) h['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers: h });
}
export async function readBody(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin)
    throw Error('请从本站页面发起操作');
  if (!req.headers.get('content-type')?.includes('application/json'))
    throw Error('请求格式不正确');
  if (Number(req.headers.get('content-length') || 0) > 8000)
    throw Error('请求过大');
  const raw = await req.text();
  if (raw.length > 8000) throw Error('请求过大');
  const body = JSON.parse(raw);
  if (!body || Array.isArray(body) || typeof body !== 'object')
    throw Error('请求格式不正确');
  return body as Record<string, unknown>;
}
