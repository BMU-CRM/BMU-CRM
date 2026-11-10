// Google sign-in: the token check and the rules for who may enter. Tokens are signed
// here with a test key standing in for Google's, so no network is needed.
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setAuthUserBlocked } from '@/server/auth/authAccounts';
import { verifyFirebaseIdToken, type KeySource } from '@/server/auth/firebaseTokens';
import { signInWithGoogleIdentity } from '@/server/auth/googleAccounts';
import { adminClient, createLogin, testDatabase } from './helpers/testDatabase';

const projectId = 'crm-test-project';
const googleKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const strangerKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keySource: KeySource = async (keyId) => (keyId === 'google-key' ? googleKeys.publicKey : null);
const now = Date.UTC(2026, 10, 10, 12, 0, 0);
const seconds = Math.floor(now / 1000);

function makeToken(
  overrides: Record<string, unknown> = {},
  options: { key?: KeyObject; kid?: string; alg?: string } = {},
) {
  const header = { alg: options.alg ?? 'RS256', kid: options.kid ?? 'google-key', typ: 'JWT' };
  const claims = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: seconds - 5,
    iat: seconds - 5,
    exp: seconds + 3600,
    sub: 'firebase-user-1',
    email: 'Person@Example.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['google-111'], email: ['person@example.com'] } },
    ...overrides,
  };
  const body = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(body).sign(options.key ?? googleKeys.privateKey).toString('base64url');
  return `${body}.${signature}`;
}

const check = (token: string) => verifyFirebaseIdToken(token, projectId, keySource, now);

describe('Google sign-in token check', () => {
  it('accepts a fresh Google token for this project', async () => {
    expect(await check(makeToken())).toEqual({
      status: 'ok',
      identity: { googleId: 'google-111', email: 'person@example.com' },
    });
  });

  it.each([
    ['another Firebase project', { aud: 'someone-elses-project' }, 'wrong project'],
    ['the wrong issuer', { iss: 'https://securetoken.google.com/someone-elses-project' }, 'wrong issuer'],
    ['an expired token', { exp: seconds - 600 }, 'expired'],
    ['a token from the future', { iat: seconds + 600 }, 'issued in the future'],
    ['an old sign-in', { auth_time: seconds - 3600 }, 'sign-in too old'],
    ['a password sign-in', { firebase: { sign_in_provider: 'password', identities: {} } }, 'not Google'],
    ['an unconfirmed email', { email_verified: false }, 'email not confirmed'],
    ['no Google account id', { firebase: { sign_in_provider: 'google.com', identities: {} } }, 'no Google account id'],
  ])('refuses %s', async (_name, overrides, reason) => {
    expect(await check(makeToken(overrides))).toEqual({ status: 'invalid', reason });
  });

  it('refuses a token not signed by Google', async () => {
    expect(await check(makeToken({}, { key: strangerKeys.privateKey }))).toEqual({ status: 'invalid', reason: 'bad signature' });
  });

  it('refuses an unknown signing key and other algorithms', async () => {
    expect((await check(makeToken({}, { kid: 'made-up' }))).status).toBe('invalid');
    expect((await check(makeToken({}, { alg: 'none' }))).status).toBe('invalid');
  });

  it('refuses something that is not a token', async () => {
    expect((await check('not-a-token')).status).toBe('invalid');
    expect((await check('a.b.c')).status).toBe('invalid');
  });
});

describe('Who may sign in with Google', () => {
  const runId = Date.now();
  const email = (name: string) => `${name}.${runId}@test.local`;

  async function auditActions(userId: string) {
    const { data } = await adminClient()
      .from('audit_logs')
      .select('action')
      .eq('entity_type', 'google_account')
      .eq('entity_id', userId)
      .order('id');
    return (data ?? []).map((row) => row.action);
  }

  it('refuses a Google account nobody invited', async () => {
    const db = await testDatabase();
    expect(await signInWithGoogleIdentity(db, { googleId: 'g-stranger', email: email('stranger') })).toEqual({
      status: 'not-invited',
    });
  });

  it('lets an invited person in, links their Google account and accepts the invitation', async () => {
    const db = await testDatabase();
    const userId = await createLogin(email('invited'));
    const admin = adminClient();
    const { data: role } = await admin.from('roles').select('id').limit(1).single();
    await admin.from('employees').insert({ auth_user_id: userId, full_name: 'Invited Person', work_email: email('invited'), role_id: role!.id });

    expect(await signInWithGoogleIdentity(db, { googleId: 'g-invited', email: email('invited') })).toEqual({ status: 'ok', userId });
    expect(await signInWithGoogleIdentity(db, { googleId: 'g-invited', email: email('invited') })).toEqual({ status: 'ok', userId });

    const { data: employee } = await admin.from('employees').select('invite_accepted_at').eq('auth_user_id', userId).single();
    expect(employee?.invite_accepted_at).not.toBeNull();
    expect(await auditActions(userId)).toEqual(['linked', 'signed in with', 'signed in with']);
  });

  it('refuses a different Google account using the same email', async () => {
    const db = await testDatabase();
    const userId = await createLogin(email('taken'));
    expect((await signInWithGoogleIdentity(db, { googleId: 'g-original', email: email('taken') })).status).toBe('ok');
    expect(await signInWithGoogleIdentity(db, { googleId: 'g-newcomer', email: email('taken') })).toEqual({
      status: 'other-google-account',
    });
    expect(await auditActions(userId)).toContain('refused');
  });

  it('refuses a Google account already linked to someone else', async () => {
    const db = await testDatabase();
    await createLogin(email('first'));
    await createLogin(email('second'));
    expect((await signInWithGoogleIdentity(db, { googleId: 'g-shared', email: email('first') })).status).toBe('ok');
    expect((await signInWithGoogleIdentity(db, { googleId: 'g-shared', email: email('second') })).status).toBe(
      'other-google-account',
    );
  });

  it('refuses a deactivated account', async () => {
    const db = await testDatabase();
    const userId = await createLogin(email('inactive'));
    await setAuthUserBlocked(db, userId, true);
    expect(await signInWithGoogleIdentity(db, { googleId: 'g-inactive', email: email('inactive') })).toEqual({
      status: 'blocked',
    });
  });
});
