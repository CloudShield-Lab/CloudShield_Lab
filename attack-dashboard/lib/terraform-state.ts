import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { normalizeApiBaseUrl } from './url-utils';

const STATE_BUCKET = 'sentinelshare-terraform-state-833453046706-ap-northeast-2-an';
const REGION = 'ap-northeast-2';

// 30초 캐시
let cache: { data: TerraformOutputs; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export type TerraformEnvOutputs = {
  backendUrl: string;
  frontendUrl: string;
  filesBucket: string;
  elasticIp: string;
};

export type TerraformOutputs = {
  vulnerable: TerraformEnvOutputs | null;
  secure: TerraformEnvOutputs | null;
};

async function readState(key: string): Promise<Record<string, { value: string }> | null> {
  try {
    const client = new S3Client({ region: REGION });
    const res = await client.send(
      new GetObjectCommand({ Bucket: STATE_BUCKET, Key: key }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const state = JSON.parse(body);
    return state?.outputs ?? null;
  } catch {
    return null;
  }
}

function parseVulnOutputs(outputs: Record<string, { value: string }>): TerraformEnvOutputs {
  return {
    backendUrl: normalizeApiBaseUrl(outputs.backend_url?.value ?? ''),
    frontendUrl: outputs.frontend_url?.value ?? '',
    filesBucket: outputs.files_bucket_name?.value ?? '',
    elasticIp: outputs.elastic_ip?.value ?? '',
  };
}

function parseSecureOutputs(outputs: Record<string, { value: string }>): TerraformEnvOutputs {
  return {
    backendUrl: normalizeApiBaseUrl(outputs.backend_url?.value ?? ''),
    frontendUrl: outputs.frontend_url?.value ?? '',
    filesBucket: outputs.files_bucket_name?.value ?? '',
    elasticIp: outputs.elastic_ip?.value ?? '',
  };
}

export async function getTerraformOutputs(): Promise<TerraformOutputs> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const [vulnOutputs, secureOutputs] = await Promise.all([
    readState('vulnerable/terraform.tfstate'),
    readState('secure/terraform.tfstate'),
  ]);

  const data: TerraformOutputs = {
    vulnerable: vulnOutputs ? parseVulnOutputs(vulnOutputs) : null,
    secure: secureOutputs ? parseSecureOutputs(secureOutputs) : null,
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

/** 캐시 강제 만료 (InfraControl 배포 완료 후 호출) */
export function invalidateTerraformCache() {
  cache = null;
}
