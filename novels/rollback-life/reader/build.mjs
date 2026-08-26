#!/usr/bin/env node
/**
 * 《回滚人生》章节数据构建脚本
 *
 * 扫描 ../chapters-*.md（忽略 archive/），解析出 {id, title, body}，
 * 写出 data/chapters.json（目录清单）与 data/part-XXX-YYY.json（分卷正文）。
 *
 * 用法：node build.mjs [--out <dir>] [--part-size 50] [--check 500]
 */

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(HERE, '..');

const NOVEL_TITLE = '回滚人生';

// 与 novels/rollback-life/README.md 的卷目表一致
const VOLUMES = [
  { name: '卷一 · 童年与萌芽', from: 1, to: 20, era: '2010夏–2012夏' },
  { name: '卷一续 · 初中', from: 21, to: 80, era: '2012秋–2015夏' },
  { name: '卷二 · 高中', from: 81, to: 180, era: '2015秋–2018夏' },
  { name: '卷三 · 大学', from: 181, to: 300, era: '2018秋–2022夏' },
  { name: '卷四 · 入行', from: 301, to: 420, era: '2022秋–2025春' },
  { name: '卷五 · 结算', from: 421, to: 500, era: '2025–2046' },
];

function parseArgs(argv) {
  const args = { out: path.join(HERE, 'data'), partSize: 50, check: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--out') args.out = path.resolve(argv[++i]);
    else if (key === '--part-size') args.partSize = Number(argv[++i]);
    else if (key === '--check') args.check = Number(argv[++i]);
    else if (key === '--help' || key === '-h') args.help = true;
  }
  return args;
}

const CN_DIGITS = {
  〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CN_UNITS = { 十: 10, 百: 100, 千: 1000 };

/** 中文数字转阿拉伯数字，兼容「五十六」「一百零一」「二〇一〇」等写法 */
function cnToNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  // 纯数位串（如「二〇一〇」）按逐位读
  if ([...text].every((ch) => ch in CN_DIGITS)) {
    return Number([...text].map((ch) => CN_DIGITS[ch]).join(''));
  }
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of text) {
    if (ch in CN_DIGITS) {
      digit = CN_DIGITS[ch];
    } else if (ch in CN_UNITS) {
      const unit = CN_UNITS[ch];
      section += (digit || 1) * unit;
      digit = 0;
    } else {
      return NaN;
    }
  }
  total += section + digit;
  return total || NaN;
}

// 兼容 `# 第1章 标题` / `## 第五十六章 标题` / `### 第 12 章：标题`
const HEADING_RE = /^\s{0,3}#{1,4}\s*第\s*([0-9〇零一二三四五六七八九十百千两]+)\s*[章回]\s*[:：·．.、\-—–]?\s*(.*?)\s*$/;

