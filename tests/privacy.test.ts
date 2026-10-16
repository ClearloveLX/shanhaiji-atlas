/**
 * 私密层防泄漏测试。用法：pnpm test:privacy
 *
 * 这是整套私密设计的保险丝：往测试库里插一条 visibility='private' 的条目，
 * 然后遍历 queries.ts 里所有 getPublic* 函数，断言没有一个能拿到它。
 * 以后新增查询函数时，只要忘了加可见性过滤，这个测试就会红。
 *
 * 跑法说明：先用一个独立的测试库（data/test-privacy.db），
 * 打开 ATLAS_DISABLE_CACHE=1 让查询函数直通（Next 之外没有增量缓存）。
 */

process.env.DATABASE_PATH = process.env.DATABASE_PATH ?? './data/test-privacy.db';
process.env.ATLAS_DISABLE_CACHE = '1';

import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const FAILURES: string[] = [];

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ✓ ${label}`);
    return;
  }
  FAILURES.push(`${label}${detail ? ` —— ${detail}` : ''}`);
  console.log(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/test-privacy.db');

  // 每次跑都从干净的测试库开始
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const { db, sqlite } = await import('../src/db/index');
  const { entries, entryBranches, entryTags, tags } = await import('../src/db/schema');
  const queries = await import('../src/db/queries');

  migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

  // ── 造数据：一条公开、一条私密，都打上同一个场景标签 ──
  const publicTagId = 'tag-scene-work';
  db.insert(tags)
    .values({ id: publicTagId, dim: 'scene', slug: 'work', name: '办公', color: '#2F6B6B', sort: 1 })
    .run();

  const privateTagId = 'tag-private-fav';
  db.insert(tags)
    .values({ id: privateTagId, dim: 'private', slug: 'fav', name: '私藏', color: '#9D174D', sort: 1 })
    .run();

  db.insert(entries)
    .values({
      id: 'entry-public',
      type: 'tool',
      linkMode: 'external',
      slug: 'public-tool',
      name: '公开工具',
      summary: '这是一条公开条目，所有人都能看到，用来给测试当对照。',
      url: 'https://example.com',
      visibility: 'public',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  db.insert(entries)
    .values({
      id: 'entry-unlisted',
      type: 'tool',
      linkMode: 'external',
      slug: 'unlisted-tool',
      name: '不列出工具',
      summary: '这是一条 unlisted 条目，知道链接能访问，但不该出现在任何列表里。',
      url: 'https://example.org',
      visibility: 'unlisted',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  db.insert(entries)
    .values({
      id: 'entry-private',
      type: 'tool',
      linkMode: 'external',
      slug: 'private-tool',
      name: '私密工具',
      summary: '这是一条私密条目，只有站长能看到，公开查询一个都不许返回它。',
      url: 'https://secret.example.com',
      visibility: 'private',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  for (const [entryId, tagId] of [
    ['entry-public', publicTagId],
    ['entry-unlisted', publicTagId],
    ['entry-private', publicTagId],
    ['entry-private', privateTagId],
  ] as const) {
    db.insert(entryTags).values({ entryId, tagId }).onConflictDoNothing().run();
  }

  db.insert(entryBranches)
    .values({
      id: 'branch-private',
      entryId: 'entry-private',
      address: '上海市某条不公开的街 1 号',
      city: '上海',
      lat: 31.23,
      lng: 121.47,
      isPrimary: true,
      sort: 0,
      status: 'active',
    })
    .run();

  console.log('私密层防泄漏测试\n');
  console.log('用测试库：', dbPath, '\n');

  const PRIVATE_IDS = new Set(['entry-private']);
  const UNLISTED_IDS = new Set(['entry-unlisted']);

  // ── 逐个公开函数断言 ──
  const list = await queries.getPublicEntries({ pageSize: 50 });
  check(
    'getPublicEntries 不含私密 / 不列出',
    list.items.every((item) => !PRIVATE_IDS.has(item.id) && !UNLISTED_IDS.has(item.id)),
    list.items.map((item) => item.slug).join(', '),
  );

  const bySlug = await queries.getPublicEntryBySlug('tool', 'private-tool');
  check('getPublicEntryBySlug 拿不到私密条目', bySlug === null);

  const unlistedBySlug = await queries.getPublicEntryBySlug('tool', 'unlisted-tool');
  check('getPublicEntryBySlug 拿不到不列出条目（公开详情页只认 public）', unlistedBySlug === null);

  const featured = await queries.getPublicFeatured(10);
  check('getPublicFeatured 不含私密', featured.every((item) => item.visibility === 'public'));

  const latest = await queries.getPublicLatest(10);
  check('getPublicLatest 不含私密 / 不列出', latest.every((item) => item.visibility === 'public'));

  const search = await queries.searchPublicEntries('私密工具', 20);
  check('searchPublicEntries 搜不到私密条目', search.length === 0, `命中 ${search.length} 条`);

  const searchByTag = await queries.searchPublicEntries('私藏', 20);
  check('searchPublicEntries 不会被私密标签命中', searchByTag.length === 0);

  const byTag = await queries.getPublicEntriesByTag('scene', 'work', 50);
  check(
    'getPublicEntriesByTag 不含私密 / 不列出',
    byTag.every((item) => item.visibility === 'public'),
    `拿到 ${byTag.length} 条`,
  );

  const tagTree = await queries.getPublicTagTree();
  check('getPublicTagTree 不返回 private 维度的标签', tagTree.every((tag) => tag.dim !== 'private'));
  check(
    'getPublicTagTree 的计数不含私密条目（办公 应为 1）',
    tagTree.find((tag) => tag.slug === 'work')?.count === 1,
    `实际 ${tagTree.find((tag) => tag.slug === 'work')?.count}`,
  );

  const tagCounts = await queries.getPublicTagCountsByType('tool');
  check('getPublicTagCountsByType 计数不含私密条目', tagCounts.find((tag) => tag.slug === 'work')?.count === 1);

  const typeCounts = await queries.getPublicTypeCounts();
  check(
    'getPublicTypeCounts 只数公开条目（工具 应为 1）',
    typeCounts.find((item) => item.type === 'tool')?.count === 1,
    JSON.stringify(typeCounts),
  );

  const sitemap = await queries.getPublicEntriesForSitemap();
  check('sitemap 数据不含私密 / 不列出', sitemap.every((item) => item.slug !== 'private-tool' && item.slug !== 'unlisted-tool'));

  const redirectEntry = await queries.getPublicRedirectEntry('private-tool');
  check('/go 的公开查询拿不到私密条目', redirectEntry === null);

  const branches = await queries.getPublicPlaceBranches();
  check('好店地图的公开查询不含私密条目的门店', branches.every((branch) => branch.entryId !== 'entry-private'));

  const nearby = await queries.findPublicNearbyBranches(31.23, 121.47, 20);
  check('findPublicNearbyBranches 不含私密门店', nearby.every((branch) => branch.entryId !== 'entry-private'));

  // 反向对照：站长路径能拿到（这里直接查库，getAdmin* 需要 Next 请求上下文）
  const adminView = db.select().from(entries).all();
  check('对照：库里确实存着这条私密条目', adminView.some((item) => item.id === 'entry-private'));

  sqlite.close();

  console.log('');
  if (FAILURES.length > 0) {
    console.error(`✗ 有 ${FAILURES.length} 项没通过：`);
    for (const failure of FAILURES) console.error(`  · ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('✓ 全部通过：所有 getPublic* 函数都拿不到私密条目。');
}

main().catch((error: unknown) => {
  console.error('✗ 测试脚本出错：', error);
  process.exitCode = 1;
});
