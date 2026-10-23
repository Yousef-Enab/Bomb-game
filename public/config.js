// الإعدادات المركزية — يستوردها الخادم والمتصفح معاً. عدّل القيم هنا فقط.
// مجلد public/ مسطّح عمداً (سهل الرفع من الهاتف): كل ملف مباشرة داخل public/.
import { SHEETS } from './sprites.js';
export { SHEETS };

// ── مسارات الأصول (استبدل الملف بنفس الاسم أو غيّر الاسم هنا) ─────────────
// الرامي واللاعبون والقلب والقنبلة والسهم: تُعرَّف أبعادها وتوقيتها في sprites.js (مولَّد من tools/make_sprites.py)
export const ASSETS = {
  bg: { day: '/Desert_day.png', night: '/Desert_night.png' },
  audio: '/Desert_sound.mp3',
};

// ── المظهر والصوت ────────────────────────────────────────────────
export const THEME = { default: 'day', focusY: '68%' };   // focusY: أي جزء من الخلفية الطولية يبقى ظاهراً عند القص
export const AUDIO = { volume: 0.5 };                      // 0..1
export const REST = { anim: 'reload', frame: 0 };           // وضع الرامي في المركز (الإطار الأول: واقف يحمل القوس). غيّره إلى { anim: 'idle', frame: 0 } لاستخدام حركة الـidle

// ── قواعد الغرف الصغيرة ──────────────────────────────────────────
export const SMALL_ROOM = 4;   // أقل من هذا العدد من اللاعبين النشطين = «غرفة صغيرة»

// ── توقيت هجوم الرامي (ملّي ثانية) — المكان الوحيد للتعديل ───────────────
const sum = (a) => a.reduce((x, y) => x + y, 0);
const A = SHEETS.archer.anim;
export const ATTACK = {
  speed: 1,          // 1 = سرعة الإطارات الأصلية في الـGIF؛ 1.5 = أسرع بنصف مرة (هجوم أقصر)
  moveMs: 400,       // انتقال الرامي إلى أمام اللاعب المستهدف
  returnMs: 450,     // عودته إلى المركز بعد الإصابة
  arrowMs: 350,      // طيران السهم
  idleRatio: 0.05,   // مدة طور الـidle = هذه النسبة من مؤقت الغرفة، مقرَّبة إلى عدد صحيح من دورات الـidle
  idleMin: 1, idleMax: 4,
};

/** خطة الهجوم لغرفة مؤقتها turnMs. الخادم يأخذ منها total (متى يُطبَّق الضرر) والمتصفح يرسم أطوارها. */
export function attackPlan(turnMs) {
  const k = ATTACK.speed, loop = sum(A.idle.ms) / k;
  const loops = Math.min(ATTACK.idleMax, Math.max(ATTACK.idleMin, Math.round((turnMs * ATTACK.idleRatio) / loop)));
  const p = {
    move: ATTACK.moveMs, reload: sum(A.reload.ms) / k, idle: loops * loop,
    release: sum(A.shoot.ms.slice(0, SHEETS.archer.releaseFrame)) / k,   // يخرج السهم عند إطار الإفلات
    arrow: ATTACK.arrowMs,
  };
  return { ...p, total: p.move + p.reload + p.idle + p.release + p.arrow };
}
