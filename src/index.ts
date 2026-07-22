/**
 * chzzk-open-sdk
 *
 * TypeScript SDK for the official CHZZK Open API (https://openapi.chzzk.naver.com).
 * Official endpoints only — no unofficial/internal APIs.
 */

export {
  ChzzkError,
  ChzzkValidationError,
  ChzzkNetworkError,
  ChzzkApiError,
  ChzzkAuthenticationError,
  ChzzkPermissionError,
  ChzzkRateLimitError,
  type ChzzkApiErrorDetails,
} from './errors.js';

export {
  HttpClient,
  DEFAULT_BASE_URL,
  type HttpClientOptions,
  type HttpRequestOptions,
  type HttpMethod,
  type QueryValue,
  type RetryOptions,
} from './http/client.js';

export { noopLogger, maskSecret, type ChzzkLogger } from './http/logger.js';

export { paginateByPage, paginateByCursor, type CursorPage } from './http/pagination.js';

export {
  InMemoryTokenStore,
  isTokenExpired,
  type ChzzkTokenSet,
  type TokenStore,
} from './auth/types.js';

export { bearerHeaders, clientHeaders } from './auth/headers.js';

export {
  ACCOUNT_INTERLOCK_URL,
  buildAuthorizationUrl,
  type AuthorizationUrlParams,
} from './auth/oauth.js';

export {
  AuthClient,
  type AuthClientOptions,
  type IssueTokenParams,
  type TokenTypeHint,
} from './auth/client.js';

export { TokenManager, ChzzkTokenRefreshError, type TokenManagerOptions } from './auth/manager.js';

export { ChzzkOpenClient, type ChzzkOpenClientOptions } from './client.js';

export { UserResource } from './resources/user.js';
export { ChannelResource } from './resources/channel.js';
export { CategoryResource, type CategorySearchParams } from './resources/category.js';
export { LiveResource, type LivesParams } from './resources/live.js';
export { ChatResource, type ChatNoticeParams } from './resources/chat.js';
export { DropsResource, type DropsRewardClaimsParams } from './resources/drops.js';
export type { ResourceDeps } from './resources/shared.js';

export { userMeSchema, type UserMe } from './types/user.js';

export {
  categorySchema,
  categoriesSearchResponseSchema,
  knownCategoryTypes,
  type Category,
  type CategoryType,
} from './types/category.js';

export {
  liveSchema,
  livesPageSchema,
  liveSettingSchema,
  streamKeySchema,
  type Live,
  type LivesPage,
  type LiveSetting,
  type LiveSettingPatch,
} from './types/live.js';

export {
  chatSendResultSchema,
  chatSettingsSchema,
  allowedMinFollowerMinutes,
  allowedChatSlowModeSecs,
  knownChatAvailableConditions,
  knownChatAvailableGroups,
  type ChatSendResult,
  type ChatSettings,
  type ChatSettingsUpdate,
  type ChatAvailableCondition,
  type ChatAvailableGroup,
  type BlindMessageParams,
} from './types/chat.js';

export {
  dropsRewardClaimSchema,
  dropsRewardClaimsPageSchema,
  dropsUpdateResultSchema,
  knownFulfillmentStates,
  knownRewardClaimUpdateStatuses,
  type DropsRewardClaim,
  type DropsRewardClaimsPage,
  type DropsUpdateResult,
  type FulfillmentState,
  type RewardClaimUpdateStatus,
} from './types/drops.js';

export {
  channelSchema,
  streamingRoleMemberSchema,
  followerSchema,
  followersPageSchema,
  subscriberSchema,
  subscribersPageSchema,
  knownStreamingRoles,
  type Channel,
  type StreamingRoleMember,
  type StreamingRole,
  type Follower,
  type FollowersPage,
  type Subscriber,
  type SubscribersPage,
  type SubscriberSort,
  type PageParams,
} from './types/channel.js';

export { parseLenient } from './http/parse.js';
