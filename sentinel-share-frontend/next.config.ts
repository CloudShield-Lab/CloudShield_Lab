import type { NextConfig } from 'next';

const isStaticExport = process.env.STATIC_EXPORT === 'true';

const nextConfig: NextConfig = {
  // S3 정적 배포 시: STATIC_EXPORT=true npm run build
  // EC2 서버 실행 시: 설정 없음 (동적 라우트 정상 동작)
  ...(isStaticExport && { output: 'export', trailingSlash: true }),
  // Note: headers()는 static export 시 무시됨 — CloudFront Response Headers Policy로 적용
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
