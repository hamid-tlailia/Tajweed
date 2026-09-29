// TAHQĪQ — اختبار المحاذاة القسرية بـCTC: نقلُ الحروف وخوارزمية Viterbi
//
// النموذجُ نفسه لا يُختبر هنا (يحتاج تنزيلًا وشبكة)، وإنما الجزءان الخالصان:
// نقلُ الحرف العربيّ إلى اللاتينيّ، ومحاذاةُ الحروف على إطاراتٍ معلومة سلفًا —
// فتُبنى احتمالاتٌ مصطنعة حدودُها معروفة، ويُقاس هل تستردّها المحاذاة.
// التشغيل: npm run test:aligner

import { ALIGNER_VOCAB, ctcAlign, romanize, toLogProbs, tokenizeWords } from '../src/lib/aligner';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

console.log('════════ ١) نقل الحروف ════════');
check('«بِسْمِ» → bismi', romanize('بِسْمِ') === 'bismi', romanize('بِسْمِ'));
check('الشدّة تُضعِّف ما قبلها في «ٱللَّهِ»', romanize('ٱللَّهِ') === 'allaahi', romanize('ٱللَّهِ'));
check('السكون لا صوت له', !romanize('بِسْمِ').includes('0') && romanize('مَنْ') === 'man', romanize('مَنْ'));
check('التنوين نونٌ ساكنة', romanize('عَلِيمًا') === 'aaliyman', romanize('عَلِيمًا'));
check('الألف الخنجرية ألفٌ', romanize('ٱلرَّحْمَٰنِ') === 'alraahmaani', romanize('ٱلرَّحْمَٰنِ'));
check('لا يبقى حرفٌ خارج المفردات', /^[a-z']*$/.test(romanize('ٱلرَّحِيمِ ۝')), romanize('ٱلرَّحِيمِ ۝'));

const { tokens, owner } = tokenizeWords(['بِسْمِ', 'ٱللَّهِ']);
check('كل حرفٍ يُنسب إلى كلمته', tokens.length === owner.length && owner[0] === 0 && owner[owner.length - 1] === 1, `${tokens.length} حرفًا`);
check('الحروف كلها من مفردات النموذج', tokens.every((t) => Object.values(ALIGNER_VOCAB).includes(t)));

console.log('\n════════ ٢) المحاذاة تستردّ حدودًا معلومة ════════');
{
  // احتمالاتٌ مصطنعة: كلمتان («ab» ثم «cd») لكلٍّ منهما إطاراتُها المعلومة
  const V = 31;
  const BLANK = 0;
  const seq = ['a', 'b', 'c', 'd'].map((c) => ALIGNER_VOCAB[c]);
  const owner2 = [0, 0, 1, 1];
  // ٤٠ إطارًا: ١٠ لكل حرف — فالكلمة الأولى ٠–٢٠ والثانية ٢٠–٤٠
  const frames = 40;
  const logits = new Float32Array(frames * V).fill(-8);
  for (let t = 0; t < frames; t++) {
    const want = seq[Math.floor(t / 10)];
    logits[t * V + want] = 6;
    logits[t * V + BLANK] = -2;
  }
  const lp = toLogProbs(logits, frames, V);
  const durationMs = 4000; // ١٠٠ م.ث لكل إطار
  const res = ctcAlign(lp, frames, V, seq, owner2, 2, durationMs, BLANK);
  check('المحاذاة تنجح', !!res);
  if (res) {
    const [w0, w1] = res.spans;
    check(
      'الكلمة الأولى ≈ ٠ → ٢٠٠٠ م.ث',
      !!w0 && Math.abs(w0.startMs - 0) <= 150 && Math.abs(w0.endMs - 2000) <= 150,
      w0 ? `${Math.round(w0.startMs)} → ${Math.round(w0.endMs)}` : '—',
    );
    check(
      'الكلمة الثانية ≈ ٢٠٠٠ → ٤٠٠٠ م.ث',
      !!w1 && Math.abs(w1.startMs - 2000) <= 150 && Math.abs(w1.endMs - 4000) <= 150,
      w1 ? `${Math.round(w1.startMs)} → ${Math.round(w1.endMs)}` : '—',
    );
    check('الحدود مرتّبة ولا تتداخل', !!w0 && !!w1 && w0.endMs <= w1.startMs + 1);
  }
}

console.log('\n════════ ٣) الحالات الحادّة ════════');
{
  const V = 31;
  const seq = [ALIGNER_VOCAB.a, ALIGNER_VOCAB.b];
  const lp = toLogProbs(new Float32Array(3 * V).fill(-1), 3, V);
  check('إطاراتٌ أقلّ من الحروف تُرفض', ctcAlign(lp, 1, V, seq, [0, 0], 1, 100) === null);
  check('بلا حروفٍ لا محاذاة', ctcAlign(lp, 3, V, [], [], 0, 100) === null);
  const ok = ctcAlign(lp, 3, V, seq, [0, 1], 2, 300);
  check('احتمالاتٌ مستوية: تنجح ولا تنهار', !!ok && ok.spans.length === 2, ok ? `${ok.score.toFixed(2)}` : '—');
}
{
  // كلمةٌ لم يُنطق حرفٌ منها لا تُختلق لها حدود
  const V = 31;
  const seq = [ALIGNER_VOCAB.a, ALIGNER_VOCAB.b, ALIGNER_VOCAB.c];
  const frames = 30;
  const logits = new Float32Array(frames * V).fill(-8);
  for (let t = 0; t < frames; t++) {
    logits[t * V + (t < 15 ? seq[0] : seq[1])] = 6;
  }
  const res = ctcAlign(toLogProbs(logits, frames, V), frames, V, seq, [0, 1, 2], 3, 3000);
  check('كلمةٌ ثالثة بلا صوت: حدُّها ضئيل أو معدوم', !!res && (!res.spans[2] || res.spans[2]!.endMs - res.spans[2]!.startMs <= 200));
}

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
