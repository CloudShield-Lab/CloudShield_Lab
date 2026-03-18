import { getTerraformOutputs } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  // auto 필드: env var 우선, 없으면 tfstate에서 자동 읽기
  const autoVulnUrl = process.env.AUTO_VULNERABLE_API_URL || '';
  const autoAwsUrl = process.env.AUTO_AWS_API_URL || '';
  const needsTfLookup = !autoVulnUrl || !autoAwsUrl;

  let tfOutputs = needsTfLookup ? await getTerraformOutputs() : null;

  const vulnUrl = autoVulnUrl || tfOutputs?.vulnerable?.backendUrl || '';
  const vulnFrontendUrl =
    process.env.AUTO_VULNERABLE_FRONTEND_URL ||
    tfOutputs?.vulnerable?.frontendUrl ||
    '';
  const vulnS3Bucket =
    process.env.AUTO_VULNERABLE_S3_BUCKET ||
    tfOutputs?.vulnerable?.filesBucket ||
    '';

  const awsUrl = autoAwsUrl || tfOutputs?.secure?.backendUrl || '';
  const awsS3Bucket =
    process.env.AUTO_AWS_S3_BUCKET ||
    tfOutputs?.secure?.filesBucket ||
    '';

  return Response.json({
    vulnerable: {
      url: process.env.VULNERABLE_API_URL || 'http://localhost:3000',
      frontendUrl: process.env.VULNERABLE_FRONTEND_URL || 'http://localhost:3001',
      s3Url: process.env.LOCALSTACK_URL || 'http://localhost:4566',
      s3Bucket: process.env.VULNERABLE_S3_BUCKET || 'sentinelshare-local',
      configured: true,
    },
    aws: {
      url: process.env.AWS_API_URL || '',
      s3Bucket: process.env.AWS_S3_BUCKET || '',
      region: process.env.AWS_REGION || 'ap-northeast-2',
      configured: !!(process.env.AWS_API_URL),
    },
    autoVulnerable: {
      url: vulnUrl,
      frontendUrl: vulnFrontendUrl,
      s3Bucket: vulnS3Bucket,
      configured: !!vulnUrl,
    },
    autoAws: {
      url: awsUrl,
      s3Bucket: awsS3Bucket,
      region: process.env.AWS_REGION || 'ap-northeast-2',
      configured: !!awsUrl,
    },
  });
}
