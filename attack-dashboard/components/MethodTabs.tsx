'use client';

import { createContext, useContext, useState } from 'react';

type Method = 'cli' | 'console' | 'pdf';

const methodLabels: Record<Method, string> = {
  cli: 'CLI',
  console: 'AWS Console',
  pdf: 'PDF',
};

const MethodContext = createContext<{
  method: Method;
  methods: Method[];
  setMethod: (m: Method) => void;
}>({
  method: 'cli',
  methods: ['cli', 'console'],
  setMethod: () => {},
});

export function MethodProvider({
  children,
  methods = ['cli', 'console'],
  defaultMethod,
}: {
  children: React.ReactNode;
  methods?: Method[];
  defaultMethod?: Method;
}) {
  const initialMethod =
    defaultMethod && methods.includes(defaultMethod) ? defaultMethod : methods[0] ?? 'cli';
  const [method, setMethod] = useState<Method>(initialMethod);

  return (
    <MethodContext.Provider value={{ method, methods, setMethod }}>
      {children}
    </MethodContext.Provider>
  );
}

export function MethodToggle() {
  const { method, methods, setMethod } = useContext(MethodContext);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-slate-500">가이드 방식</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {methods.map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`rounded-md px-4 py-1.5 text-sm font-mono transition-colors ${
              method === m
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {methodLabels[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MethodView({
  methods,
  children,
}: {
  methods: Method[];
  children: React.ReactNode;
}) {
  const { method } = useContext(MethodContext);
  if (!methods.includes(method)) return null;
  return <>{children}</>;
}

export function CliContent({ children }: { children: React.ReactNode }) {
  const { method } = useContext(MethodContext);
  if (method !== 'cli') return null;
  return <>{children}</>;
}

export function ConsoleContent({ children }: { children?: React.ReactNode }) {
  const { method } = useContext(MethodContext);
  if (method !== 'console') return null;
  return children ? (
    <>{children}</>
  ) : (
    <div className="rounded-lg border border-dashed border-slate-300 px-5 py-4 text-sm italic text-slate-500">
      AWS Console 가이드는 콘솔에서 직접 클릭하는 부분이 있어 작성이 필요한 경우 이 영역을 업데이트하면 됩니다.
    </div>
  );
}

export function PdfContent({ children }: { children: React.ReactNode }) {
  const { method } = useContext(MethodContext);
  if (method !== 'pdf') return null;
  return <>{children}</>;
}
