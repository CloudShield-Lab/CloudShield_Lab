'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SCENARIOS = [
  'Origin 직접 접근 차단',
  'HTTP 헤더 스캔',
  '비정상 봇 스캔',
  'SQLi / XSS 차단',
  '브루트포스 로그인',
  'S3 데이터 탈취 체인',
];

const workspaceTabs = [
  {
    href: '/manual',
    badge: 'MANUAL',
    title: '수동 배포',
    titleTone: 'text-sky-900',
    description:
      'Infrastructure Guide를 따라 AWS 환경을 직접 구축하고, 구축이 끝난 뒤 Attack Simulator로 동일한 공격 시나리오를 비교합니다.',
    points: ['Infrastructure Guide 기반 실습', '직접 구성한 환경 검증', 'Attack Simulator 연계'],
    accent: 'border-sky-200 bg-sky-50/70 hover:border-sky-300',
    badgeTone: 'border-sky-200 bg-white text-sky-700',
  },
  {
    href: '/auto',
    badge: 'AUTO',
    title: '자동 배포',
    titleTone: 'text-violet-900',
    description:
      'Terraform을 통해 AWS 환경을 자동으로 배포하거나 삭제하고, 이후 Attack Simulator에서 같은 공격 흐름을 비교합니다.',
    points: ['Terraform 기반 자동 구축', '배포/삭제 상태 확인', 'Attack Simulator 연계'],
    accent:
      'border-violet-200 bg-[linear-gradient(135deg,rgba(245,243,255,0.82),rgba(240,249,255,0.9))] hover:border-violet-300',
    badgeTone: 'border-violet-200 bg-white text-violet-700',
  },
] as const;

function useTypewriter(
  words: string[],
  typingSpeed = 75,
  deletingSpeed = 35,
  pauseMs = 1600,
) {
  const [displayed, setDisplayed] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing');

  useEffect(() => {
    const word = words[wordIndex];
    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'typing') {
      if (displayed.length < word.length) {
        timer = setTimeout(
          () => setDisplayed(word.slice(0, displayed.length + 1)),
          typingSpeed,
        );
      } else {
        timer = setTimeout(() => setPhase('pausing'), pauseMs);
      }
    } else if (phase === 'pausing') {
      timer = setTimeout(() => setPhase('deleting'), 100);
    } else {
      if (displayed.length > 0) {
        timer = setTimeout(() => setDisplayed((d) => d.slice(0, -1)), deletingSpeed);
      } else {
        setWordIndex((i) => (i + 1) % words.length);
        setPhase('typing');
      }
    }

    return () => clearTimeout(timer);
  }, [displayed, phase, wordIndex, words, typingSpeed, deletingSpeed, pauseMs]);

  return displayed;
}

export function LandingClient() {
  const scenario = useTypewriter(SCENARIOS);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:py-14">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(125,211,252,0.14),_transparent_20%),radial-gradient(circle_at_82%_18%,_rgba(168,85,247,0.16),_transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-10">
        {/* Animated grid overlay */}
        <div className="hero-grid pointer-events-none absolute inset-0 opacity-80" />

        <div className="relative mx-auto max-w-4xl text-center">
          <span className="rounded-full border border-slate-200 bg-white px-4 py-1.5 font-mono text-[11px] tracking-[0.24em] text-slate-600">
            CLOUDSHIELD LAB
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            AWS 보안 아키텍처 차이를
            <br />
            공격 흐름으로 비교하는 실습 대시보드
          </h1>

          {/* Typewriter scenario ticker */}
          <div className="mt-5 flex items-center justify-center gap-2 font-mono text-sm">
            <span className="text-slate-400 tracking-wide">시뮬레이션 시나리오</span>
            <span className="text-slate-300">›</span>
            <span className="inline-flex items-center gap-px text-sky-600 font-medium min-w-[11rem] text-left">
              {scenario}
              <span
                className="ml-0.5 inline-block h-[1em] w-[2px] bg-sky-500 align-middle"
                style={{ animation: 'blink 1s step-end infinite' }}
              />
            </span>
          </div>

          <p className="mt-5 text-base font-semibold leading-7 text-slate-500/80 sm:text-lg">
            이 프로젝트는 동일한 공격이 취약 환경과 보호된 AWS 환경에서 어떻게 다르게
            처리되는지 시각적으로 보여주는 실습용 대시보드입니다. 먼저 환경을 준비한 뒤
            Attack Simulator에서 Origin 직접 접근 차단, HTTP 헤더 스캔, 비정상 봇 스캔,
            SQLi/XSS 패턴 요청, 브루트포스 로그인, S3 데이터 탈취 체인 시나리오를
            비교할 수 있습니다.
          </p>
        </div>
      </section>

      {/* Cards Section */}
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-semibold text-slate-950">시작 방식 선택</h2>
          <p className="mt-2 text-sm text-slate-600">
            아래 두 방식 중 하나를 선택하면 각각 수동 배포 화면 또는 자동 배포 화면으로
            바로 이동합니다.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {workspaceTabs.map((tab, i) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group rounded-[1.75rem] border p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition-all ${tab.accent}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span
                    className={`rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.2em] ${tab.badgeTone}`}
                  >
                    {tab.badge}
                  </span>
                  <h3 className={`mt-4 text-2xl font-semibold ${tab.titleTone}`}>
                    {tab.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{tab.description}</p>
                </div>
                <span className="text-2xl text-slate-400 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>

              <div className="mt-6 grid gap-2">
                {tab.points.map((point) => (
                  <div
                    key={point}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800"
                  >
                    {point}
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
