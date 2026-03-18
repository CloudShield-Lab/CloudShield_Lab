import { CliContent, ConsoleContent } from '@/components/MethodTabs';

interface Props {
  step: number;
  title: string;
  children: React.ReactNode;
  warning?: string;
  note?: string;
  cliNote?: string;
  consoleNote?: string;
  done?: boolean;
}

export function StepCard({ step, title, children, warning, note, cliNote, consoleNote }: Props) {
  const warningItems = warning
    ? warning
        .split(/(?<=[.!?])\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const renderNote = (content: string) => (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <span className="mt-0.5 flex-shrink-0 text-slate-400">i</span>
      <span>{content}</span>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-mono font-bold text-slate-600">
          {step}
        </span>
        <h3 className="font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="space-y-4 px-6 py-5">
        {children}

        {cliNote && <CliContent>{renderNote(cliNote)}</CliContent>}
        {consoleNote && <ConsoleContent>{renderNote(consoleNote)}</ConsoleContent>}
        {!cliNote && !consoleNote && note && renderNote(note)}

        {warning && (
          <div className="space-y-3">
            {(warningItems.length > 0 ? warningItems : [warning]).map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
              >
                <span className="mt-0.5 flex-shrink-0">!</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
