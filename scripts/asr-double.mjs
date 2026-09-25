// TAHQĪQ — بديلُ السماع الذكي للاختبارات (Web Worker/Whisper بديل)
//
// الغاية: اختبار **المحرّك نفسه** (`runAlignment` بكلّ بوّاباته) بلا تنزيل نموذج
// ولا شبكة. يُمرَّر هذا الملف إلى node بـ`--import` فيُوجِّه كلَّ استيرادٍ لـ
// `./whisper` إلى نفسه، وتتحكّم الاختباراتُ فيما «يسمعه» التطبيق عبر `asr`.
//
//   asr.say('نصّ الآية')   ← السماع أخرج هذا النصّ
//   asr.nothing()          ← السماع استمع ولم يُخرج لفظًا عربيًّا (إخفاق/صمت)
//   asr.fail('علة')        ← السماع رَمى استثناءً (تعذّر النموذج)
//
// وفي كل تحليلٍ يُسجَّل ما طُلب منه في `asr.calls` (فيمكن اختبارُ أن الصمت لم
// يُفرَّغ أصلًا، أو أن التفريغ جرى رغم شكّ كاشف الكلام).

import { registerHooks } from 'node:module';

const self = import.meta.url;

/** حالة السماع المصطنع — تتحكّم فيها الاختبارات */
export const asr = {
  text: '',
  chunks: [],
  error: null,
  calls: 0,
  say(text) {
    this.text = text;
    this.chunks = [];
    this.error = null;
  },
  nothing() {
    this.text = '';
    this.chunks = [];
    this.error = null;
  },
  fail(message) {
    this.error = message;
  },
  reset() {
    this.text = '';
    this.chunks = [];
    this.error = null;
    this.calls = 0;
  },
};

/* ------------------------------------------------------------------ */
/* واجهة whisper.ts نفسها (ما يستورده المحرّك)                         */
/* ------------------------------------------------------------------ */

export function toNumberArray(x) {
  if (x == null) return [];
  const arr = Array.isArray(x) ? x : Array.from(x);
  return arr.map((v) => (typeof v === 'bigint' ? Number(v) : Number(v)));
}

export function hasArabic(s) {
  return /[\u0621-\u064A]/.test(String(s ?? ''));
}

export function whisperLoadedSize() {
  return 'tiny';
}

export async function loadWhisper() {
  return { model: {}, processor: {}, size: 'tiny' };
}

export async function whisperTranscribeChunked() {
  asr.calls++;
  if (asr.error) throw new Error(asr.error);
  return { text: asr.text, chunks: asr.chunks };
}

export async function whisperForcedAlignment() {
  return null; // يُترك المحرّك لمسار الطاقة/الأزمنة (وهو ما يُقاس فيه الزمن)
}

/* ------------------------------------------------------------------ */
/* توجيه الاستيراد                                                     */
/* ------------------------------------------------------------------ */

registerHooks({
  resolve(specifier, context, next) {
    if (/(^|\/)whisper(\.(ts|js|mjs))?$/.test(specifier)) {
      return { url: self, shortCircuit: true, format: 'module' };
    }
    return next(specifier, context);
  },
});
