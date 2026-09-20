'use client';

import { PASS_SCORE } from '@/lib/types';
import { useTahqiq } from '@/store';
import { Medallion, Panel } from './ui';

export default function ProgressPanel() {
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const progress = useTahqiq((s) => s.progress);
  const riwayah = useTahqiq((s) => s.riwayah);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const selectAyah = useTahqiq((s) => s.selectAyah);
  const setScope = useTahqiq((s) => s.setScope);
  const setActiveTab = useTahqiq((s) => s.setActiveTab);
  const surahId = useTahqiq((s) => s.selectedSurahId);

  if (!data) {
    return (
      <Panel title="تقدّم السورة" subtitle="اختر سورة من تبويب التمرين أولًا">
        <p className="py-10 text-center text-sm text-slate-400">لا سورة محدّدة بعد.</p>
      </Panel>
    );
  }

  const recs = progress[`${surahId}:${riwayah}`] ?? {};
  const total = data.meta.numberOfAyahs;
  const passed = data.ayahs.filter((a) => recs[a.numberInSurah]?.passed).length;
  const attempted = data.ayahs.filter((a) => recs[a.numberInSurah]).length;
  const avg = attempted
    ? Math.round(
        data.ayahs.reduce((s, a) => s + (recs[a.numberInSurah]?.bestScore ?? 0), 0) / attempted,
      )
    : 0;
  const done = passed >= total && total > 0;
  const pct = total ? Math.round((100 * passed) / total) : 0;

  return (
    <Panel
      title={`تقدّم ${data.meta.name}`}
      subtitle={
        riwayah === 'warsh'
          ? 'رواية ورش عن نافع — كل آية تُجتاز بدرجة ٧٠٪ فأعلى'
          : 'رواية حفص عن عاصم — كل آية تُجتاز بدرجة ٧٠٪ فأعلى'
      }
      className="fade-up"
    >
      {done ? (
        <div className="mb-4 rounded-2xl border border-mint-500/40 bg-mint-500/10 p-4 text-center">
          <p className="font-quran text-xl text-mint-300">أتممت السورة</p>
          <p className="mt-1 text-xs text-slate-400">كل آياتها اجتازت حدّ {PASS_SCORE}٪ — أحسنت.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-line bg-ink-850/70 p-3 text-center">
          <div className="text-[10px] text-slate-400">الآيات المُجتازة</div>
          <div className="mt-1 font-brand text-lg text-gold-300">
            {passed}/{total}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-ink-850/70 p-3 text-center">
          <div className="text-[10px] text-slate-400">نسبة الإتمام</div>
          <div className="mt-1 font-brand text-lg text-mint-300">{pct}%</div>
        </div>
        <div className="rounded-xl border border-line bg-ink-850/70 p-3 text-center">
          <div className="text-[10px] text-slate-400">متوسط أفضل درجة</div>
          <div className="mt-1 font-brand text-lg text-slate-200">{attempted ? `${avg}%` : '—'}</div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-gradient-to-l from-gold-500 to-mint-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-mint-500/80" /> مُجتازة
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warn-500/80" /> حاولتَ ولم تجتز
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-ink-700" /> لم تُقرأ
        </span>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {data.ayahs.map((a) => {
          const rec = recs[a.numberInSurah];
          const sel = a.numberInSurah === selectedAyah;
          const tone = rec?.passed
            ? 'border-mint-500/60 bg-mint-500/15 text-mint-200'
            : rec
              ? 'border-warn-500/50 bg-warn-500/10 text-warn-300'
              : 'border-line bg-ink-850/70 text-slate-400';
          return (
            <button
              key={a.numberInSurah}
              type="button"
              onClick={() => {
                selectAyah(a.numberInSurah);
                setScope('ayah');
                setActiveTab('practice');
              }}
              title={rec ? `أفضل درجة ${rec.bestScore}%` : 'لم تُقرأ بعد'}
              className={`relative rounded-lg border py-2 text-center font-brand text-xs transition ${tone} ${
                sel ? 'ring-2 ring-gold-400' : ''
              }`}
            >
              {a.numberInSurah}
              {rec ? <span className="mt-0.5 block text-[8px] opacity-80">{rec.bestScore}%</span> : null}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        اضغط أي آية للانتقال إليها والتدرّب عليها. حدّ الاجتياز {PASS_SCORE}٪ (حكم «جيد» فأعلى). لا تُمحى آية مُجتازة
        بمحاولة أضعف لاحقًا.
      </p>

      <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-ink-850/50 p-3">
        <Medallion n={data.id} size="md" active />
        <div>
          <p className="font-quran text-lg text-gold-200">{data.meta.name}</p>
          <p className="text-[11px] text-slate-500">
            {data.meta.revelationType === 'Meccan' ? 'مكيّة' : 'مدنيّة'} · {total} آية
          </p>
        </div>
      </div>
    </Panel>
  );
}
