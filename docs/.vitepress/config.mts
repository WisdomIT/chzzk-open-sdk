import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

// TypeDoc(typedoc-vitepress-theme)이 생성하는 API 사이드바 (pnpm docs:api 후 존재)
function loadApiSidebar(): DefaultTheme.SidebarItem[] {
  const sidebarPath = fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
  if (!existsSync(sidebarPath)) return [];
  return JSON.parse(readFileSync(sidebarPath, 'utf8')) as DefaultTheme.SidebarItem[];
}

export default defineConfig({
  lang: 'ko-KR',
  title: 'chzzk-open-sdk',
  description: '네이버 치지직 공식 OPEN API 전용 TypeScript SDK — 공식 스펙만, 전부, 타입 안전하게',
  base: '/chzzk-open-sdk/',
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: '가이드', link: '/guide/getting-started' },
      { text: 'API 레퍼런스', link: '/api/' },
      { text: '검증 기록', link: '/api-notes' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '가이드',
          items: [
            { text: '시작하기', link: '/guide/getting-started' },
            { text: 'OAuth 인증', link: '/guide/oauth' },
            { text: '리소스 API', link: '/guide/resources' },
            { text: '실시간 이벤트', link: '/guide/realtime' },
            { text: 'wizbot 마이그레이션', link: '/guide/migration' },
          ],
        },
        {
          text: '검증',
          items: [
            { text: '문서-실제 검증 기록', link: '/api-notes' },
            { text: '엔드포인트 정리표', link: '/endpoints' },
            { text: '검증 하니스 사용법', link: '/verification' },
          ],
        },
      ],
      '/api/': [{ text: 'API 레퍼런스', items: loadApiSidebar() }],
      '/': [
        {
          text: '검증',
          items: [
            { text: '문서-실제 검증 기록', link: '/api-notes' },
            { text: '엔드포인트 정리표', link: '/endpoints' },
            { text: '검증 하니스 사용법', link: '/verification' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/WisdomIT/chzzk-open-sdk' }],
    search: { provider: 'local' },
    outline: { label: '목차', level: [2, 3] },
    docFooter: { prev: '이전', next: '다음' },
    footer: {
      message: '공식 OPEN API만 지원 — 비공식 엔드포인트 0건',
      copyright: 'MIT © WisdomIT',
    },
  },
});
