'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LiveSnapshot, WordTajweed } from '@/lib/types';
import { fmtSec } from '@/lib/util';
import RuleBadges from './RuleBadges';
import { Badge } from './ui';

/** أقصى كلمات معروضة دفعةً واحدة (نافذة متحرّكة للمقاطع الطويلة) */
const MAX_CHIPS = 90;

function chipClass(status: string): string {
  if (status === 'current') return 'live-word border-gold-500/70 bg-gold-500/15 text-gold-200 ring-1 ring-gold-400/60';
  if (status === 'excellent' || status === 'ok') return 'border-mint-500/50 bg-mint-500/10 text-slate-100';
  if (status === 'short' || status === 'long') return 'border-warn-500/60 bg-warn-500/15 text-warn-300 shake-error';
  if (status === 'silent') return 'border-danger-500/60 bg-danger-500/15 text-danger-300 pulse-miss';
  return 'border-line/70 bg-ink-850/50 text-slate-500';
}

/**
 * المرافقة الحية — تُعرض أثناء التسجيل: تُضاء الكلمة الجارية مع حكمها المتوقَّع
 * وزمنها، وتُحكم كل كلمة لحظة انتهائها، ويظهر تنبيه فوري عند أي مخالفة
 * (مدّ/غنّة ناقصة أو زائدة أو كلمة لم تُسمع) مع اهتزاز ونغمة خفيفة.
 */