/** markdown → 适合直接粘贴到发布平台的纯文本 */
function toPlainText(lines) {
  const out = lines
    .filter((line) => !/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) // 分隔线
    .map((line) => {
      let text = line.replace(/^\s{0,3}>\s?/, ''); // 引用前缀
      text = text.replace(/\*\*(.+?)\*\*/g, '$1'); // 粗体
      text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1'); // 斜体
      text = text.replace(/`([^`]+)`/g, '$1'); // 行内代码
      return text.replace(/\s+$/, '');
    });

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function volumeOf(id) {
  return VOLUMES.find((v) => id >= v.from && id <= v.to) || null;
}

async function parseFile(fileName) {
  const raw = await readFile(path.join(SOURCE_DIR, fileName), 'utf8');
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  const chapters = [];
  let current = null;
  const preface = [];

  for (const line of lines) {
    const match = HEADING_RE.exec(line);
    if (match) {
      if (current) chapters.push(current);
      const id = cnToNumber(match[1]);
      if (!Number.isFinite(id)) throw new Error(`${fileName}: 无法解析章号 -> ${line}`);
      current = { id, name: match[2].trim(), lines: [], file: fileName };
      continue;
    }
    if (current) current.lines.push(line);
    else preface.push(line);
  }
  if (current) chapters.push(current);

  // 文件开头（第一章之前）的编者按，挂到本文件第一章上，仅展示、不参与复制
  const note = toPlainText(preface);
  if (note && chapters.length) chapters[0].note = note;

  return chapters.map((ch) => {
    const body = toPlainText(ch.lines);
    const title = ch.name ? `第${ch.id}章 ${ch.name}` : `第${ch.id}章`;
    return {
      id: ch.id,
      name: ch.name,
      title,
      body,
      chars: body.replace(/\s/g, '').length,
      file: ch.file,
      note: ch.note || '',
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('用法: node build.mjs [--out <dir>] [--part-size 50] [--check 500]');
    return;
  }

  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /^chapters-.*\.md$/.test(e.name))
    .map((e) => e.name)
    .sort();

  if (!files.length) throw new Error(`在 ${SOURCE_DIR} 下没有找到 chapters-*.md`);

  const all = [];
  for (const file of files) all.push(...(await parseFile(file)));
  all.sort((a, b) => a.id - b.id);

  // 一致性检查
  const seen = new Map();
  for (const ch of all) {
    if (seen.has(ch.id)) {
      throw new Error(`第${ch.id}章重复：${seen.get(ch.id)} 与 ${ch.file}`);
    }
    seen.set(ch.id, ch.file);
    if (!ch.body) console.warn(`⚠️  第${ch.id}章正文为空（${ch.file}）`);
  }
  const missing = [];
  for (let id = 1; id <= all[all.length - 1].id; id += 1) {
    if (!seen.has(id)) missing.push(id);
  }
  if (missing.length) console.warn(`⚠️  缺失章节：${missing.join(', ')}`);

  // 半角标点夹在汉字中间，粘到发布平台会很显眼
  const halfWidth = all.filter((ch) => /[\u4e00-\u9fff][,;:!?][\u4e00-\u9fff]/.test(ch.body));
  if (halfWidth.length) {
    console.warn(`⚠️  ${halfWidth.length} 章正文含半角标点：第 ${halfWidth.map((c) => c.id).join('、')} 章`);
  }
  if (args.check && all.length !== args.check) {
    throw new Error(`章节数不符：期望 ${args.check}，实际 ${all.length}`);
  }

  // 输出
  if (existsSync(args.out)) await rm(args.out, { recursive: true, force: true });
  await mkdir(args.out, { recursive: true });

  const parts = [];
  for (let i = 0; i < all.length; i += args.partSize) {
    const slice = all.slice(i, i + args.partSize);
    const from = slice[0].id;
    const to = slice[slice.length - 1].id;
    const pad = (n) => String(n).padStart(3, '0');
    const fileName = `part-${pad(from)}-${pad(to)}.json`;
    parts.push({ file: fileName, from, to, count: slice.length });
    await writeFile(
      path.join(args.out, fileName),
      JSON.stringify({
        from,
        to,
        chapters: slice.map((ch) => ({
          id: ch.id,
          title: ch.title,
          name: ch.name,
          body: ch.body,
          note: ch.note || undefined,
        })),
      }),
      'utf8',
    );
  }

  const manifest = {
    novel: NOVEL_TITLE,
    generatedAt: new Date().toISOString(),
    count: all.length,
    chars: all.reduce((sum, ch) => sum + ch.chars, 0),
    partSize: args.partSize,
    parts,
    volumes: VOLUMES.filter((v) => all.some((ch) => ch.id >= v.from && ch.id <= v.to)),
    chapters: all.map((ch) => ({
      id: ch.id,
      title: ch.title,
      name: ch.name,
      chars: ch.chars,
      part: parts.findIndex((p) => ch.id >= p.from && ch.id <= p.to),
      volume: volumeOf(ch.id)?.name || '',
    })),
  };

  await writeFile(
    path.join(args.out, 'chapters.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`✅ 源文件 ${files.length} 个 → 章节 ${all.length} 章（${manifest.chars.toLocaleString('zh-CN')} 字）`);
  console.log(`   目录：${path.relative(process.cwd(), path.join(args.out, 'chapters.json'))}`);
  console.log(`   分卷：${parts.length} 个 part-*.json（每卷 ${args.partSize} 章）`);
  console.log(`   区间：第${all[0].id}章 – 第${all[all.length - 1].id}章`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
