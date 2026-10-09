import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { database } from './store';

export type GitHubUser = { userId: string; displayName: string };
export const githubSignInPath = '/api/auth/github';
export const githubCallbackPath = '/api/auth/github/callback';
export const githubSignOutPath = '/api/auth/logout';
const sessionCookie = 'qh_session';
const stateCookie = 'qh_oauth_state';
const sessionSeconds = 24 * 60 * 60;
const stateSeconds = 10 * 60;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');

function config() {
  const { AUTH_ORIGIN, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET, APP_ENV } = env;
  if (!AUTH_ORIGIN || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw Error('登入設定尚未完成。');
  }
  const url = new URL(AUTH_ORIGIN);
  const local = APP_ENV === 'local' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.origin !== AUTH_ORIGIN || (!local && url.protocol !== 'https:')) throw Error('登入網址設定無效。');
  return { origin: url.origin, clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET, secret: SESSION_SECRET, secure: !local };
}
function invited(id: string) {
  return (env.GITHUB_ALLOWED_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean).includes(id);
}
function cookieValue(requestHeaders: Headers, name: string) {
  const values = (requestHeaders.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
}
function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function signature(id: string, settings: ReturnType<typeof config>) {
  return createHmac('sha256', settings.secret).update(settings.origin + ':' + id).digest('base64url');
}
function verifiedSessionTokenHash(requestHeaders: Headers, settings: ReturnType<typeof config>) {
  const token = cookieValue(requestHeaders, sessionCookie);
  if (!token || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const [id, supplied] = token.split('.');
  const expected = signature(id, settings);
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ? hash(id) : undefined;
}
export async function getGitHubUser(): Promise<GitHubUser | null> {
  const requestHeaders = await headers();
  if (!cookieValue(requestHeaders, sessionCookie)) return null;
  const tokenHash = verifiedSessionTokenHash(requestHeaders, config());
  if (!tokenHash) return null;
  const session = await database().prepare('SELECT user_id, display_name FROM auth_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(tokenHash, Date.now()).first<{ user_id: string; display_name: string }>();
  if (!session || !invited(session.user_id)) return null;
  return { userId: `github:${session.user_id}`, displayName: session.display_name };
}
function errorResponse(message: string, status: number, code?: string) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
function sameOrigin(request: Request, settings: ReturnType<typeof config>) {
  return new URL(request.url).origin === settings.origin;
}

export async function startGitHubLogin(request: Request) {
  try {
    const settings = config();
    if (!sameOrigin(request, settings) || request.headers.get('sec-fetch-site') === 'cross-site') return errorResponse('請從觀察室登入。', 403);
    const state = random(), verifier = random();
    const db = database();
    await db.prepare('DELETE FROM oauth_attempts WHERE expires_at <= ?').bind(Date.now()).run();
    await db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(Date.now()).run();
    await db.prepare('INSERT INTO oauth_attempts (state_hash, verifier, expires_at) VALUES (?, ?, ?)')
      .bind(hash(state), verifier, Date.now() + stateSeconds * 1000).run();
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.origin + githubCallbackPath,
      scope: '', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return new Response(null, { status: 302, headers: {
      Location: url.href, 'Set-Cookie': cookie(stateCookie, state, stateSeconds, settings.secure),
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    } });
  } catch { return errorResponse('登入服務尚未就緒，請檢查設定與資料庫 migration。', 503); }
}

export async function finishGitHubLogin(request: Request) {
  let secure = true;
  let response: Response;
  let failureCode = 'AUTH_CONFIG';
  let providerStatus: number | undefined;
  let providerError: string | undefined;
  try {
    const settings = config(); secure = settings.secure;
    if (!sameOrigin(request, settings)) return errorResponse('登入回呼網址不符。', 403);
    const url = new URL(request.url), state = url.searchParams.get('state'), code = url.searchParams.get('code');
    const browserState = cookieValue(request.headers, stateCookie);
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || state !== browserState || !code || code.length > 1024 || url.searchParams.has('error')) {
      response = errorResponse('登入驗證失敗或已取消，請重新登入。', 400);
    } else {
      // Consume once before contacting GitHub, so concurrent/replayed callbacks cannot create sessions.
      failureCode = 'AUTH_STATE_STORE';
      const attempt = await database().prepare('DELETE FROM oauth_attempts WHERE state_hash = ? AND expires_at > ? RETURNING verifier')
        .bind(hash(state), Date.now()).first<{ verifier: string }>();
      if (!attempt) response = errorResponse('登入已過期或使用過，請重新登入。', 400);
      else {
        failureCode = 'AUTH_TOKEN_EXCHANGE';
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, code,
            redirect_uri: settings.origin + githubCallbackPath, code_verifier: attempt.verifier }),
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
        providerStatus = tokenResponse.status;
        const token = await tokenResponse.json() as { access_token?: string; error?: string };
        // Only fixed provider error names are logged, never response bodies or descriptions.
        if (token.error) providerError = ['incorrect_client_credentials', 'redirect_uri_mismatch', 'bad_verification_code'].includes(token.error) ? token.error : 'other';
        if (!tokenResponse.ok || token.error || typeof token.access_token !== 'string' || !token.access_token) throw Error('GitHub token exchange failed');
        failureCode = 'AUTH_IDENTITY'; providerStatus = undefined; providerError = undefined;
        const userResponse = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quiet-hours-npc' },
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
        providerStatus = userResponse.status;
        const user = await userResponse.json() as { id?: number; login?: string };
        if (!userResponse.ok || !Number.isSafeInteger(user.id) || user.id! <= 0 || typeof user.login !== 'string' || !user.login || user.login.length > 100) throw Error('GitHub identity invalid');
        const userId = String(user.id);
        if (!invited(userId)) response = errorResponse('這個 GitHub 帳號尚未受邀，請聯絡站主。', 403);
        else {
          failureCode = 'AUTH_SESSION_STORE'; providerStatus = undefined;
          const db = database();
          const previousTokenHash = verifiedSessionTokenHash(request.headers, settings);
          if (previousTokenHash) await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(previousTokenHash).run();
          const id = random();
          await db.prepare('INSERT INTO auth_sessions (token_hash, user_id, display_name, expires_at) VALUES (?, ?, ?, ?)')
            .bind(hash(id), userId, user.login, Date.now() + sessionSeconds * 1000).run();
          response = new Response(null, { status: 303, headers: {
            Location: settings.origin + '/', 'Set-Cookie': cookie(sessionCookie, `${id}.${signature(id, settings)}`, sessionSeconds, settings.secure),
            'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
          } });
        }
      }
    }
  } catch {
    // Do not log raw exceptions: they can contain tokens, callback URLs or SQL bindings.
    console.error('[auth] callback_failed', JSON.stringify({ code: failureCode, providerStatus, providerError }));
    response = errorResponse('GitHub 登入暫時失敗，請回觀察室重新登入。', 503, failureCode);
  }
  response.headers.append('Set-Cookie', cookie(stateCookie, '', 0, secure));
  return response;
}

export async function signOut(request: Request) {
  try {
    const settings = config();
    if (!sameOrigin(request, settings) || request.headers.get('origin') !== settings.origin) return errorResponse('請從觀察室登出。', 403);
    const tokenHash = verifiedSessionTokenHash(request.headers, settings);
    if (tokenHash) await database().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return new Response(null, { status: 303, headers: {
      Location: settings.origin + '/', 'Set-Cookie': cookie(sessionCookie, '', 0, settings.secure), 'Cache-Control': 'no-store',
    } });
  } catch { return errorResponse('暫時無法登出，請稍後重試。', 503); }
}
