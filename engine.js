// محرّك قواعد اللعبة — بلا إدخال/إخراج ولا أي اعتماد على العرض. الساعة تُمرَّر من الخادم فقط.

// تطبيع الإجابة العربية: تشكيل، تطويل، همزات، ى/ي، ة/ه، أرقام هندية، علامات الترقيم، مسافات، «ال» التعريف.
export const norm = (s) =>
  String(s ?? '').normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660)
    .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0)
    .replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/^ال(?=.{2})/, '');

// الشكل الموحّد للسؤال: answers = [[إجابة وبدائلها…], …] و need = عدد الإجابات المختلفة المطلوبة (الافتراضي: كلها).
// الشكل القديم { a, alt } ما زال مقبولاً (إجابة واحدة).
export function normalizeQuestion(q) {
  const answers = (q.answers ?? [[q.a, ...(q.alt ?? [])]]).map((x) => [].concat(x).map(String));
  return { ...q, answers, need: Math.max(1, Math.min(q.need ?? answers.length, answers.length)) };
}
/** فهرس الإجابة المطابقة داخل السؤال، أو -1. */
export const matchAnswer = (q, text) => {
  const t = norm(text);
  return t === '' ? -1 : q.answers.findIndex((alts) => alts.some((a) => norm(a) === t));
};
export const isCorrect = (q, text) => matchAnswer(normalizeQuestion(q), text) >= 0;

export class Game {
  constructor({ players, hearts, turnMs, attackMs = 0, smallRoom = 4, questions, now = Date.now, rand = Math.random }) {
    Object.assign(this, {
      now, rand, turnMs, attackMs, smallRoom, pool: questions.map(normalizeQuestion),
      used: new Set(), done: new Set(), failed: new Set(),   // done: فهارس الإجابات المكتملة؛ failed: من خسر قلباً في هذا السؤال
      qv: 0, seq: 0, evn: 0, ev: [], attack: null, status: 'playing', winner: null,
    });
    this.players = players.map((p) => ({ id: p.id, name: p.name, hearts, booms: 0, correct: 0, left: false }));
    this.pickQuestion();
    this.startTurn(0);
  }

  log(e) { this.ev = [...this.ev, { n: ++this.evn, ...e }].slice(-8); }
  alive() { return this.players.filter((p) => p.hearts > 0 && !p.left); }

  pickQuestion() {   // كل سؤال جديد يرفع qv: أي إجابة أو حدث متأخر يخص السؤال السابق يُرفض
    let c = this.pool.filter((q) => !this.used.has(q.id));
    if (!c.length) { this.used.clear(); c = this.pool; }   // نفاد الأسئلة: ندوّر من جديد
    this.q = c[Math.floor(this.rand() * c.length)];
    this.used.add(this.q.id); this.done.clear(); this.failed.clear(); this.qv++;
  }

  advance(kind) {    // kind: 'done' اكتملت الإجابات | 'skip' انتقال بقاعدة الغرف الصغيرة (مع كشف الناقص بعد انتهاء السؤال)
    const missing = this.q.answers.filter((_, i) => !this.done.has(i)).map((a) => a[0]).slice(0, 6);
    this.log(kind === 'skip' ? { t: kind, a: missing } : { t: kind });
    this.pickQuestion();
  }

  startTurn(i) { this.cur = i; this.attack = null; this.turn = { id: ++this.seq, deadline: this.now() + this.turnMs }; }

  nextAfter(i) {
    for (let k = 1; k <= this.players.length; k++) {
      const j = (i + k) % this.players.length, p = this.players[j];
      if (p.hearts > 0 && !p.left) return j;
    }
    return -1;
  }

  /** تمرير القنبلة. قاعدة الغرف الصغيرة (أقل من smallRoom لاعبين نشطين): إن كانت القنبلة ستعود إلى لاعب
   *  فشل سابقاً في هذا السؤال ولم يكتمل، يُستبدل السؤال بدل إبقائه عالقاً — مرة واحدة فقط، لأن
   *  الانتقال يمسح failed. الإجابات الناقصة لا تُعدّ صحيحة؛ هي قاعدة تقدّم منفصلة وصريحة. */
  handoff(from) {
    const to = this.nextAfter(from);
    if (this.alive().length < this.smallRoom && this.failed.has(this.players[to].id)) this.advance('skip');
    this.startTurn(to);
  }

