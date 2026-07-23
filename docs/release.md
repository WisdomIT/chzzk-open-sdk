# 릴리스 절차 (메인테이너용)

시맨틱 버저닝을 따르며, **`vX.Y.Z` 태그 push만이 npm 배포를 트리거**한다 (태그 없이 자동 배포되지 않음).

배포 인증은 **npm Trusted Publishing(GitHub Actions OIDC)** 을 사용한다 — 토큰/시크릿이 필요 없고,
npm이 단계적으로 제한 중인 2FA 우회 토큰 방식을 쓰지 않는다.

## 사전 준비 (1회)

1. 최초 배포(v1.0.0)는 npm 2FA 정책에 따라 로컬에서 완료됨 (`npm login` + 2FA OTP `npm publish`)
2. npmjs.com → `chzzk-open-sdk` 패키지 → **Settings → Trusted Publisher** 등록:
   - Publisher: **GitHub Actions**
   - Organization or user: `WisdomIT`
   - Repository: `chzzk-open-sdk`
   - Workflow filename: `release.yml`
   - Environment: (비움)

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

# 5) main에서 태그 생성·push → GitHub Actions가 검증 후 npm publish (무토큰)
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

## release.yml이 하는 일

1. npm 11.5.1+ 확보 (Trusted Publishing 요구사항)
2. 태그 버전과 `package.json` 버전 일치 검증 (다르면 실패)
3. 품질 게이트: typecheck / lint / test / build
4. `npm publish --dry-run`으로 배포 내용 로그
5. `npm publish --access public` — OIDC로 신원 증명, [provenance](https://docs.npmjs.com/generating-provenance-statements) 자동 서명

## 버저닝 규칙

- **MAJOR**: 공개 API의 하위 호환이 깨지는 변경 (메서드 시그니처/정규화 타입 변경 등)
- **MINOR**: 하위 호환 기능 추가 (새 엔드포인트, 새 옵션)
- **PATCH**: 버그 수정, 문서-실제 불일치 대응(타입 완화 등)
- 치지직 API 자체의 변경으로 인한 타입 수정은 가능한 한 하위 호환(optional/union 확장)으로 흡수하고 MINOR로 배포한다.
