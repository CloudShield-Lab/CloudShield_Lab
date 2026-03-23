import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'guides', 'aws-secure-guide.pdf');

  try {
    const file = await fs.readFile(filePath);

    return new Response(file, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="AWS_secure_guide.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Secure guide PDF not found', { status: 404 });
  }
}
