/**
 * 페이지네이션 자동 순회 헬퍼.
 *
 * CHZZK Open API는 세 가지 방식을 혼용한다 (docs/endpoints.md 참조):
 * - 페이지 번호(`page`, 0부터): 세션 목록, 팔로워, 구독자 — 응답에 페이지 메타 없음 → 빈 페이지까지 순회
 * - 커서(`next`): 라이브 목록, 활동 제한 목록 — 응답 `page.next`
 * - 커서(`from`): 드롭스 지급 요청 조회 — 응답 `page.cursor`
 */

/** 페이지 번호 기반 API를 빈 페이지가 나올 때까지 순회한다. */
export async function* paginateByPage<T>(
  fetchPage: (page: number) => Promise<readonly T[]>,
  startPage = 0,
): AsyncGenerator<T, void, undefined> {
  for (let page = startPage; ; page += 1) {
    const items = await fetchPage(page);
    if (items.length === 0) {
      return;
    }
    yield* items;
  }
}

export interface CursorPage<T> {
  items: readonly T[];
  /** 다음 페이지 커서. null/undefined/빈 문자열이면 마지막 페이지. */
  next: string | null | undefined;
}

/** 커서 기반 API를 커서가 소진될 때까지 순회한다. */
export async function* paginateByCursor<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined = undefined;
  for (;;) {
    const { items, next } = await fetchPage(cursor);
    yield* items;
    // 빈 문자열·null·undefined는 종료. 동일 커서 반복도 무한 루프 방지를 위해 종료.
    if (next == null || next === '' || next === cursor || items.length === 0) {
      return;
    }
    cursor = next;
  }
}
