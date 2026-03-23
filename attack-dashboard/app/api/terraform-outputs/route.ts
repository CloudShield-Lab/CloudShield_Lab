import { getTerraformOutputs, invalidateTerraformCache } from '@/lib/terraform-state';

export const dynamic = 'force-dynamic';

/** GET: 현재 tfstate 출력값 반환 */
export async function GET() {
  const outputs = await getTerraformOutputs();
  return Response.json(outputs);
}

/** POST: 캐시 무효화 후 최신 값 반환 (배포 완료 후 호출) */
export async function POST() {
  invalidateTerraformCache();
  const outputs = await getTerraformOutputs();
  return Response.json(outputs);
}
