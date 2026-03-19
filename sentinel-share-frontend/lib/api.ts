import { getToken, clearSession } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type HttpMethod = 'GET' | 'POST' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  isFormData?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData = false } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (body && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData
        ? (body as FormData)
        : body
        ? JSON.stringify(body)
        : undefined,
    });
  } catch {
    throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
  }

  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`API 서버에 연결할 수 없습니다. (${res.status} ${res.statusText})`);
  }

  const data = await res.json();

  if (!res.ok) {
    const d = data as { error?: string; errors?: { msg: string }[] };
    const message = d.error ?? d.errors?.map((e) => e.msg).join(', ') ?? 'Request failed';
    if (res.status === 401) {
      clearSession();
      window.location.href = '/login';
    }
    throw new Error(message);
  }

  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      request<{ token: string; user: object }>('/auth/signup', {
        method: 'POST',
        body: { email, password },
      }),

    login: (email: string, password: string) =>
      request<{ token: string; user: object }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
  },

  files: {
    list: () =>
      request<{ files: import('../types').FileRecord[] }>('/files'),

    upload: (formData: FormData) =>
      request<{ file: import('../types').FileRecord }>('/files/upload', {
        method: 'POST',
        body: formData,
        isFormData: true,
      }),

    download: (id: string) =>
      request<import('../types').DownloadResponse>(`/files/${id}/download`),

    delete: (id: string) =>
      request<{ deleted: boolean }>(`/files/${id}`, { method: 'DELETE' }),

    share: (id: string, expiresInHours: number) =>
      request<{ shareLink: import('../types').ShareLink }>(`/files/${id}/share`, {
        method: 'POST',
        body: { expiresInHours },
      }),
  },

  shared: {
    download: (token: string) =>
      request<import('../types').DownloadResponse>(`/shared/${token}/download`),
  },
};