export default function LiveCoach({
  snapshot,
  words,
  tjs,
  recording,
  alertOn,
  onToggleAlerts,
}: {
  snapshot: LiveSnapshot | null;
  words: { word: string; ayah: number }[];
  tjs: WordTajweed[];
  recording: boolean;
  alertOn: boolean;
  onToggleAlerts: () => void;
}) {
  const curRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [snapshot?.cursor]);

  if (!snapshot || !words.length) return null;

  const n = words.length;
  const inWord = snapshot.currentExpectedMs > 0; // كلمة تُقرأ الآن فعلًا
  const cur = snapshot.cursor >= 0 && snapshot.cursor < n ? snapshot.cursor : -1;
  const curWord = cur >= 0 ? words[cur] : null;
  const curTj = cur >= 0 ? tjs[cur] : null;
  // الكلمة «التالية» = الكلمة المنتظرة حين لا تُقرأ كلمةٌ الآن (المؤشّر عليها)
  const upcomingIdx = !inWord && snapshot.started && cur >= 0 && cur < n ? cur : -1;
  const upcomingWord = upcomingIdx >= 0 ? words[upcomingIdx] : null;
  const upcomingTj = upcomingIdx >= 0 ? tjs[upcomingIdx] : null;

  const livePct = snapshot.doneCount ? Math.round((100 * snapshot.okCount) / snapshot.doneCount) : null;
  // الشريط يُرسم إلى **نافذة الأوجه الجائزة**: منطقةٌ خضراء بين أدنى وجهٍ
  // جائز (القصر عند ورش مثلًا) وأعلاه (الإشباع)، فيرى القارئ متى يبلغ
  // المقدار ومتى يجاوزه، بدل علامةٍ واحدة لا تُرضي إلا وجهًا واحدًا.
  const expMs = snapshot.currentExpectedMs;
  const minMs = snapshot.currentMinMs || expMs;
  const maxMs = Math.max(snapshot.currentMaxMs || expMs, minMs);
  const barEnd = Math.max(maxMs * 1.18, expMs * 1.35, 240);
  const barPct = expMs ? Math.min(100, Math.round((100 * snapshot.currentVoicedMs) / barEnd)) : 0;
  const zoneFrom = expMs ? Math.min(99, Math.round((100 * minMs) / barEnd)) : 0;
  const zoneTo = expMs ? Math.min(100, Math.round((100 * maxMs) / barEnd)) : 0;
  const over = expMs > 0 && snapshot.currentVoicedMs > maxMs * 1.12;
  const ranged = maxMs > minMs * 1.12;

  const alert = snapshot.lastAlert;
  const alertFresh = !snapshot.finished && alert && Date.now() - alert.at < 4500 ? alert : null;

  return (
    <div className="mt-4 rounded-2xl border border-line/80 bg-ink-900/60 p-4">
      {/* الرأس: عنوان + عدّاد حي */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${recording ? 'live-dot bg-danger-500' : 'bg-slate-600'}`} />
          <h3 className="font-quran text-base text-gold-200">المرافقة الحية</h3>
          <span className="text-[10px] text-slate-500">تقدير لحظي أثناء القراءة — التحليل الدقيق بعد الإيقاف</span>
        </div>
        <div className="flex items-center gap-2">
          {livePct !== null ? (
            <Badge tone={livePct >= 70 ? 'mint' : livePct >= 45 ? 'warn' : 'danger'}>في المقدار {livePct}%</Badge>
          ) : null}
          <span className="font-brand text-[11px] text-slate-400">
            {snapshot.doneCount}/{n} كلمة
            {snapshot.violations ? <span className="ms-1.5 text-danger-300">· {snapshot.violations} مخالفة</span> : null}
            {snapshot.estimatedCount ? (
              <span className="ms-1.5 text-slate-500" title="كلمات تقدّم بها الضوء على تقدير النموذج لعدم ظهور حدٍّ مسموع">
                · {snapshot.estimatedCount} تقديرًا
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onToggleAlerts}
            title={alertOn ? 'التنبيه اللحظي عند المخالفة: مفعّل' : 'التنبيه اللحظي: متوقف'}
            className={`rounded-lg border px-2 py-1 text-[10px] transition ${
              alertOn ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-line bg-ink-900/60 text-slate-500'
            }`}
          >
            📳 تنبيه المخالفات
          </button>
        </div>
      </div>

      {/* الكلمة الجارية + التي تليها */}
      {inWord ? (
        <div className="mt-3 rounded-xl border border-gold-500/40 bg-ink-850/70 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400">الكلمة الجارية — احكُ لها زمنها</p>
              <p className="mt-0.5 font-quran text-3xl leading-snug text-gold-100">{curWord?.word}</p>
            </div>
            <div className="shrink-0 text-end font-brand text-[10px] leading-relaxed text-slate-400">
              <div dir="ltr">
                {fmtSec(snapshot.currentVoicedMs)} / {ranged ? `${fmtSec(minMs)}–${fmtSec(maxMs)}` : fmtSec(expMs)}
              </div>
              <div className={over ? 'text-warn-300' : 'text-mint-300'}>
                {over ? 'تجاوزتَ المقدار' : snapshot.currentVoicedMs >= minMs ? 'في المقدار' : 'أتمم المدّ'}
              </div>
              {snapshot.currentHarakat ? (
                <div className="text-[9px] text-gold-300/80">≈ {snapshot.currentHarakat} حركة</div>
              ) : null}
            </div>
          </div>
          {/* شريط الزمن الحي: المنطقة الجائزة ثم مؤشّر صوتك */}
          <div className="relative mt-2 h-2 overflow-visible rounded-full bg-ink-700/80">
            {expMs ? (
              <span
                className="absolute inset-y-0 rounded-full bg-mint-500/25 ring-1 ring-inset ring-mint-500/40"
                style={{ insetInlineStart: `${zoneFrom}%`, width: `${Math.max(1.5, zoneTo - zoneFrom)}%` }}
                title="الأوجه الجائزة في هذا الموضع"
              />
            ) : null}
            <div
              className={`relative h-full rounded-full transition-[width] duration-100 ${
                over ? 'bg-warn-500' : 'bg-gradient-to-l from-gold-500 to-mint-500'
              }`}
              style={{ width: `${barPct}%` }}
            />
            {expMs ? (
              <span
                className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-gold-300"
                style={{ insetInlineStart: `${Math.min(100, Math.round((100 * expMs) / barEnd))}%` }}
                title="المقدار المختار (وسط الأوجه)"
              />
            ) : null}
          </div>
          {ranged ? (
            <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
              لهذا الموضع أوجهٌ جائزة بين {fmtSec(minMs)} و{fmtSec(maxMs)} — فأنت مصيبٌ بأيّها قرأت، والخطّ الذهبي أوسطها.
            </p>
          ) : null}
          {curTj ? (
            <div className="mt-2.5">
              <RuleBadges rules={curTj.rules} max={4} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-line/80 bg-ink-850/40 px-3.5 py-3 text-center text-[11px] text-slate-400">
          {snapshot.finished
            ? `انتهت الجلسة الحية — ${snapshot.doneCount} كلمة قُرئت و${snapshot.violations} مخالفة لحظية. التحليل الكامل في تبويب النتيجة.`
            : upcomingWord
              ? <>
                  الكلمة التالية: <span className="font-quran text-lg text-gold-200">{upcomingWord.word}</span>
                  {upcomingTj?.maddType || upcomingTj?.ghunnaType ? (
                    <span className="ms-1.5 text-[10px] text-gold-300">({upcomingTj.maddType ?? upcomingTj.ghunnaType})</span>
                  ) : null}
                </>
              : snapshot.started
                ? 'أكملت كلمات المقاطع — تابع ثم أوقف التسجيل.'
                : 'ابدأ التلاوة فتُضاء الكلمات مع صوتك كلمةً كلمة.'}
        </div>
      )}

      {/* الكلمات: تُضاء وتُحكم لحظيًا (نافذة متحرّكة للمقاطع الطويلة) */}
      <div className="mt-3 flex max-h-[168px] flex-wrap gap-1.5 overflow-y-auto">
        {(() => {
          const focus = inWord || upcomingIdx >= 0 ? Math.max(0, cur) : 0;
          const from = n > MAX_CHIPS ? Math.max(0, Math.min(n - MAX_CHIPS, focus - Math.floor(MAX_CHIPS / 3))) : 0;
          const to = Math.min(n, from + MAX_CHIPS);
          const chips: ReactNode[] = [];
          for (let i = from; i < to; i++) {
            const st = snapshot.words[i]?.status ?? 'pending';
            const isCur = i === cur && inWord;
            chips.push(
              <span
                key={i}
                ref={isCur ? curRef : undefined}
                className={`rounded-lg border px-2.5 py-1 font-quran text-[17px] leading-none transition ${chipClass(isCur ? 'current' : st)}`}
              >
                {words[i].word}
              </span>,
            );
          }
          return chips;
        })()}
      </div>

      {/* تنبيه المخالفة اللحظي */}
      {alertFresh ? (
        <div
          className={`mt-3 rounded-xl border p-3 ${
            alertFresh.tone === 'danger' ? 'border-danger-500/60 bg-danger-500/10 pulse-miss' : 'border-warn-500/60 bg-warn-500/10 shake-error'
          }`}
          role="alert"
        >
          <p className={`text-[12px] font-semibold ${alertFresh.tone === 'danger' ? 'text-danger-300' : 'text-warn-300'}`}>
            ⚠ {alertFresh.title} — «{alertFresh.word}»
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{alertFresh.action}</p>
        </div>
      ) : null}

      {/* تذكير عند صمتٍ طويل أثناء القراءة */}
      {!snapshot.finished && snapshot.started && snapshot.stalledMs > 2600 && !alertFresh ? (
        <p className="mt-3 rounded-xl border border-line/70 bg-ink-850/60 px-3 py-2 text-center text-[11px] text-slate-400">
          لم يُسمع صوتك منذ لحظة — تابع التلاوة أو أوقف التسجيل.
        </p>
      ) : null}
    </div>
  );
}
