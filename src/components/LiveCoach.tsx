'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { LiveSnapshot, LiveTextCheck, TextCheck, WordTajweed } from '@/lib/types';
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
  if (status === 'read') return 'border-line bg-ink-850/70 text-slate-200';
  // لم يصل إليها القارئ بعد: باهتةٌ حتى يبلغها صوتُه
  return 'border-line/50 bg-ink-850/30 text-slate-500 opacity-45';
}

/** أبرز أحكام الكلمة (للعرض تحتها) */
function mainRule(tj: WordTajweed | undefined): string | null {
  if (!tj) return null;
  return tj.maddType ?? tj.ghunnaType ?? null;
}

/**
 * خطّ الزمن تحت الكلمة: المنطقة الخضراء أوجهُها الجائزة، والشريط زمنُ صوتك فيها —
 * للجارية يمتدّ مع صوتك، وللمحكوم عليها ما قِيس منها.
 */
function WordLine({ ms, minMs, maxMs, tone }: { ms: number; minMs: number; maxMs: number; tone: 'live' | 'ok' | 'warn' | 'bad' }) {
  const end = Math.max(maxMs * 1.3, minMs * 1.5, 200);
  const pct = (v: number) => Math.min(100, Math.max(0, (100 * v) / end));
  const bar =
    tone === 'ok' ? 'bg-mint-500' : tone === 'warn' ? 'bg-warn-500' : tone === 'bad' ? 'bg-danger-500' : 'bg-gradient-to-l from-gold-500 to-mint-500';
  return (
    <span className="relative mt-1 block h-1 w-full overflow-hidden rounded-full bg-ink-700/80" aria-hidden>
      <span
        className="absolute inset-y-0 bg-mint-500/30"
        style={{ insetInlineStart: `${pct(minMs)}%`, width: `${Math.max(2, pct(maxMs) - pct(minMs))}%` }}
      />
      <span className={`absolute inset-y-0 start-0 rounded-full transition-[width] duration-100 ${bar}`} style={{ width: `${pct(ms)}%` }} />
    </span>
  );
}

