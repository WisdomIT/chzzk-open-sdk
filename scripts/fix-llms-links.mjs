/**
 * llms.txt / llms-full.txt 링크 보정 (docs:build 후처리).
 *
 * vitepress-plugin-llms가 VitePress 페이지에는 base를 붙이고
 * TypeDoc 생성 페이지에는 붙이지 않는 비일관성이 있어,
 * 모든 링크가 `https://wisdomit.github.io/chzzk-open-sdk/...` 형태가 되도록 정규화한다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DOMAIN = 'https://wisdomit.github.io';
const BASE = '/chzzk-open-sdk';
const DIST = 'docs/.vitepress/dist';

function normalize(content) {
  return (
    content
      // base 중복 제거: /chzzk-open-sdk/chzzk-open-sdk/ → /chzzk-open-sdk/
      .replaceAll(`${DOMAIN}${BASE}${BASE}/`, `${DOMAIN}${BASE}/`)
      // base 누락 보정: github.io/api/... 등 → github.io/chzzk-open-sdk/api/...
      .replace(new RegExp(`${DOMAIN}/(?!chzzk-open-sdk/)`, 'g'), `${DOMAIN}${BASE}/`)
  );
}

let fixed = 0;
for (const name of ['llms.txt', 'llms-full.txt']) {
  const path = `${DIST}/${name}`;
  if (!existsSync(path)) continue;
  const before = readFileSync(path, 'utf8');
  const after = normalize(before);
  if (after !== before) {
    writeFileSync(path, after);
    fixed += 1;
  }
}
console.log(`llms 링크 정규화 완료 (${fixed}개 파일 수정)`);
