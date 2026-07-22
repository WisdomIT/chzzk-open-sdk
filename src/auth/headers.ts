/** Access Token 인증 헤더. https://chzzk.gitbook.io/chzzk/chzzk-api/tips#access-token-api */
export function bearerHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Client 인증 헤더. https://chzzk.gitbook.io/chzzk/chzzk-api/tips#client-api */
export function clientHeaders(clientId: string, clientSecret: string): Record<string, string> {
  return { 'Client-Id': clientId, 'Client-Secret': clientSecret };
}
