import SharedClient from './SharedClient';

// token은 빌드 시 알 수 없으므로 빈 배열 반환
// S3 배포 시 CloudFront Custom Error Response (404 → /index.html) 로 처리
export function generateStaticParams() {
  return [];
}

export default function SharedFilePage() {
  return <SharedClient />;
}