/** الأحكام الزمنية في الكلمة، كل حكم بخط مستقل يمتلئ بالتتابع من صوت القارئ. */
function TimedRuleLines({ tj, elapsedMs }: { tj: WordTajweed; elapsedMs: number }) {
  const timed = tj.rules
    .filter((r) => /مد|غن|صلة|لين/.test(r.label))
    .map((r) => ({
      ...r,
      harakat: /غن/.test(r.label) ? 2 : /لازم/.test(r.label) ? 6 : /متصل|منفصل|كبرى/.test(r.label) ? 4 : /لين/.test(r.label) ? 4 : 2,
    }));
  if (!timed.length) return null;
  const sum = timed.reduce((n, r) => n + r.harakat, 0);
  let before = 0;
  return (
    <div className="mt-2.5 space-y-1.5" aria-label="تقدّم أحكام الكلمة">
      {timed.map((r, i) => {
        const duration = (tj.expectedMs * r.harakat) / Math.max(1, sum);
        const fill = Math.max(0, Math.min(100, (100 * (elapsedMs - before)) / Math.max(1, duration)));
        before += duration;
        return (
          <div key={`${r.label}-${i}`} className="grid grid-cols-[minmax(6rem,auto)_1fr_auto] items-center gap-2 text-[9px]">
            <span className="truncate text-gold-200">{r.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-ink-700/80">
              <span className="block h-full rounded-full bg-gradient-to-l from-gold-500 to-mint-500 transition-[width] duration-100" style={{ width: `${fill}%` }} />
            </span>
            <span className="text-slate-500">{r.harakat} ح</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * المرافقة الحية — تُعرض أثناء التسجيل: تُضاء الكلمة الجارية مع حكمها المتوقَّع
 * وزمنها، وتُحكم كل كلمة لحظة انتهائها، ويظهر تنبيه فوري عند أي مخالفة
 * (مدّ/غنّة ناقصة أو زائدة أو كلمة لم تُسمع) مع اهتزاز ونغمة خفيفة.
 */
/**
 * شريط التحقّق من النصّ: أثناء التسجيل من السماع اللحظي، وبعد الإيقاف من
 * التحليل الكامل — فالمرافقة الحية لا «تمرّ» إلا إن كان المقروء هذه الآية.
 */
function TextVerdict({
  live,
  finalText,
  finalKind = null,
  finalOther = null,
  finished,
  frozen,
  refining,
  modelReady,
}: {
  live: LiveTextCheck | null;
  finalText: TextCheck | null;
  finalKind?: LiveTextCheck['kind'] | null;
  finalOther?: string | null;
  finished: boolean;
  frozen: boolean;
  refining: boolean;
  modelReady: boolean;
}) {
  let tone: 'ok' | 'warn' | 'bad' | 'muted' = 'muted';
  let text: ReactNode = null;
  const otherRef = live?.kind === 'quran' && live.otherLabel ? ` — بل ${live.otherLabel}` : '';
  if (frozen) {
    tone = 'bad';
    text =
      live?.kind === 'speech'
        ? 'المقروء كلامٌ عاديٌّ ليس من القرآن — جُمِّدت المرافقة. أوقف التسجيل واقرأ الآية المختارة.'
        : `المقروء ليس نصَّ هذه الآية${otherRef} — جُمِّدت المرافقة. أوقف التسجيل، ثم اقرأ الآية المختارة (أو اختر الآية التي تقرؤها).`;
  } else if (finished) {
    if (finalText === 'ok') {
      tone = 'ok';
      text = 'تحقّق السماع الذكي: ما قرأته هو نصّ هذه الآية.';
    } else if (finalText === 'mismatch') {
      tone = 'bad';
      text =
        finalKind === 'speech'
          ? 'لم تُعتمد المرافقة الحية: ما قُرئ كلامٌ عاديٌّ ليس من القرآن (انظر تبويب النتيجة).'
          : finalKind === 'quran' && finalOther
            ? `لم تُعتمد المرافقة الحية: ما قُرئ آيةٌ أخرى (${finalOther}) — انظر تبويب النتيجة.`
            : 'لم تُعتمد المرافقة الحية: ما قُرئ ليس نصَّ هذه الآية (انظر تبويب النتيجة).';
    } else if (finalText === 'weak') {
      tone = 'bad';
      text =
        finalKind === 'quran' && finalOther
          ? `لم تُعتمد المرافقة الحية: المسموع يُشبه آيةً أخرى (${finalOther}) أكثر من الآية المختارة — انظر النتيجة.`
          : 'لم تُعتمد المرافقة الحية: لم يتبيّن نصّ الآية كاملًا في المسموع (كلمةٌ مبدَّلة أو ناقصة — انظر النتيجة).';
    } else if (refining) {
      tone = 'muted';
      text = 'جارٍ التحقّق من النصّ بالسماع الذكي… تُعتمد الجلسة بعده.';
    } else if (finalText === 'unverified' || !modelReady) {
      tone = 'warn';
      text = 'لم يُتحقَّق من النصّ بعد — لا تُعتمد الجلسة حتى يتحقّق السماع الذكي من أنّ المقروء هو الآية.';
    } else {
      tone = 'muted';
      text = 'بانتظار التحليل الكامل…';
    }
  } else if (live) {
    switch (live.status) {
      case 'off':
        tone = 'muted';
        text = modelReady ? 'التحقّق من النصّ بعد الإيقاف.' : 'السماع الذكي غير جاهز بعد — يُتحقَّق من النصّ بعد الإيقاف.';
        break;
      case 'checking':
        tone = 'muted';
        text = 'يُستمع إلى ما تقرأ للتحقّق من أنه نصّ الآية…';
        break;
      case 'same':
        tone = 'ok';
        text = `ما تقرؤه من هذه الآية ✓ (${live.heard} كلمة سُمعت)`;
        break;
      case 'unsure':
        tone = 'muted';
        text = 'السماع غير واضح — اقرأ بوضوحٍ وقربٍ من الميكروفون.';
        break;
      case 'warn':
        tone = 'warn';
        text =
          live.kind === 'quran'
            ? `ما يُسمع يُشبه آيةً أخرى${otherRef} — تأكّد أنك تقرأ الآية المختارة.`
            : live.kind === 'speech'
              ? 'ما يُسمع لا يشبه نصَّ الآية ولا القرآن — تأكّد أنك تقرأ الآية الصحيحة.'
              : 'ما يُسمع لا يشبه نصَّ الآية المختارة — تأكّد أنك تقرأ الآية الصحيحة.';
        break;
      case 'other':
        tone = 'bad';
        text =
          live.kind === 'speech'
            ? 'المقروء كلامٌ عاديٌّ ليس من القرآن — جُمِّدت المرافقة.'
            : `المقروء ليس نصَّ هذه الآية${otherRef} — جُمِّدت المرافقة.`;
        break;
    }
  }
  if (!text) return null;
  const cls =
    tone === 'ok'
      ? 'border-mint-500/50 bg-mint-500/10 text-mint-200'
      : tone === 'warn'
        ? 'border-warn-500/60 bg-warn-500/10 text-warn-200'
        : tone === 'bad'
          ? 'border-danger-500/60 bg-danger-500/10 text-danger-200 pulse-miss'
          : 'border-line/70 bg-ink-850/40 text-slate-400';
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${cls}`}>
      <span aria-hidden className="mt-0.5 shrink-0">
        {tone === 'ok' ? '✓' : tone === 'bad' ? '✗' : tone === 'warn' ? '⚠' : '🎧'}
      </span>
      <span className="min-w-0">
        {text}
        {live?.text && !finished && live.status !== 'off' && live.status !== 'checking' ? (
          <span className="mt-0.5 block truncate font-quran text-[13px] text-slate-500" title={live.text}>
            سُمع{live.source === 'browser' ? ' بتعرّف المتصفح' : ''}: {live.text}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default function LiveCoach({
  snapshot,
  words,
  tjs,
  recording,
  alertOn,
  onToggleAlerts,
  textCheck = null,
  finalText = null,
  finalKind = null,
  finalOther = null,
  refining = false,
  modelReady = false,
  className = 'mt-4',
}: {
  snapshot: LiveSnapshot | null;
  words: { word: string; ayah: number }[];
  tjs: WordTajweed[];
  recording: boolean;
  alertOn: boolean;
  onToggleAlerts: () => void;
  /** التحقّق اللحظي من النصّ أثناء التسجيل */
  textCheck?: LiveTextCheck | null;
  /** حكم النصّ من التحليل الكامل لهذه الجلسة (بعد الإيقاف) */
  finalText?: TextCheck | null;
  finalKind?: LiveTextCheck['kind'] | null;
  finalOther?: string | null;
  refining?: boolean;
  modelReady?: boolean;
  /** هوامش اللوحة — تختلف حين تعلو زرَّ الميكروفون */
  className?: string;
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
  // المدّ اللازم: يُتسامح في مطّه فوق الستّ (كما يفعل القرّاء المعتمدون) — فلا «تجاوزتَ» قبله
  const stretchMs = Math.max(snapshot.currentStretchMs || 0, maxMs);
  const barEnd = Math.max(stretchMs * 1.1, maxMs * 1.18, expMs * 1.35, 240);
  const barPct = expMs ? Math.min(100, Math.round((100 * snapshot.currentVoicedMs) / barEnd)) : 0;
  const zoneFrom = expMs ? Math.min(99, Math.round((100 * minMs) / barEnd)) : 0;
  const zoneTo = expMs ? Math.min(100, Math.round((100 * maxMs) / barEnd)) : 0;
  const over = expMs > 0 && snapshot.currentVoicedMs > stretchMs * 1.12;
  const ranged = maxMs > minMs * 1.12;

  const alert = snapshot.lastAlert;
  const alertFresh = !snapshot.finished && alert && Date.now() - alert.at < 4500 ? alert : null;

  return (
    <div className={`rounded-2xl border border-line/80 bg-ink-900/60 p-4 ${className}`}>
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

      <TextVerdict
        live={textCheck}
        finalText={finalText}
        finalKind={finalKind}
        finalOther={finalOther}
        finished={snapshot.finished}
        frozen={snapshot.frozen}
        refining={refining}
        modelReady={modelReady}
      />

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
              <TimedRuleLines tj={curTj} elapsedMs={snapshot.currentVoicedMs} />
              <div className="mt-2"><RuleBadges rules={curTj.rules} max={4} /></div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-line/80 bg-ink-850/40 px-3.5 py-3 text-center text-[11px] text-slate-400">
          {snapshot.finished
            ? (() => {
                if (snapshot.frozen) return 'أُوقفت المرافقة الحية: المقروء لم يكن نصَّ هذه الآية — فلا تُحتسب هذه الجلسة.';
                const heard = snapshot.words.filter((w) => w.status !== 'pending' && w.status !== 'silent').length;
                const unheard = snapshot.words.filter((w) => w.status === 'silent').length;
                const timing = snapshot.violations - unheard;
                return `انتهت الجلسة الحية — سُمعت ${heard} من ${n} كلمة${unheard ? `، و${unheard} لم تُسمع` : ''}${
                  timing > 0 ? `، و${timing} مخالفة زمنية لحظية` : ''
                }. التحليل الكامل في تبويب النتيجة.`;
              })()
            : snapshot.frozen
              ? 'جُمِّدت المرافقة — أوقف التسجيل.'
              : snapshot.inPrefix
                ? 'تقرأ البسملة (ليست من الآية ولا تُحسب) — ثم تبدأ الآية.'
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
      <div className="mt-3 flex max-h-[220px] flex-wrap items-start gap-1.5 overflow-y-auto">
        {(() => {
          const focus = inWord || upcomingIdx >= 0 ? Math.max(0, cur) : 0;
          const from = n > MAX_CHIPS ? Math.max(0, Math.min(n - MAX_CHIPS, focus - Math.floor(MAX_CHIPS / 3))) : 0;
          const to = Math.min(n, from + MAX_CHIPS);
          const chips: ReactNode[] = [];
          for (let i = from; i < to; i++) {
            const sw = snapshot.words[i];
            const st = sw?.status ?? 'pending';
            const isCur = i === cur && inWord;
            const judged = st === 'ok' || st === 'excellent' || st === 'short' || st === 'long' || st === 'silent';
            const rule = mainRule(tjs[i]);
            const minW = sw?.minMs ?? tjs[i]?.minMs ?? 0;
            const maxW = sw?.maxMs ?? tjs[i]?.maxMs ?? 0;
            chips.push(
              <span
                key={i}
                ref={isCur ? curRef : undefined}
                className={`inline-flex min-w-[3.2rem] flex-col items-stretch rounded-lg border px-2.5 pb-1 pt-1.5 transition ${chipClass(isCur ? 'current' : st)}`}
              >
                <span className="text-center font-quran text-[17px] leading-none">{words[i].word}</span>
                {isCur ? (
                  <WordLine ms={snapshot.currentVoicedMs} minMs={minMs} maxMs={maxMs} tone="live" />
                ) : judged ? (
                  <WordLine
                    ms={sw?.measuredMs ?? 0}
                    minMs={minW}
                    maxMs={maxW}
                    tone={st === 'silent' ? 'bad' : st === 'short' || st === 'long' ? 'warn' : 'ok'}
                  />
                ) : null}
                {rule && (isCur || judged || st === 'read') ? (
                  <span className="mt-0.5 block text-center font-brand text-[8.5px] leading-tight text-gold-300/80">{rule}</span>
                ) : null}
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
