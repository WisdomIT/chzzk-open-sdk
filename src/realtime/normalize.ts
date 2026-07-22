import { noopLogger, type ChzzkLogger } from '../http/logger.js';
import {
  rawChatEventSchema,
  rawDonationEventSchema,
  rawSubscriptionEventSchema,
  rawSystemMessageSchema,
  type ChatMessage,
  type ChatRole,
  type Donation,
  type NormalizedEvent,
  type RawChatEvent,
  type RawDonationEvent,
  type RawSubscriptionEvent,
  type SubscriptionEvent,
  type SystemEvent,
} from '../types/events.js';
import type { z } from 'zod';
import type { RawSessionEvent } from './transport.js';

/**
 * Normalize 계층 (SDK 경계).
 *
 * 원시 세션 이벤트(JSON 문자열)를 정규화 도메인 이벤트로 변환한다.
 * 문서-실제 불일치(userRoleCode 위치, emojis Map, 미문서 필드 등)는
 * 여기서 한 번만 흡수되어 소비자는 항상 정규화 타입만 본다.
 *
 * 알 수 없는 이벤트·스키마 불일치는 죽지 않고 `unknown`으로 전달한다
 * (경고 로그) — SDK가 API 변화로 소비자를 중단시키지 않기 위함.
 */
export function normalizeSessionEvent(
  raw: RawSessionEvent,
  logger: ChzzkLogger = noopLogger,
): NormalizedEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(raw.body);
  } catch {
    logger.warn(`chzzk-open-sdk normalize: unparsable ${raw.name} event body`);
    return { type: 'unknown', eventName: raw.name, body: raw.body };
  }

  switch (raw.name) {
    case 'CHAT': {
      const parsed = rawChatEventSchema.safeParse(payload);
      if (!parsed.success) {
        return warnUnknown(raw, logger, parsed.error.message);
      }
      return { type: 'chat', chat: toChatMessage(parsed.data) };
    }
    case 'DONATION': {
      const parsed = rawDonationEventSchema.safeParse(payload);
      if (!parsed.success) {
        return warnUnknown(raw, logger, parsed.error.message);
      }
      return { type: 'donation', donation: toDonation(parsed.data) };
    }
    case 'SUBSCRIPTION': {
      const parsed = rawSubscriptionEventSchema.safeParse(payload);
      if (!parsed.success) {
        return warnUnknown(raw, logger, parsed.error.message);
      }
      return { type: 'subscription', subscription: toSubscription(parsed.data) };
    }
    case 'SYSTEM': {
      const parsed = rawSystemMessageSchema.safeParse(payload);
      if (!parsed.success) {
        return warnUnknown(raw, logger, parsed.error.message);
      }
      return { type: 'system', system: toSystemEvent(parsed.data) };
    }
    default:
      logger.debug(`chzzk-open-sdk normalize: unknown event "${raw.name}" passed through`);
      return { type: 'unknown', eventName: raw.name, body: raw.body };
  }
}

function warnUnknown(raw: RawSessionEvent, logger: ChzzkLogger, detail: string): NormalizedEvent {
  logger.warn(`chzzk-open-sdk normalize: ${raw.name} schema mismatch — ${detail}`);
  return { type: 'unknown', eventName: raw.name, body: raw.body };
}

type RawSystem = z.infer<typeof rawSystemMessageSchema>;

function toChatMessage(rawChat: RawChatEvent): ChatMessage {
  return {
    channelId: rawChat.channelId,
    senderChannelId: rawChat.senderChannelId,
    chatChannelId: rawChat.chatChannelId ?? null,
    nickname: rawChat.profile.nickname,
    badges: (rawChat.profile.badges ?? []).map((badge) => ({ imageUrl: badge.imageUrl })),
    verifiedMark: rawChat.profile.verifiedMark ?? false,
    // 실측 위치(profile 내부) 우선, 문서 위치(최상위) 폴백 — api-notes #27
    userRole: rawChat.profile.userRoleCode ?? rawChat.userRoleCode ?? null,
    content: rawChat.content,
    emojis: rawChat.emojis ?? {},
    messageTime: rawChat.messageTime,
    eventSentAt: rawChat.eventSentAt ?? null,
  };
}

function toDonation(rawDonation: RawDonationEvent): Donation {
  const payAmount = String(rawDonation.payAmount);
  const payAmountNumber = Number(payAmount);
  return {
    donationType: rawDonation.donationType,
    channelId: rawDonation.channelId,
    donatorChannelId: rawDonation.donatorChannelId,
    donatorNickname: rawDonation.donatorNickname,
    payAmount,
    payAmountNumber: Number.isFinite(payAmountNumber) ? payAmountNumber : null,
    donationText: rawDonation.donationText ?? '',
    emojis: rawDonation.emojis ?? {},
  };
}

function toSubscription(rawSubscription: RawSubscriptionEvent): SubscriptionEvent {
  return {
    channelId: rawSubscription.channelId,
    subscriberChannelId: rawSubscription.subscriberChannelId,
    subscriberNickname: rawSubscription.subscriberNickname,
    tierNo: rawSubscription.tierNo,
    tierName: rawSubscription.tierName ?? null,
    month: rawSubscription.month,
  };
}

function toSystemEvent(rawSystem: RawSystem): SystemEvent {
  const data = (rawSystem.data ?? {}) as Record<string, unknown>;
  switch (rawSystem.type) {
    case 'connected':
      return {
        type: 'connected',
        sessionKey: typeof data.sessionKey === 'string' ? data.sessionKey : '',
      };
    case 'subscribed':
    case 'unsubscribed':
    case 'revoked':
      return {
        type: rawSystem.type,
        eventType: typeof data.eventType === 'string' ? data.eventType : '',
        channelId: typeof data.channelId === 'string' ? data.channelId : '',
      };
    default:
      return { type: 'unknown', systemType: rawSystem.type, data: rawSystem.data };
  }
}

/**
 * 뱃지·권한 파생: 채팅 작성자의 역할을 3단계로 요약한다.
 *
 * 실측 확정된 `userRole`(profile.userRoleCode)을 1차 기준으로 쓰고,
 * 없을 때만 레거시 방식(뱃지 이미지 URL 추론)으로 폴백한다.
 */
export function getChatRole(message: Pick<ChatMessage, 'userRole' | 'badges'>): ChatRole {
  switch (message.userRole) {
    case 'streamer':
      return 'STREAMER';
    case 'streaming_channel_manager':
    case 'streaming_chat_manager':
      return 'MANAGER';
    case 'common_user':
      return 'VIEWER';
    default:
      break;
  }
  // 폴백: 레거시 뱃지 URL 추론
  if (message.badges.some((badge) => badge.imageUrl.endsWith('streamer.png'))) {
    return 'STREAMER';
  }
  if (message.badges.some((badge) => badge.imageUrl.endsWith('manager.png'))) {
    return 'MANAGER';
  }
  return 'VIEWER';
}
