import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RESERVED_TENANT_SUBDOMAINS } from './tenant.constants';
import {
  allocateUniqueSchoolSlug,
  isValidSchoolSlug,
  MAX_SCHOOL_SLUG_LENGTH,
  schoolTenantDomain,
  slugifySchoolName,
} from './school-slug';

describe('school slug generation', () => {
  it('builds a clean slug from a normal school name', () => {
    assert.equal(slugifySchoolName('Bright Future Charsadda'), 'bright-future-charsadda');
    assert.equal(slugifySchoolName('Allied School Tangi'), 'allied-school-tangi');
    assert.equal(slugifySchoolName('IQRA Smart School'), 'iqra-smart-school');
  });

  it('lowercases, strips invalid characters, and collapses hyphens', () => {
    assert.equal(slugifySchoolName('  Bright   Future---Charsadda  '), 'bright-future-charsadda');
    assert.equal(slugifySchoolName('Bright Future!!! Charsadda @ Campus'), 'bright-future-charsadda-campus');
    assert.equal(slugifySchoolName('Allied_School/Tangi'), 'allied-school-tangi');
    assert.ok(isValidSchoolSlug(slugifySchoolName('Bright Future!!! Charsadda @ Campus')));
  });

  it('stays within the allowed slug length and pattern', () => {
    const longName = Array.from({ length: 40 }, (_, i) => `Word${i}`).join(' ');
    const slug = slugifySchoolName(longName);
    assert.ok(slug.length <= MAX_SCHOOL_SLUG_LENGTH);
    assert.ok(isValidSchoolSlug(slug));
    assert.equal(slugifySchoolName('A'), 'school');
    assert.equal(slugifySchoolName('!!!'), 'school');
  });

  it('allocates -2 when the clean slug is already taken', async () => {
    const taken = new Set(['bright-future-charsadda']);
    const slug = await allocateUniqueSchoolSlug('Bright Future Charsadda', async (candidate) =>
      taken.has(candidate),
    );
    assert.equal(slug, 'bright-future-charsadda-2');
  });

  it('allocates -3 when the base slug and -2 are taken', async () => {
    const taken = new Set(['iqra-smart-school', 'iqra-smart-school-2']);
    const slug = await allocateUniqueSchoolSlug('IQRA Smart School', async (candidate) =>
      taken.has(candidate),
    );
    assert.equal(slug, 'iqra-smart-school-3');
  });

  it('skips reserved platform subdomains', async () => {
    for (const reserved of RESERVED_TENANT_SUBDOMAINS) {
      const slug = await allocateUniqueSchoolSlug(reserved, async () => false);
      assert.equal(slug, `${reserved}-2`);
      assert.notEqual(slug, reserved);
    }
  });

  it('builds the tenant domain from the generated slug', () => {
    assert.equal(
      schoolTenantDomain('bright-future-charsadda'),
      'bright-future-charsadda.clevercampus.cloud',
    );
    assert.equal(schoolTenantDomain('iqra-smart-school'), 'iqra-smart-school.clevercampus.cloud');
  });

  it('does not rewrite existing old or custom slugs', async () => {
    const existing = new Set([
      'bright-future-charsadda-mtwsnd4l',
      'allied-school-tangi-abc123',
      'iqra-smart-school',
    ]);
    const snapshot = new Set(existing);

    const bright = await allocateUniqueSchoolSlug('Bright Future Charsadda', async (candidate) =>
      existing.has(candidate),
    );
    const allied = await allocateUniqueSchoolSlug('Allied School Tangi', async (candidate) =>
      existing.has(candidate),
    );
    const iqra = await allocateUniqueSchoolSlug('IQRA Smart School', async (candidate) =>
      existing.has(candidate),
    );

    assert.equal(bright, 'bright-future-charsadda');
    assert.equal(allied, 'allied-school-tangi');
    assert.equal(iqra, 'iqra-smart-school-2');
    assert.deepEqual(existing, snapshot);
    assert.ok(existing.has('bright-future-charsadda-mtwsnd4l'));
    assert.ok(existing.has('iqra-smart-school'));
  });

  it('keeps a -2 collision within 80 characters for a max-length base slug', async () => {
    const longName = 'A'.repeat(80);
    const base = slugifySchoolName(longName);
    assert.equal(base.length, 80);
    assert.ok(isValidSchoolSlug(base));

    const slug = await allocateUniqueSchoolSlug(longName, async (candidate) => candidate === base);
    assert.equal(slug.length, 80);
    assert.ok(isValidSchoolSlug(slug));
    assert.ok(slug.endsWith('-2'));
  });
});
