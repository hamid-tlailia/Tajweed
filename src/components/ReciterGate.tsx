'use client';

import { STYLE_META, recitersFor, resolveReciter, stylesFor } from '@/lib/reciter';
import type { RecitationStyle } from '@/lib/reciter';
import { TEMPO_META } from '@/lib/tajweed';
import { PASS_SCORE } from '@/lib/types';
import { refKey, useTahqiq } from '@/store';
import { Badge, IconShieldCheck, Panel } from './ui';

/**
 * القارئ المرجعي — مرجعُ كل تحليل:
 *   • يُختار تلقائيًّا بحسب الرواية ومرتبة القراءة ونوع التلاوة (وللمستخدم أن يختار غيره).
 *   • سرعته المقيسة «مسطرةٌ» لكل تحليلٍ ولو بلا إنترنت: فالآية القصيرة (الٓمٓ) تُقاس إليه
 *     لا إلى نفسها.
 *   • ويُجلب صوتُه للآية تلقائيًّا في الخلفية فيُقاس بمحرك التطبيق، ثم تُقارن به كلماتُ
 *     المستخدم بعد كل تسجيل — فإن بلغت المطابقة حدّ الاجتياز (مع الدرجة الذاتية) جازت الآية.
 */
export default function ReciterGate() {
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const scope = useTahqiq((s) => s.scope);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const riwayah = useTahqiq((s) => s.riwayah);
  const tempo = useTahqiq((s) => s.tempo);
  const refEval = useTahqiq((s) => s.refEval);
  const refCache = useTahqiq((s) => s.refCache);
  const evaluateReciter = useTahqiq((s) => s.evaluateReciter);
  const useGate = useTahqiq((s) => s.useReciterGate);
  const setUseGate = useTahqiq((s) => s.setUseReciterGate);
  const choice = useTahqiq((s) => s.referenceChoice);
  const style = useTahqiq((s) => s.recitationStyle);
  const setChoice = useTahqiq((s) => s.setReferenceChoice);
  const setStyle = useTahqiq((s) => s.setRecitationStyle);

  const { reciter, auto } = resolveReciter(riwayah, tempo, style, choice);
  const autoPick = resolveReciter(riwayah, tempo, style, 'auto').reciter;
  const key = refKey(data?.id ?? 0, selectedAyah, reciter.id);
  const cached = refCache[key];
  const state = refEval.key === key ? refEval : { status: cached ? 'ready' : 'idle', key, stage: '', error: null, auto: false };
  const loading = state.status === 'loading';
  const scopeOk = scope === 'ayah';
  const styles = stylesFor(riwayah);
  const list = recitersFor(riwayah, style);
  const tempoLabel = TEMPO_META[tempo]?.label ?? 'ترتيل';

  return (
    <Panel
      title="القارئ المرجعي — مرجعُ كل تحليل"
      subtitle="تُقاس تلاوتك دائمًا إلى قارئٍ معتمد يُختار بحسب مرتبتك ونوع التلاوة — ولو لم تختر شيخًا"
    >
      {/* نوع التلاوة */}
      {styles.length > 1 ? (
        <div className="mb-3">
          <p className="mb-1.5 text-[10.5px] text-slate-400">نوع التلاوة المرجعية</p>
          <div className="grid grid-cols-2 gap-2">
            {styles.map((st: RecitationStyle) => {
              const sel = st === style;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStyle(st)}
                  aria-pressed={sel}
                  className={`rounded-lg border px-3 py-2 text-start transition ${
                    sel ? 'border-gold-500/70 bg-gold-500/10' : 'border-line bg-ink-850/60 hover:border-gold-600/40'
                  }`}
                >
                  <span className={`block text-[12px] font-semibold ${sel ? 'text-gold-200' : 'text-slate-200'}`}>
                    {STYLE_META[st].label}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-slate-500">{STYLE_META[st].hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* القارئ */}
      <label className="block">
        <span className="mb-1.5 block text-[10.5px] text-slate-400">القارئ المرجعي</span>
        <select
          value={auto ? 'auto' : reciter.id}
          onChange={(e) => setChoice(e.target.value)}
          className="w-full rounded-lg border border-line bg-ink-850 px-3 py-2 text-[12px] text-slate-100 focus:border-gold-500/60 focus:outline-none"
        >
          <option value="auto">
            تلقائي — {autoPick.name} (لمرتبة {tempoLabel}، {STYLE_META[style].label})
          </option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.pace ? ` — سرعته ×${r.pace.toFixed(2)} من نموذج الترتيل` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 rounded-xl border border-line bg-ink-850/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-slate-200">{reciter.name}</p>
          <Badge tone={auto ? 'mint' : 'gold'}>{auto ? 'مختار تلقائيًّا' : 'اختيارك'}</Badge>
          <span className="text-[10px] text-slate-500">{riwayah === 'warsh' ? 'برواية ورش عن نافع' : 'برواية حفص عن عاصم'}</span>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
          {reciter.pace ? (
            <>
              <b className="text-gold-200">مسطرة السرعة:</b> سرعته المقيسة ≈ ×{reciter.pace.toFixed(2)} من نموذج الترتيل (قِيست
              على عشرات آلاف الكلمات من تلاوته) — إليها تُقاس كل تلاوةٍ في هذه المرتبة، حتى بلا إنترنت: فالآية القصيرة كـ«الٓمٓ»
              لا تُقاس بسرعتك أنت بل بسرعته.
            </>
          ) : (
            <>
              <b className="text-gold-200">مسطرة السرعة:</b> لم تُقس سرعة هذا القارئ بعد، فتُقاس التلاوة إلى نموذج مرتبة{' '}
              {tempoLabel} نفسه — ويبقى التحكيم كلمةً كلمة بصوته متى أمكن الاتصال.
            </>
          )}
        </p>
      </div>

      {/* مرجع الآية كلمةً كلمة */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-slate-200">التحكيم كلمةً كلمة</p>
          {data ? (
            <p className="mt-0.5 text-[10.5px] text-slate-500">
              الآية {selectedAyah} من {data.meta.name} · حدّ الاجتياز {PASS_SCORE}٪ — يُهيَّأ تلقائيًّا في الخلفية
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void evaluateReciter()}
          disabled={loading || !scopeOk || !data}
          className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition disabled:opacity-50 ${
            cached
              ? 'border-mint-500/50 bg-mint-500/10 text-mint-300 hover:bg-mint-500/20'
              : 'border-gold-600/50 bg-gold-500/15 text-gold-200 hover:bg-gold-500/25'
          }`}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-400" />
          ) : (
            <IconShieldCheck className="h-4 w-4" />
          )}
          {loading ? 'جارٍ التهيئة…' : cached ? 'المرجع جاهز ✓' : 'هيّئ المرجع الآن'}
        </button>
      </div>

      {loading && state.stage ? <p className="mt-2 text-[11px] text-slate-400">{state.stage}</p> : null}

      {state.status === 'error' ? (
        <p
          className={`mt-3 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
            state.auto
              ? 'border-line/70 bg-ink-850/60 text-slate-400'
              : 'border-danger-500/40 bg-danger-500/10 text-danger-300'
          }`}
        >
          {state.error}
        </p>
      ) : null}

      {cached && state.status !== 'error' ? (
        <div className="mt-3 rounded-xl border border-mint-500/40 bg-mint-500/10 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] leading-relaxed text-slate-200">
              <span className="font-semibold text-mint-300">مرجع الآية جاهز.</span> {cached.words.length} كلمة موقَّتة من
              تلاوة {cached.label}
              {cached.quality === 'fast' ? ' (بقياس الصوت — يُدقَّق بالسماع الذكي متى جُهِّز)' : ''}.
            </p>
            {useGate ? <Badge tone="mint">الاجتياز بمطابقة القارئ: مفعّل</Badge> : <Badge tone="slate">الاجتياز بمطابقة القارئ: متوقف</Badge>}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            بعد كل تسجيل تُقارن أزمنة كلماتك بأزمنته بعدلة سرعةٍ محدودة حول سرعته — فمن حافظ على نسقه في المدود والغنن
            طابقه، ومن خالف ظهرت مخالفته في كلمتها (وتُراعى الأوجه الجائزة كقصر العارض).
          </p>
        </div>
      ) : null}

      {/* مفتاح التحكيم */}
      <button
        type="button"
        onClick={() => setUseGate(!useGate)}
        role="switch"
        aria-checked={useGate}
        className="mt-3.5 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-ink-850/60 px-3.5 py-3 text-start transition hover:border-gold-600/40"
      >
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold text-slate-200">الاجتياز بمطابقة القارئ المعتمد</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">
            عند التفعيل: لا تُجاز الآية إلا إذا بلغت درجتُك الذاتية ومطابقتُك للقارئ كلتاهما {PASS_SCORE}٪ فأكثر (متى
            حضر مرجع الآية). عند الإيقاف: تُعرض المطابقة للاستئناس ويعود الحكم للدرجة الذاتية — وتبقى سرعة القارئ
            مسطرتَها في الحالين.
          </span>
        </span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${useGate ? 'bg-mint-500' : 'bg-ink-700'}`}>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              useGate ? 'start-[22px]' : 'start-0.5'
            }`}
          />
        </span>
      </button>

      {!scopeOk ? (
        <p className="mt-3 rounded-xl border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-[10.5px] leading-relaxed text-warn-300">
          التحكيم كلمةً كلمة متاح في وضع «آية واحدة» — وأما مسطرة السرعة فحاضرةٌ في كل وضع.
        </p>
      ) : (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          يحتاج جلبُ صوت القارئ اتصالًا بالإنترنت (مرة واحدة لكل آية، ثم يُحفظ على جهازك) — وصوتك أنت لا يُرفَع أبدًا،
          والمقارنة تجري على جهازك بالكامل.
        </p>
      )}
    </Panel>
  );
}
