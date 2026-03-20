import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type { AnalysisSession, SessionMeta, WorkspaceMode } from '@/types';

const BUCKET = process.env.ANALYSIS_S3_BUCKET || 'sentinelshare-terraform-state-833453046706-ap-northeast-2-an';
const PREFIX = process.env.ANALYSIS_S3_PREFIX || 'analysis-sessions';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';

function getClient() {
  return new S3Client({ region: REGION });
}

export async function saveSession(session: AnalysisSession): Promise<string> {
  const client = getClient();
  const key = `${PREFIX}/${session.mode}/${session.scenario}/${session.sessionId}.json`;

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(session),
      ContentType: 'application/json',
      Metadata: {
        scenarioTitle: encodeURIComponent(session.scenarioTitle),
        timestamp: session.timestamp,
      },
    }),
  );

  return key;
}

export async function listSessions(mode?: WorkspaceMode, limit = 50): Promise<SessionMeta[]> {
  const client = getClient();
  const prefix = mode ? `${PREFIX}/${mode}/` : `${PREFIX}/`;

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: 200,
    }),
  );

  const objects = (response.Contents ?? [])
    .filter((obj) => obj.Key?.endsWith('.json'))
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
    .slice(0, limit);

  const metas: SessionMeta[] = [];
  for (const obj of objects) {
    if (!obj.Key) continue;
    // key format: analysis-sessions/{mode}/{scenario}/{sessionId}.json
    const parts = obj.Key.split('/');
    if (parts.length < 4) continue;
    const sessionMode = parts[1];
    const scenario = parts[2];
    const sessionId = parts[3].replace('.json', '');

    metas.push({
      sessionId,
      timestamp: obj.LastModified?.toISOString() ?? new Date().toISOString(),
      scenario,
      scenarioTitle: scenario,
      mode: sessionMode,
      s3Key: obj.Key,
    });
  }

  return metas;
}

export async function getSessionByKey(s3Key: string): Promise<AnalysisSession | null> {
  const client = getClient();
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as AnalysisSession;
  } catch {
    return null;
  }
}

export async function deleteSession(s3Key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
}

export async function deleteSessions(s3Keys: string[]): Promise<void> {
  if (s3Keys.length === 0) return;
  const client = getClient();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: s3Keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
}

export async function getSessionById(sessionId: string): Promise<AnalysisSession | null> {
  const metas = await listSessions(undefined, 200);
  const meta = metas.find((m) => m.sessionId === sessionId);
  if (!meta) return null;
  return getSessionByKey(meta.s3Key);
}
