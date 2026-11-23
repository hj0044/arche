// 화면 코드 정적 검사(지시서 017 A-5). 노드 환경에서 src/ui 파일을 읽어 규칙을 확인한다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(import.meta.dirname);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(UI).filter((p) => /\.(tsx?|css)$/.test(p) && !p.endsWith('.test.ts'));
const rel = (p: string) => relative(UI, p).replaceAll('\\', '/');
/** 주석을 지운 본문(문자열 안의 // 는 드물어 단순 처리) */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('화면 코드 정적 검사', () => {
  it('색 리터럴(헥스·rgb)은 theme.css와 art/fallback 밖에 없다', () => {
    const bad = files
      .filter((p) => rel(p) !== 'theme.css' && !rel(p).startsWith('art/fallback/'))
      .flatMap((p) => {
        const body = stripComments(readFileSync(p, 'utf8'));
        const hits = body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g) ?? [];
        return hits.filter((h) => !/^#[0-9]+$/.test(h) || h.length > 4).map((h) => `${rel(p)}: ${h}`);
      });
    expect(bad).toEqual([]);
  });

  it('이모지가 없다', () => {
    const bad = files.flatMap((p) => {
      const hits = stripComments(readFileSync(p, 'utf8')).match(/\p{Extended_Pictographic}/gu) ?? [];
      return hits.map((h) => `${rel(p)}: ${h}`);
    });
    expect(bad).toEqual([]);
  });

  it('화면 문구에 "용병"을 직접 쓰지 않는다(용어 표를 거친다. 용병단·떠돌이 용병은 허용)', () => {
    const bad = files
      .filter((p) => /\.tsx?$/.test(p))
      .flatMap((p) =>
        stripComments(readFileSync(p, 'utf8'))
          .split('\n')
          .filter((line) => /(?<!떠돌이 )용병(?!단)/.test(line))
          .map((line) => `${rel(p)}: ${line.trim().slice(0, 60)}`),
      );
    expect(bad).toEqual([]);
  });

  it('src/ui는 src/storage를 직접 임포트하지 않는다', () => {
    const bad = files.filter((p) => /from\s+['"][./]*\/?storage\//.test(readFileSync(p, 'utf8')) || /from\s+['"](\.\.\/)+storage/.test(readFileSync(p, 'utf8'))).map(rel);
    expect(bad).toEqual([]);
  });
});
