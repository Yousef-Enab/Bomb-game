// تخطيط الحلبة: لاعبون على دائرة يواجهون المركز، واللاعب المحلي دائماً في الأسفل.
// دوال نقيّة بلا DOM (قابلة للاختبار). الترتيب الحقيقي للأدوار لا يتغيّر: نُدوّر الموضع البصري فقط.
export const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

/** اتجاه الـsprite (من الثمانية) للنظر من (x,y) نحو (tx,ty). north = يعطي ظهره للشاشة (ينظر للأعلى). */
export const facing = (x, y, tx, ty) => DIRS[(Math.round(Math.atan2(ty - y, tx - x) / (Math.PI / 4)) + 8) % 8];

const overlap = (a, b, w, h) => Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h;

/**
 * ids: معرّفات اللاعبين بترتيب اللعب؛ me: اللاعب المحلي؛ W,H: مساحة الحلبة.
 * o: { vw, vh (حجم الشخصية الظاهر)، minW, nameH, heartsH, perW, aw, ah (حجم الرامي) }
 * يُرجع { s: المقياس (3/2/1، أو 0.5 عند ازدحام شديد), cx, cy, box:{w,h}, slots:[{id,x,y,dir}] } — الإحداثيات نسبة لزاوية المساحة.
 */
export function layout(ids, me, W, H, o) {
  const n = ids.length, m = Math.max(0, ids.indexOf(me)), cx = W / 2, cy = H / 2;
  const place = (rx, ry) => ids.map((id, j) => {
    const a = Math.PI / 2 + (2 * Math.PI * ((j - m + n) % n)) / n;          // 90° = أسفل الشاشة؛ الزيادة باتجاه عقارب الساعة
    const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
    return { id, x, y, dir: facing(x, y, cx, cy) };
  });
  const fits = (slots, bw, bh, aw, ah) => slots.every((p, i) =>
    !overlap(p, { x: cx, y: cy }, (bw + aw) / 2, (bh + ah) / 2) && slots.every((q, j) => j <= i || !overlap(p, q, bw, bh)));
  let last;
  for (const s of [3, 2, 1, 0.5]) {                                           // أكبر مقياس يتّسع؛ 0.5 للازدحام الشديد فقط
    const bw = Math.max(o.vw * s, o.minW, o.perW), bh = o.vh * s + o.nameH + o.heartsH;
    const rx = (W - bw) / 2, ry = (H - bh) / 2;
    if (rx < 8 || ry < 8) continue;
    const r = Math.min(rx, ry);
    for (const slots of s > 1 ? [place(r, r)] : [place(r, r), place(rx, ry)]) {   // دائرة حقيقية أولاً، ثم قطع ناقص عند الازدحام
      last = { s, cx, cy, box: { w: bw, h: bh }, slots };
      if (fits(slots, bw, bh, o.aw * s, o.ah * s)) return last;
    }
  }
  return last ?? { s: 1, cx, cy, box: { w: o.minW, h: o.vh + o.nameH + o.heartsH }, slots: place(Math.max(8, (W - o.minW) / 2), Math.max(8, (H - o.vh) / 2)) };
}
