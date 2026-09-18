'use client';

import { useMemo } from 'react';
import { buildTarget } from '@/lib/quran';
import { fmtSec } from '@/lib/util';
import { useTahqiq } from '@/store';
import { Medallion, Panel, statusCardClass } from './ui';

const MAX_CARDS = 160;

function cleanName(name: string): string {
  return name.replace(/^سُورَةُ\s*/, '');
}

export default function SurahBrowser() {
  const surahs = useTahqiq((s) => s.surahs);
  const surahsStatus = useTahqiq((s) => s.surahsStatus);
  const selectedSurahId = useTahqiq((s) => s.selectedSurahId);
  const selectSurah = useTahqiq((s) => s.selectSurah);
  const surahCache = useTahqiq((s) => s.surahCache);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const selectAyah = useTahqiq((s) => s.selectAyah);
  const scope = useTahqiq((s) => s.scope);
  const setScope = useTahqiq((s) => s.setScope);
  const result = useTahqiq((s) => s.result);
  const activeWord = useTahqiq((s) => s.activeWord);

  const data = surahCache[selectedSurahId] ?? null;

  const target = useMemo(
    () => (data ? buildTarget(data, scope, selectedAyah) : null),
    [data, scope, selectedAyah],
  );
  const wordsForCards = target ? target.words.slice(0, MAX_CARDS) : [];
  const resultMatches = !!result && !!target && result.targetKey === target.key;

  return (
    <Panel
      title="مِسْكُ الخِطَاب"
      subtitle="اختر السورة والآية المستهدفة — يُبنى نصّ التراصف القسري منها (114 سورة بالتشكيل)"
      latin="Qur'an Navigator"
      className="mb-5"
    >
      {surahsStatus === 'loading' && (
        <div className="flex gap-2 overflow-hidden pb-1 opacity-70">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="shimmer h-[84px] w-[94px] shrink-0 rounded-xl border border-line" />
          ))}
        </div>
      )}

      {/* 114 surahs strip */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {surahs.map((s) => {
          const sel = s.id === selectedSurahId;
          return (
            <button
              key={s.id}
              onClick={() => selectSurah(s.id)}
              className={`flex min-w-[94px] shrink-0 flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2.5 transition ${
                sel
                  ? 'border-gold-500/70 bg-gold-500/10 shadow-[0_0_16px_rgba(212,175,55,0.15)]'
                  : 'border-line bg-ink-850/60 hover:border-gold-600/40 hover:bg-ink-800'
              }`}
            >
              <Medallion n={s.id} size="sm" active={sel} />
              <span className={`font-quran text-[15px] leading-tight ${sel ? 'text-gold-200' : 'text-slate-100'}`}>
                {cleanName(s.name)}
              </span>
              <span className="text-[10px] text-slate-500">
                {s.numberOfAyahs} آية · {s.revelationType === 'Meccan' ? 'مكيّة' : 'مدنيّة'}
              </span>
            </button>
          );
        })}
      </div>

      {data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* surah summary + scope */}
          <div className="rounded-xl border border-line bg-ink-850/50 p-4">
            <div className="flex items-center gap-3">
              <Medallion n={data.id} size="md" active />
              <div>
                <h3 className="font-quran text-xl leading-tight text-gold-200">{data.meta.name}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {data.meta.englishName} · {data.meta.revelationType === 'Meccan' ? 'مكيّة' : 'مدنيّة'} ·{' '}
                  {data.meta.numberOfAyahs} آية
                </p>
              </div>
            </div>
            <div className="mt-4 flex rounded-lg border border-line bg-ink-900 p-1 text-xs">
              <button
                onClick={() => setScope('ayah')}
                className={`flex-1 rounded-md px-3 py-1.5 transition ${
                  scope === 'ayah' ? 'bg-gold-500/20 text-gold-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                آية واحدة
              </button>
              <button
                onClick={() => setScope('surah')}
                className={`flex-1 rounded-md px-3 py-1.5 transition ${
                  scope === 'surah' ? 'bg-gold-500/20 text-gold-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                السورة كاملة
              </button>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              {scope === 'ayah'
                ? `يُتراصَف صوتُك على كلمات الآية ${selectedAyah} فقط.`
                : `يُتراصَف صوتُك على كامل السورة (${data.meta.numberOfAyahs} آية). للتلاوات الطويلة يُنصح بقصّ العيّنة صوتيًا.`}
            </p>
          </div>

          {/* ayahs list */}
          <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-xl border border-line bg-ink-850/50 p-2.5">
            {data.ayahs.map((a) => {
              const sel = scope === 'ayah' && a.numberInSurah === selectedAyah;
              return (
                <button
                  key={a.numberInSurah}
                  onClick={() => {
                    selectAyah(a.numberInSurah);
                    setScope('ayah');
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-start transition ${
                    sel ? 'bg-gold-500/10 ring-1 ring-gold-500/50' : 'hover:bg-ink-800/70'
                  }`}
                >
                  <Medallion n={a.numberInSurah} size="sm" active={sel} />
                  <span className="font-quran text-[19px] leading-8 text-gold-100/95">
                    {a.text}
                    <span className="mx-2 font-quran text-sm text-gold-500">﴿{a.numberInSurah}﴾</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* target word cards (alignment-lit) */}
      {target && target.words.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-quran text-base text-gold-300">
              كلمات النصّ المستهدَف{' '}
              <span className="font-brand text-[10px] text-slate-500">({target.label})</span>
            </h3>
            <span className="text-[10px] text-slate-500">
              {target.words.length} كلمة · تُضاء البطاقات وفق التوقيت المُستخرَج من التراصف
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wordsForCards.map((w, i) => {
              const wa = resultMatches ? result!.words[i] : null;
              const active = resultMatches && activeWord === i;
              const showAyah = i === 0 || target.words[i].ayah !== target.words[i - 1].ayah;
              return (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {showAyah ? <span className="font-brand text-[9px] text-slate-600">آ.{w.ayah}</span> : null}
                  <span
                    className={`rounded-lg border px-2.5 py-1.5 transition ${statusCardClass(wa ? wa.status : null)} ${
                      active ? 'shadow-[0_0_18px_rgba(212,175,55,0.35)] ring-2 ring-gold-400' : ''
                    }`}
                  >
                    <span className="font-quran text-lg leading-none text-slate-50">{w.word}</span>
                    {wa ? <span className="mr-2 font-brand text-[9px] text-slate-500">{fmtSec(wa.startMs)}</span> : null}
                  </span>
                </span>
              );
            })}
            {target.words.length > MAX_CARDS && (
              <span className="rounded-lg border border-dashed border-line px-3 py-1.5 text-[10px] text-slate-500">
                + {target.words.length - MAX_CARDS} كلمة في جدول النتائج
              </span>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
