/**
 * Fake GitHub REST server on 127.0.0.1 for the GitHub App host tests.
 *
 * Why: the App host must be proven against the real wire protocol without GitHub. This
 *   server implements the endpoints the host uses and enforces what GitHub enforces: the
 *   installation-token call must carry an RS256 JWT whose signature verifies against the
 *   App's public key (right `iss`, not expired, lifetime under 10 minutes), every other
 *   call must carry a token the server issued and has not expired, and PR rules (one open
 *   PR per branch, merge only when open) answer with GitHub's status codes. It records
 *   how many tokens were minted so caching can be pinned, and every Authorization value
 *   it saw so a test can prove nothing but the right credential was sent.
 *
 * Exports: startFakeGitHub(), FakeGitHub.
 * Depends on: node:http, node:crypto.
 */

import { createVerify } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

interface FakePr {
  number: number;
  branch: string;
  base: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  headSha: string;
}

export interface FakeGitHub {
  readonly apiBase: string;
  readonly mints: () => number;
  /** Every Authorization header received, in order. */
  readonly authorizations: string[];
  readonly branches: Map<string, string>;
  readonly prs: Map<number, FakePr>;
  baseSha(): string;
  /** Next request of this kind answers with this status and body instead. */
  failNext(
    method: string,
    pathPart: string,
    status: number,
    headers?: Record<string, string>,
  ): void;
  close(): Promise<void>;
}

export interface FakeGitHubOptions {
  readonly owner: string;
  readonly repo: string;
  readonly appId: string;
  readonly installationId: string;
  /** The App's public key (PEM); JWTs are verified against it. */
  readonly publicKeyPem: string;
  readonly now: () => number;
  /** Token lifetime in ms, default one hour. */
  readonly tokenTtlMs?: number;
}

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');

  return text.length > 0 ? JSON.parse(text) : undefined;
};

const send = (
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

export async function startFakeGitHub(o: FakeGitHubOptions): Promise<FakeGitHub> {
  const ttl = o.tokenTtlMs ?? 3_600_000;
  const tokens = new Map<string, number>();
  const branches = new Map<string, string>([['main', 'base0']]);
  const prs = new Map<number, FakePr>();
  const authorizations: string[] = [];
  const failures: {
    method: string;
    part: string;
    status: number;
    headers: Record<string, string>;
  }[] = [];

  let mints = 0;
  let shaCounter = 0;
  const repoPrefix = `/repos/${o.owner}/${o.repo}`;

  const jwtValid = (jwt: string): boolean => {
    const [h, p, s] = jwt.split('.');
    if (!h || !p || !s) {
      return false;
    }

    const verify = createVerify('RSA-SHA256').update(`${h}.${p}`);
    if (!verify.verify(o.publicKeyPem, Buffer.from(s, 'base64url'))) {
      return false;
    }

    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as {
      iss: string;
      iat: number;
      exp: number;
    };

    const nowSec = o.now() / 1000;

    return (
      claims.iss === o.appId && claims.exp > nowSec && claims.exp - claims.iat <= 600
    );
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET';
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const auth = req.headers.authorization ?? '';
    authorizations.push(auth);
    const credential = auth.replace(/^Bearer /, '');

    const forced = failures.findIndex(
      (f) => f.method === method && path.includes(f.part),
    );

    if (forced >= 0) {
      const f = failures.splice(forced, 1)[0] as (typeof failures)[number];

      return send(
        res,
        f.status,
        { message: `forced failure carrying ${credential}` },
        f.headers,
      );
    }

    if (
      method === 'POST' &&
      path === `/app/installations/${o.installationId}/access_tokens`
    ) {
      if (!jwtValid(credential)) {
        return send(res, 401, { message: 'A JSON web token could not be decoded' });
      }

      mints += 1;
      const token = `ghs_token${mints}`;
      const expires = o.now() + ttl;
      tokens.set(token, expires);

      return send(res, 201, {
        token,
        expires_at: new Date(expires).toISOString().replace('.000Z', 'Z'),
      });
    }

    const expiry = tokens.get(credential);
    if (expiry === undefined || expiry <= o.now()) {
      return send(res, 401, { message: 'Bad credentials' });
    }

    if (!path.startsWith(repoPrefix)) {
      return send(res, 404, { message: 'Not Found' });
    }

    const sub = path.slice(repoPrefix.length);

    if (method === 'POST' && sub === '/pulls') {
      const b = (await readBody(req)) as { head: string; base: string };
      const headSha = branches.get(b.head);
      if (headSha === undefined || !branches.has(b.base)) {
        return send(res, 422, { message: 'Validation Failed' });
      }

      if ([...prs.values()].some((p) => p.state === 'open' && p.branch === b.head)) {
        return send(res, 422, { message: 'A pull request already exists' });
      }

      const number = prs.size + 1;
      prs.set(number, {
        number,
        branch: b.head,
        base: b.base,
        state: 'open',
        merged: false,
        mergeable: true,
        headSha,
      });

      return send(res, 201, view(number));
    }

    const m = /^\/pulls\/(\d+)(\/merge)?$/.exec(sub);
    if (m) {
      const pr = prs.get(Number(m[1]));
      if (!pr) {
        return send(res, 404, { message: 'Not Found' });
      }

      if (method === 'GET' && !m[2]) {
        return send(res, 200, view(pr.number));
      }

      if (method === 'PATCH' && !m[2]) {
        pr.state = 'closed';

        return send(res, 200, view(pr.number));
      }

      if (method === 'PUT' && m[2]) {
        const b = (await readBody(req)) as { merge_method: string };
        if (!['squash', 'merge'].includes(b.merge_method)) {
          return send(res, 422, { message: 'Invalid merge method' });
        }

        if (pr.state !== 'open' || pr.merged) {
          return send(res, 405, { message: 'Pull Request is not mergeable' });
        }

        const sha = `merge${(shaCounter += 1)}`;
        branches.set(pr.base, sha);
        pr.merged = true;
        pr.state = 'closed';

        return send(res, 200, {
          sha,
          merged: true,
          message: 'Pull Request successfully merged',
        });
      }
    }

    const ref = /^\/git\/refs\/heads\/(.+)$/.exec(sub);
    if (method === 'DELETE' && ref) {
      const name = ref[1] as string;
      if (!branches.has(name)) {
        return send(res, 422, { message: 'Reference does not exist' });
      }

      branches.delete(name);

      return send(res, 204);
    }

    return send(res, 404, { message: 'Not Found' });
  };

  const view = (n: number) => {
    const pr = prs.get(n) as FakePr;

    return {
      number: pr.number,
      html_url: `https://github.test/${o.owner}/${o.repo}/pull/${pr.number}`,
      state: pr.state,
      merged: pr.merged,
      mergeable: pr.mergeable,
      head: { sha: pr.headSha },
    };
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((e: unknown) => send(res, 500, { message: String(e) }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    apiBase: `http://127.0.0.1:${port}`,
    mints: () => mints,
    authorizations,
    branches,
    prs,
    baseSha: () => branches.get('main') as string,
    failNext: (method, part, status, headers = {}) =>
      failures.push({ method, part, status, headers }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
