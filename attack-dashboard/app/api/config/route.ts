import { getTerraformOutputs } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

function buildOriginUrl(elasticIp?: string) {
  return elasticIp ? `http://${elasticIp}:3000` : '';
}

export async function GET() {
  // auto 필드: env var 우선, 없으면 tfstate에서 자동 읽기
  const autoVulnUrl = process.env.AUTO_VULNERABLE_API_URL || '';
  const autoAwsUrl = process.env.AUTO_AWS_API_URL || '';
  const autoVulnOriginUrl = process.env.AUTO_VULNERABLE_ORIGIN_API_URL || '';
  const autoAwsOriginUrl = process.env.AUTO_AWS_ORIGIN_API_URL || '';
  const needsTfLookup =
    !autoVulnUrl || !autoAwsUrl || !autoVulnOriginUrl || !autoAwsOriginUrl;

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
  const vulnOriginUrl =
    autoVulnOriginUrl ||
    buildOriginUrl(tfOutputs?.vulnerable?.elasticIp);

  const awsUrl = autoAwsUrl || tfOutputs?.secure?.backendUrl || '';
  const awsS3Bucket =
    process.env.AUTO_AWS_S3_BUCKET ||
    tfOutputs?.secure?.filesBucket ||
    '';
  const awsOriginUrl =
    autoAwsOriginUrl ||
    buildOriginUrl(tfOutputs?.secure?.elasticIp);

  return Response.json({
    vulnerable: {
      url: process.env.VULNERABLE_API_URL || 'http://localhost:3000',
      frontendUrl: process.env.VULNERABLE_FRONTEND_URL || 'http://localhost:3001',
      s3Url: process.env.LOCALSTACK_URL || 'http://localhost:4566',
      s3Bucket: process.env.VULNERABLE_S3_BUCKET || 'sentinelshare-local',
      originUrl:
        process.env.VULNERABLE_ORIGIN_API_URL ||
        process.env.VULNERABLE_API_URL ||
        'http://localhost:3000',
      originConfigured: true,
      configured: true,
    },
    aws: {
      url: process.env.AWS_API_URL || '',
      frontendUrl: process.env.AWS_FRONTEND_URL || '',
      s3Bucket: process.env.AWS_S3_BUCKET || '',
      region: process.env.AWS_REGION || 'ap-northeast-2',
      originUrl: process.env.AWS_ORIGIN_API_URL || '',
      originConfigured: !!process.env.AWS_ORIGIN_API_URL,
      configured: !!(process.env.AWS_API_URL),
    },
    autoVulnerable: {
      url: vulnUrl,
      frontendUrl: vulnFrontendUrl,
      s3Bucket: vulnS3Bucket,
      originUrl: vulnOriginUrl,
      originConfigured: !!vulnOriginUrl,
      configured: !!vulnUrl,
    },
    autoAws: {
      url: awsUrl,
      frontendUrl: process.env.AUTO_AWS_FRONTEND_URL || tfOutputs?.secure?.frontendUrl || '',
      s3Bucket: awsS3Bucket,
      region: process.env.AWS_REGION || 'ap-northeast-2',
      originUrl: awsOriginUrl,
      originConfigured: !!awsOriginUrl,
      configured: !!awsUrl,
    },
  });
}
