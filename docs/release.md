# 릴리스 절차 (메인테이너용)

시맨틱 버저닝을 따르며, **`vX.Y.Z` 태그 push만이 npm 배포를 트리거**한다 (태그 없이 자동 배포되지 않음).

## 사전 준비 (1회)

1. npmjs.com에서 **automation 토큰** 발급 (Settings → Access Tokens → Generate New Token → Automation)
2. 저장소 시크릿 등록: `gh secret set NPM_TOKEN` (또는 GitHub Settings → Secrets and variables → Actions)

## 릴리스 단계

```bash
# 1) dev에서 릴리스 준비 브랜치
git checkout dev && git pull
git checkout -b chore/release-vX.Y.Z

# 2) 버전 확정
#    - package.json "version" 을 X.Y.Z로 변경
#    - CHANGELOG.md: [Unreleased] 내용을 [X.Y.Z] - YYYY-MM-DD 섹션으로 확정
pnpm typecheck && pnpm lint && pnpm test && pnpm build
npm publish --dry-run   # 산출물에 dist/README/LICENSE/CHANGELOG만 포함되는지 확인

# 3) PR → dev 머지 (CI 통과 필수)

# 4) dev → main 릴리스 PR 생성 후 머지

# 5) main에서 태그 생성·push → GitHub Actions가 검증 후 npm publish
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

## release.yml이 하는 일

1. 태그 버전과 `package.json` 버전 일치 검증 (다르면 실패)
2. 품질 게이트: typecheck / lint / test / build
3. `npm publish --dry-run`으로 배포 내용 로그
4. `npm publish --provenance --access public` — [npm provenance](https://docs.npmjs.com/generating-provenance-statements)로 빌드 출처 서명 포함

## 버저닝 규칙

- **MAJOR**: 공개 API의 하위 호환이 깨지는 변경 (메서드 시그니처/정규화 타입 변경 등)
- **MINOR**: 하위 호환 기능 추가 (새 엔드포인트, 새 옵션)
- **PATCH**: 버그 수정, 문서-실제 불일치 대응(타입 완화 등)
- 치지직 API 자체의 변경으로 인한 타입 수정은 가능한 한 하위 호환(optional/union 확장)으로 흡수하고 MINOR로 배포한다.
