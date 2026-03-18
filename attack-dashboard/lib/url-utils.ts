/**
 * attack 라우트용 base URL 정규화.
 * NEXT_PUBLIC_API_URL 컨벤션에 따라 "/api" suffix가 포함된 URL이 들어올 수 있으므로 제거.
 * 예) "https://xxx.cloudfront.net/api" → "https://xxx.cloudfront.net"
 */
export function normalizeApiBaseUrl(url: string): string {
  return url.replace(/\/api\/?$/, '');
}