  settle() {         // هل انتهت المباراة؟ (لاعب واحد أو لا أحد)
    const a = this.alive();
    if (a.length > 1) return false;
    this.status = 'over'; this.winner = a[0]?.id ?? null; this.turn = null; this.attack = null;
    this.log({ t: 'over', id: this.winner });
    return true;
  }

  /** الموعد القادم الذي يجب أن يوقظ فيه الخادم المحرّك. */
  due() { return this.status !== 'playing' ? null : this.attack ? this.attack.endsAt : this.turn.deadline; }

  /** مرحلتان بلا تكرار: (1) انتهاء المؤقت ← يبدأ هجوم الرامي وتُغلق الإجابات؛ (2) نهاية الهجوم ← يُطبَّق الضرر مرة واحدة. */
  tick() {
    if (this.status !== 'playing') return;
    const t = this.now();
    if (!this.attack) {
      if (t < this.turn.deadline) return;
      this.attack = { id: this.turn.id, pid: this.players[this.cur].id, endsAt: this.turn.deadline + this.attackMs };
    }
    if (t < this.attack.endsAt) return;
    const p = this.players[this.cur];
    this.attack = null;
    p.hearts--; p.booms++; this.failed.add(p.id);          // الفشل يُسجَّل بهوية اللاعب
    this.log({ t: 'hit', id: p.id });
    if (this.settle()) return;
    this.handoff(this.cur);
  }

  submit(pid, turnId, text, qv = null) {
    this.tick();   // إجابة وصلت بعد انتهاء الوقت تجد الهجوم قد بدأ (أو الدور قد انتقل) فتُرفض
    if (this.status !== 'playing') return { ok: false, why: 'over' };
    if (this.attack) return { ok: false, why: 'late' };
    if (turnId !== this.turn.id || (qv !== null && qv !== this.qv) || this.players[this.cur].id !== pid) return { ok: false, why: 'stale' };
    const i = matchAnswer(this.q, text);
    if (i < 0) return { ok: true, correct: false };                    // خاطئة: لا قلب ولا مؤقت ولا نقل
    if (this.done.has(i)) return { ok: true, correct: false, dup: true }; // مكررة: لا تُحتسب ولا عقوبة
    this.done.add(i); this.players[this.cur].correct++;
    this.log({ t: 'ok', id: pid });
    if (this.done.size >= this.q.need) this.advance('done');           // كل المطلوب اكتمل ← سؤال جديد (مرة واحدة: الدور القادم مرفوض لمن يحمل qv القديم)
    this.handoff(this.cur);
    return { ok: true, correct: true };
  }

  leave(pid) {
    const i = this.players.findIndex((p) => p.id === pid);
    if (i < 0 || this.players[i].left || this.status !== 'playing') return;
    this.players[i].left = true;
    this.log({ t: 'left', id: pid });
    if (!this.settle() && i === this.cur) this.handoff(i);   // بلا ضرر ولا فشل (ويُلغى الهجوم الجاري)
  }

  view() {     // لا تحتوي الإجابات غير المكتشفة أبداً: done فقط (المعتمد من كل إجابة مكتملة)
    const t = this.turn, a = this.attack, n = this.now();
    return {
      status: this.status, winner: this.winner, qv: this.qv,
      q: { id: this.q.id, text: this.q.text, cat: this.q.cat, need: this.q.need, done: [...this.done].map((i) => this.q.answers[i][0]) },
      turn: t && { id: t.id, pid: this.players[this.cur].id, ms: Math.max(0, t.deadline - n), total: this.turnMs,
                   atk: a ? { ms: Math.max(0, a.endsAt - n), total: this.attackMs } : null },
      players: this.players.map(({ id, name, hearts, booms, correct, left }) => ({ id, name, hearts, booms, correct, left })),
      ev: this.ev,
    };
  }
}
