import { describe, expect, it } from 'vitest';
import { FakeSite } from '../../test/sites.js';
import { AppError } from '../errors.js';
import { defaultRegistry } from '../scraper/adapters/registry.js';
import { HostThrottle } from '../scraper/session.js';
import { createAccountService } from './accounts.js';

const STATUS = 'https://wtr-lab.com/api/v2/user/config';
const LINK = 'https://wtr-lab.com/api/auth/callback?token=abc';

const service = (fake: FakeSite | null) =>
  createAccountService(
    defaultRegistry(),
    fake && { http: fake, throttle: new HostThrottle(0), renderer: fake },
  );

describe('site accounts', () => {
  it('reads whether the web view is signed in', async () => {
    const fake = new FakeSite();
    fake.rendered.set(STATUS, '<pre>{"error":"Unauthorized"}</pre>');
    expect(await service(fake).status('wtr_lab')).toEqual({
      signInUrl: 'https://wtr-lab.com/en/auth/login',
      signedIn: false,
    });
  });

  it("can't tell without a web view", async () => {
    expect((await service(null).status('wtr_lab')).signedIn).toBeNull();
  });

  it('opens a sign-in link in the web view, then checks again', async () => {
    const fake = new FakeSite();
    fake.rendered.set(LINK, '<html><body>Welcome back</body></html>');
    fake.rendered.set(STATUS, '<pre>{"config":{"terms":[]}}</pre>');
    expect((await service(fake).signInWithLink('wtr_lab', ` ${LINK} `)).signedIn).toBe(true);
    expect(fake.renders.get(LINK)).toBe(1);
  });

  it('refuses what is not a link, and sites without an account', async () => {
    const accounts = service(new FakeSite());
    await expect(accounts.signInWithLink('wtr_lab', 'my email')).rejects.toThrow(AppError);
    await expect(accounts.status('royal_road')).rejects.toMatchObject({ status: 404 });
  });
});
