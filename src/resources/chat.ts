import { bearerHeaders } from '../auth/headers.js';
import { ChzzkValidationError } from '../errors.js';
import { parseLenient } from '../http/parse.js';
import { requireParam } from '../http/validate.js';
import {
  allowedChatSlowModeSecs,
  allowedMinFollowerMinutes,
  chatSendResultSchema,
  chatSettingsSchema,
  type BlindMessageParams,
  type ChatSettings,
  type ChatSettingsUpdate,
} from '../types/chat.js';
import type { ResourceDeps } from './shared.js';

export type ChatNoticeParams =
  | {
      /** 신규 메시지로 공지 등록. 최대 100자 */
      message: string;
      messageId?: never;
    }
  | {
      /** 이미 전송된 메시지를 공지로 등록 (chats/send 응답의 messageId) */
      messageId: string;
      message?: never;
    };

/**
 * Chat 리소스. 모두 유저 토큰 필요.
 * https://chzzk.gitbook.io/chzzk/chzzk-api/chat
 *
 * 참고: 채팅 채널은 라이브 상태와 무관하게 존재한다 — 실측(2026-07-22)으로
 * 라이브가 꺼진 상태에서도 전송이 성공함을 확인.
 */
export class ChatResource {
  constructor(private readonly deps: ResourceDeps) {}

  /**
   * 채팅 메시지 전송 — `POST /open/v1/chats/send` 〔Scope: 채팅 메시지 쓰기〕
   * @param message 최대 100자
   * @returns 전송된 메시지 ID (공지 등록에 사용 가능)
   */
  async send(message: string): Promise<string> {
    requireParam(message, 'message');
    if (message.length > 100) {
      throw new ChzzkValidationError('"message" must be 100 characters or fewer');
    }
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: '/open/v1/chats/send',
        headers: bearerHeaders(token),
        body: { message },
      }),
    );
    return parseLenient(chatSendResultSchema, raw, this.deps.logger, 'POST /open/v1/chats/send')
      .messageId;
  }

  /**
   * 채팅 공지 등록 — `POST /open/v1/chats/notice` 〔Scope: 채팅 공지 쓰기〕
   * `message`(신규) 또는 `messageId`(기존 메시지) 중 정확히 하나를 전달한다.
   */
  async notice(params: ChatNoticeParams): Promise<void> {
    const hasMessage = typeof params.message === 'string' && params.message !== '';
    const hasMessageId = typeof params.messageId === 'string' && params.messageId !== '';
    if (hasMessage === hasMessageId) {
      throw new ChzzkValidationError('notice requires exactly one of "message" or "messageId"');
    }
    if (hasMessage && params.message !== undefined && params.message.length > 100) {
      throw new ChzzkValidationError('"message" must be 100 characters or fewer');
    }
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: '/open/v1/chats/notice',
        headers: bearerHeaders(token),
        body: hasMessage ? { message: params.message } : { messageId: params.messageId },
      }),
    );
  }

  /** 채팅 설정 조회 — `GET /open/v1/chats/settings` 〔Scope: 채팅 설정 조회〕 */
  async getSettings(): Promise<ChatSettings> {
    const raw = await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'GET',
        path: '/open/v1/chats/settings',
        headers: bearerHeaders(token),
      }),
    );
    return parseLenient(chatSettingsSchema, raw, this.deps.logger, 'GET /open/v1/chats/settings');
  }

  /**
   * 채팅 설정 변경 — `PUT /open/v1/chats/settings` 〔Scope: 채팅 설정 변경〕
   * `minFollowerMinute`·`chatSlowModeSec`는 문서가 허용하는 값만 통과시킨다.
   */
  async updateSettings(update: ChatSettingsUpdate): Promise<void> {
    if (Object.keys(update).length === 0) {
      throw new ChzzkValidationError('updateSettings requires at least one field to change');
    }
    if (
      update.minFollowerMinute !== undefined &&
      !(allowedMinFollowerMinutes as readonly number[]).includes(update.minFollowerMinute)
    ) {
      throw new ChzzkValidationError(
        `"minFollowerMinute" must be one of ${allowedMinFollowerMinutes.join(', ')}`,
      );
    }
    if (
      update.chatSlowModeSec !== undefined &&
      !(allowedChatSlowModeSecs as readonly number[]).includes(update.chatSlowModeSec)
    ) {
      throw new ChzzkValidationError(
        `"chatSlowModeSec" must be one of ${allowedChatSlowModeSecs.join(', ')}`,
      );
    }
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'PUT',
        path: '/open/v1/chats/settings',
        headers: bearerHeaders(token),
        body: update,
      }),
    );
  }

  /**
   * 채팅 메시지 숨기기 — `POST /open/v1/chats/blind-message` 〔Scope: 채팅 메시지 쓰기〕
   * (2026.03 추가) 이미 발생한 메시지의 사후 숨김만 가능하다. 파라미터는
   * 세션 CHAT 이벤트의 `chatChannelId`/`messageTime`/`senderChannelId`를 사용한다.
   */
  async blindMessage(params: BlindMessageParams): Promise<void> {
    requireParam(params.chatChannelId, 'chatChannelId');
    requireParam(params.senderChannelId, 'senderChannelId');
    if (typeof params.messageTime !== 'number' || !Number.isFinite(params.messageTime)) {
      throw new ChzzkValidationError('"messageTime" must be a millisecond timestamp number');
    }
    await this.deps.tokenManager.withAccessToken((token) =>
      this.deps.http.request<unknown>({
        method: 'POST',
        path: '/open/v1/chats/blind-message',
        headers: bearerHeaders(token),
        body: params,
      }),
    );
  }
}
