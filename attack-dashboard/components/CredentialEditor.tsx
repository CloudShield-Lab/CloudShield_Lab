'use client';

import { useState } from 'react';
import type { Credential } from '@/lib/default-credentials';

interface Props {
  credentials: Credential[];
  onChange: (updated: Credential[]) => void;
  disabled: boolean;
}

export function CredentialEditor({ credentials, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const startEdit = (index: number) => {
    if (disabled) return;
    setEditingIndex(index);
    setEditEmail(credentials[index].email);
    setEditPassword(credentials[index].password);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const updated = credentials.map((c, i) =>
      i === editingIndex ? { email: editEmail, password: editPassword } : c,
    );
    onChange(updated);
    setEditingIndex(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditingIndex(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        <span>자격증명 목록 편집 ({credentials.length}쌍)</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200">
          <div className="overflow-y-auto" style={{ maxHeight: '18rem' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="w-10 px-3 py-2 text-left font-medium text-slate-500">#</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Password</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credentials.map((cred, i) => (
                  <tr
                    key={i}
                    className={`${i === 76 ? 'bg-red-50' : 'bg-white'} hover:bg-slate-50`}
                    onBlur={(e) => {
                      // 포커스가 같은 행 내부로 이동하면 편집 유지
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (editingIndex === i) commitEdit();
                    }}
                  >
                    <td className="px-3 py-1.5 font-mono text-slate-400">{i + 1}</td>
                    {editingIndex === i ? (
                      <>
                        <td className="px-2 py-1">
                          <input
                            autoFocus
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full rounded border border-blue-300 px-2 py-0.5 font-mono text-xs outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full rounded border border-blue-300 px-2 py-0.5 font-mono text-xs outline-none focus:border-blue-500"
                          />
                        </td>
                        <td />
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 font-mono text-slate-700">{cred.email}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-500">{cred.password}</td>
                        <td className="px-2 py-1.5">
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => startEdit(i)}
                              className="text-slate-300 hover:text-slate-600"
                              title="편집"
                            >
                              ✎
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
