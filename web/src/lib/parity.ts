// 校验：Astro 这边解析出来的结构，和检索页现在用的那份一模一样。
//
//   npm run check
//
// 为什么必须有这个：web/src/lib/parse.ts 是从 page.template.html 里搬过来的副本。
// 两份各自演化，迟早会对不上；对不上时，爬虫看到的和读者看到的就不是一本书了。
// 这个脚本不靠「我抄对了」，它把原版 parseReadme 从模板里抠出来、在同一份
// markdown 上跑一遍，两边逐字段比。任何一条对不上就退出码 1。
//
// 只比页面真正用来渲染和筛选的字段。原文不用比：两边的语料读的是同一个文件。
import { readFileSync } from 'node:fs';
import { LOCALES, locale, readRepo, readmePath, at, repoPath } from './site';
import { parseReadme, parseGlossary } from './parse';
import { loadLocale, hasReadme } from './load';
import { existsSync } from 'node:fs';

/** 把模板里原版 parseReadme 的源码抠出来，组装成一个能直接调用的函数 */
function originalParser(templateSrc, cfg) {
  const start = templateSrc.indexOf('function parseReadme(md){');
  if (start < 0) throw new Error('page.template.html 里找不到 parseReadme');
  // 找到这个函数的结尾：下一个顶格的 }
  let depth = 0, end = -1;
  for (let i = start; i < templateSrc.length; i++) {
    const c = templateSrc[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('parseReadme 的结尾没对上');
  const src = templateSrc.slice(start, end);

  // 原版读的是页面里的全局量：SITE（字段名、争议、待核实）和 COST_W。
  // 这里按 locale 配置造一份同名同形状的，函数体一行不改。
  const f = new Function('SITE', 'COST_W', `${src}; return parseReadme;`);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldRe = label => new RegExp('^- ' + esc(label) + '\\s*(.+)$');
  const SITE = {
    fields: cfg.fields,
    dispute: cfg.dispute,
    todo: cfg.todo,
  };
  const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };
  // 原版把 RE_COST 等从 SITE.fields 现拼，页面里也是这么定义的；补上以防它引用
  void fieldRe;
  return f(SITE, COST_W);
}

const FIELDS = ['sec', 'n', 'title', 'cost', 'human', 'gain', 'grade', 'src', 'note',
  'money', 'time', 'will', 'level', 'lens', 'dispute', 'todo', 'cs', 'ratio', 'hay'];

let bad = 0;
const report = (code, what, detail) => {
  bad++;
  console.log(`  ✗ ${code} ${what}${detail ? '：' + detail : ''}`);
};

const templateSrc = readRepo('tools/site/page.template.html');
const live = LOCALES.filter(l => hasReadme(l.code));

console.log(`解析一致性校验：${live.map(l => l.code).join('、')}\n`);

for (const meta of live) {
  const cfg = locale(meta.code);
  const data = loadLocale(meta.code, cfg);
  const md = [data.readme, ...data.files.map(f => f.text)].join('\n\n');

  let want;
  try {
    want = originalParser(templateSrc, cfg)(md);
  } catch (err) {
    console.log(`  ! ${meta.code} 原版 parseReadme 跑不起来：${err.message}`);
    report(meta.code, '原版解析', err.message);
    continue;
  }

  const got = parseReadme(md, cfg);

  if (got.length !== want.length) {
    report(meta.code, '节数', `新 ${got.length} vs 原 ${want.length}`);
    continue;
  }
  let n = 0;
  for (let i = 0; i < want.length; i++) {
    const a = want[i], b = got[i];
    if (a.n !== b.n || a.title !== b.title) { report(meta.code, `第 ${i + 1} 节`, `${a.n}. ${a.title} vs ${b.n}. ${b.title}`); continue; }
    if (a.intro.join('\n') !== b.intro.join('\n')) report(meta.code, `第 ${a.n} 节导读`);
    if (a.entries.length !== b.entries.length) { report(meta.code, `第 ${a.n} 节条目数`, `新 ${b.entries.length} vs 原 ${a.entries.length}`); continue; }
    for (let j = 0; j < a.entries.length; j++) {
      const x = a.entries[j], y = b.entries[j];
      for (const k of FIELDS) {
        if (String(x[k]) !== String(y[k])) {
          report(meta.code, `第 ${a.n} 节第 ${x.n} 条的 ${k}`, `原 ${JSON.stringify(String(x[k]).slice(0, 60))} vs 新 ${JSON.stringify(String(y[k]).slice(0, 60))}`);
          break;
        }
      }
      n++;
    }
  }
  if (!bad) console.log(`  ✓ ${meta.code}：${got.length} 节 ${n} 条，19 个字段逐条一致`);
}

console.log();
if (bad) {
  console.log(`解析对不上 ${bad} 处。web/src/lib/parse.ts 和 page.template.html 的 parseReadme 必须同时改。`);
  process.exit(1);
}
console.log('解析一致：站内渲染和构建时预渲染看到的是同一本书。');
void readmePath; void at; void repoPath; void existsSync; void readFileSync; void parseGlossary;
