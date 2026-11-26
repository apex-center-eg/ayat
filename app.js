'use strict';

/* ================= الثوابت ================= */
const API = 'https://api.quran.com/api/v4';
const AUDIO_HOST = 'https://verses.quran.com/';

const RECITERS = [
  { id: 7,  ar: 'مشاري راشد العفاسي',        en: 'Mishari Rashid Alafasy' },
  { id: 2,  ar: 'عبد الباسط عبد الصمد — مرتل', en: 'AbdulBaset AbdulSamad (Murattal)' },
  { id: 1,  ar: 'عبد الباسط عبد الصمد — مجود', en: 'AbdulBaset AbdulSamad (Mujawwad)' },
  { id: 9,  ar: 'محمد صديق المنشاوي — مرتل',  en: 'Mohamed Siddiq Al-Minshawi (Murattal)' },
  { id: 8,  ar: 'محمد صديق المنشاوي — مجود',  en: 'Mohamed Siddiq Al-Minshawi (Mujawwad)' },
  { id: 6,  ar: 'محمود خليل الحصري',          en: 'Mahmoud Khalil Al-Husary' },
  { id: 3,  ar: 'عبد الرحمن السديس',          en: 'Abdur-Rahman As-Sudais' },
  { id: 4,  ar: 'أبو بكر الشاطري',            en: 'Abu Bakr Al-Shatri' },
  { id: 10, ar: 'سعود الشريم',               en: 'Sa\u2019ud Ash-Shuraym' },
  { id: 5,  ar: 'هاني الرفاعي',              en: 'Hani Ar-Rifai' },
  { id: 11, ar: 'محمد الطبلاوي',             en: 'Mohamed Al-Tablawi' },
  { id: 12, ar: 'محمود خليل الحصري — المعلم', en: 'Al-Husary (Muallim)' },
];

const THEMES = {
  night: { name: 'ليل',    bg1: '#081120', bg2: '#132a4a', accent: '#e6c15c', accent2: '#9db9e8', text: '#f5edd8', glow: 'rgba(230,193,92,0.20)' },
  teal:  { name: 'فيروز',  bg1: '#03211f', bg2: '#0c423c', accent: '#ffd98a', accent2: '#7fdbca', text: '#eafaf4', glow: 'rgba(127,219,202,0.18)' },
  dawn:  { name: 'فجر',    bg1: '#170b2e', bg2: '#3d1d60', accent: '#f0c0e6', accent2: '#c9a6ff', text: '#f9effc', glow: 'rgba(201,166,255,0.18)' },
  sand:  { name: 'رمال',   bg1: '#1d130a', bg2: '#473219', accent: '#ecc987', accent2: '#ffdf9e', text: '#faf1de', glow: 'rgba(236,201,135,0.18)' },
};

const RATIOS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };

const QUICK = [
  { label: 'الفاتحة',        ch: 1,   from: 1,   to: 7 },
  { label: 'آية الكرسي',     ch: 2,   from: 255, to: 255 },
  { label: 'أواخر البقرة',   ch: 2,   from: 285, to: 286 },
  { label: 'الكهف ١-١٠',     ch: 18,  from: 1,   to: 10 },
  { label: 'الرحمن ١-١٣',    ch: 55,  from: 1,   to: 13 },
  { label: 'الملك ١-٥',      ch: 67,  from: 1,   to: 5 },
  { label: 'الإخلاص',        ch: 112, from: 1,   to: 4 },
  { label: 'الفلق',          ch: 113, from: 1,   to: 5 },
  { label: 'الناس',          ch: 114, from: 1,   to: 6 },
];

const MAX_AYAHS = 50;
const GAP = 0.28;          // ثانية صمت بين الآيات
const FADE = 0.55;         // زمن انتقال النص
const TAIL = 0.9;          // ذيل بعد آخر آية

/* ================= الحالة ================= */
const S = {
  chapters: [],
  chapter: 1, from: 1, to: 7,
  reciter: 7, ratio: '9:16', theme: 'night', basmala: true,
  versesCache: {},        // chapter -> [{key, n, text}]
  audioListCache: {},     // `${reciter}:${chapter}` -> {key: url}
  items: [],              // playlist: {text, displayNum, buffer, dur}
  total: 0,
  playing: false, recording: false,
};

let actx = null, rafId = 0, t0 = 0, offsets = [], rec = null, chunks = [];
let renderCanvas = null, rctx = null;

/* ================= أدوات ================= */
const $ = id => document.getElementById(id);
const AR_D = '٠١٢٣٤٥٦٧٨٩';
const arDigits = n => String(n).replace(/\d/g, d => AR_D[+d]);
const fmtTime = s => { const m = Math.floor(s / 60), x = Math.round(s % 60); return arDigits(m) + ':' + arDigits(String(x).padStart(2, '0')); };

function toast(msg, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms);
}

function audioUrl(u) {
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  return AUDIO_HOST + u;
}

async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error('API ' + r.status);
  return r.json();
}

/* ================= تحميل البيانات ================= */
async function loadChapters() {
  const d = await api('/chapters?language=ar');
  S.chapters = d.chapters;
}

async function loadVerses(ch) {
  if (S.versesCache[ch]) return S.versesCache[ch];
  const d = await api('/quran/verses/uthmani?chapter_number=' + ch);
  const list = d.verses.map(v => ({
    key: v.verse_key,
    n: +v.verse_key.split(':')[1],
    text: v.text_uthmani.trim(),
  }));
  S.versesCache[ch] = list;
  return list;
}

async function loadAudioList(reciter, ch) {
  const ck = reciter + ':' + ch;
  if (S.audioListCache[ck]) return S.audioListCache[ck];
  const d = await api(`/recitations/${reciter}/by_chapter/${ch}?per_page=300`);
  const map = {};
  for (const f of d.audio_files) map[f.verse_key] = audioUrl(f.url);
  S.audioListCache[ck] = map;
  return map;
}

/* ================= بناء قائمة التشغيل ================= */
async function buildItems() {
  const chInfo = S.chapters[S.chapter - 1];
  const verses = await loadVerses(S.chapter);
  const audio = await loadAudioList(S.reciter, S.chapter);

  const items = [];
  if (S.basmala && S.chapter !== 1 && chInfo.bismillah_pre) {
    const bText = (await loadVerses(1))[0].text;
    const bAudio = await loadAudioList(S.reciter, 1);
    if (bAudio['1:1']) items.push({ text: bText, num: null, url: bAudio['1:1'] });
  }
  for (let n = S.from; n <= S.to; n++) {
    const v = verses[n - 1];
    if (!v || !audio[v.key]) throw new Error('missing ' + S.chapter + ':' + n);
    items.push({ text: v.text, num: n, url: audio[v.key] });
  }
  return items;
}

async function preload(items, onOne) {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  const bufs = [];
  for (let i = 0; i < items.length; i++) {
    const r = await fetch(items[i].url);
    if (!r.ok) throw new Error('audio ' + r.status);
    const raw = await r.arrayBuffer();
    bufs[i] = await actx.decodeAudioData(raw);
    onOne && onOne(i + 1, items.length);
  }
  return bufs;
}

/* ================= الرسم ================= */
function makeStars(w, h, count) {
  const arr = [];
  for (let i = 0; i < count; i++)
    arr.push({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.7, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.2 });
  return arr;
}

function star8(ctx, cx, cy, r, rot) {
  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const a0 = rot + k * Math.PI / 4;
    for (let i = 0; i <= 4; i++) {
      const a = a0 + i * Math.PI / 2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i === 0 && k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

function diamond(ctx, x, y, s, color) {
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function layoutText(ctx, text, maxW, maxH, base) {
  for (let size = base; size >= 26; size -= 2) {
    ctx.font = size + 'px "Amiri Quran"';
    const lines = wrapLines(ctx, text, maxW);
    const lh = size * 1.85;
    if (lines.length * lh <= maxH && lines.every(l => ctx.measureText(l).width <= maxW))
      return { lines, size, lh };
  }
  ctx.font = '26px "Amiri Quran"';
  return { lines: wrapLines(ctx, text, maxW), size: 26, lh: 48 };
}

function drawScene(ctx, w, h, t, itemText, itemAlpha, surahName, progress, reciterAr) {
  const th = THEMES[S.theme];
  const u = Math.min(w, h) / 900;            // وحدة قياس

  // الخلفية
  const g = ctx.createLinearGradient(0, 0, w * 0.25, h);
  g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // توهجات متحركة
  for (let i = 0; i < 3; i++) {
    const gx = w * (0.5 + 0.38 * Math.sin(t * 0.11 + i * 2.2));
    const gy = h * (0.35 + 0.3 * Math.cos(t * 0.09 + i * 1.7));
    const gr = Math.max(w, h) * 0.45;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    rg.addColorStop(0, th.glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }

  // نجوم
  if (!drawScene._stars || drawScene._sw !== w) { drawScene._stars = makeStars(w, h, 110); drawScene._sw = w; }
  for (const s of drawScene._stars) {
    const a = 0.25 + 0.55 * Math.abs(Math.sin(t * s.s + s.p));
    ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * u, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // زخرفة نجمية كبيرة باهتة تدور ببطء
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.rotate(t * 0.02);
  ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.05; ctx.lineWidth = 1.4 * u;
  star8(ctx, 0, 0, Math.min(w, h) * 0.52, 0); ctx.stroke();
  star8(ctx, 0, 0, Math.min(w, h) * 0.40, Math.PI / 8); ctx.stroke();
  ctx.restore(); ctx.globalAlpha = 1;

  const m = 54 * u;   // هامش الإطار

  // إطار مزخرف
  ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.6 * u;
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 0.9 * u;
  ctx.strokeRect(m + 7 * u, m + 7 * u, w - 2 * (m + 7 * u), h - 2 * (m + 7 * u));
  ctx.globalAlpha = 0.9;
  for (const [cx, cy] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]])
    diamond(ctx, cx, cy, 7 * u, th.accent);
  ctx.globalAlpha = 1;

  // ترويسة السورة
  ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hy = m + 62 * u;
  ctx.font = `500 ${Math.round(38 * u)}px "Reem Kufi"`;
  ctx.fillStyle = th.accent;
  ctx.fillText('سورة ' + surahName, w / 2, hy);
  const hw = ctx.measureText('سورة ' + surahName).width / 2 + 26 * u;
  ctx.strokeStyle = th.accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 1 * u;
  ctx.beginPath(); ctx.moveTo(w / 2 - hw - 70 * u, hy); ctx.lineTo(w / 2 - hw, hy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 + hw, hy); ctx.lineTo(w / 2 + hw + 70 * u, hy); ctx.stroke();
  diamond(ctx, w / 2 - hw - 78 * u, hy, 5 * u, th.accent);
  diamond(ctx, w / 2 + hw + 78 * u, hy, 5 * u, th.accent);
  ctx.globalAlpha = 1;

  // نص الآية
  const maxW = w - 2 * (m + 46 * u);
  const maxH = h * 0.52;
  const base = Math.round((S.ratio === '16:9' ? 58 : 66) * u * 0.92);
  ctx.save();
  ctx.globalAlpha = itemAlpha;
  if (itemText) {
    const lay = layoutText(ctx, itemText, maxW, maxH, base);
    ctx.font = lay.size + 'px "Amiri Quran"';
    const totalH = lay.lines.length * lay.lh;
    let y = h / 2 - totalH / 2 + lay.lh / 2 + 14 * u;
    // ظل وتوهج خفيف
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 3 * u;
    const tg = ctx.createLinearGradient(0, y - totalH / 2, 0, y + totalH / 2);
    tg.addColorStop(0, '#fffdf5'); tg.addColorStop(0.5, th.text); tg.addColorStop(1, th.accent);
    ctx.fillStyle = tg;
    for (const line of lay.lines) { ctx.fillText(line, w / 2, y); y += lay.lh; }
  }
  ctx.restore();

  // التذييل: القارئ + المصدر
  const fy = h - m - 66 * u;
  ctx.font = `500 ${Math.round(21 * u)}px "IBM Plex Sans Arabic"`;
  ctx.fillStyle = th.accent2; ctx.globalAlpha = 0.95;
  ctx.fillText('القارئ: ' + reciterAr, w / 2, fy);
  ctx.font = `300 ${Math.round(17 * u)}px "IBM Plex Sans Arabic"`;
  ctx.globalAlpha = 0.62; ctx.fillStyle = th.text;
  ctx.direction = 'ltr';
  ctx.fillText('Recitation: Quran Foundation — Quran.com / QuranicAudio', w / 2, fy + 30 * u);
  ctx.direction = 'rtl';
  ctx.globalAlpha = 1;

  // شريط التقدم
  const pw = w - 2 * (m + 7 * u);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(m + 7 * u, h - m - 7 * u + 3 * u, pw, 3 * u);
  ctx.fillStyle = th.accent;
  ctx.fillRect(m + 7 * u, h - m - 7 * u + 3 * u, pw * Math.min(1, Math.max(0, progress)), 3 * u);

  // بداية ونهاية ناعمة
  const fadeIn = Math.min(1, t / 0.6);
  const fadeOut = Math.min(1, Math.max(0, (S.total + TAIL - 0.7 - t) / 0.7));
  const veil = 1 - Math.min(fadeIn, S.recording || S.playing ? fadeOut : 1);
  if (veil > 0) { ctx.fillStyle = `rgba(0,0,0,${veil})`; ctx.fillRect(0, 0, w, h); }
}

/* ================= المشغل ================= */
function currentItemAt(el) {
  let idx = offsets.length - 1;
  for (let i = 0; i < offsets.length; i++) if (offsets[i] > el) { idx = i - 1; break; }
  return Math.max(0, Math.min(idx, S.items.length - 1));
}

function itemDisplayText(it) {
  return it.num == null ? it.text : it.text + ' ﴿' + arDigits(it.num) + '﴾';
}

async function play({ record }) {
  stopAll();
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  await actx.resume();
  await document.fonts.load('66px "Amiri Quran"');
  await document.fonts.load('500 38px "Reem Kufi"');
  await document.fonts.load('500 21px "IBM Plex Sans Arabic"');

  const [w, h] = RATIOS[S.ratio];
  let canvas, ctx;
  if (record) {
    renderCanvas = document.createElement('canvas');
    renderCanvas.width = w; renderCanvas.height = h;
    canvas = renderCanvas;
  } else {
    canvas = $('previewCanvas');
    canvas.width = w / 2; canvas.height = h / 2;
  }
  ctx = canvas.getContext('2d');

  // جدولة الصوت
  t0 = actx.currentTime + 0.15;
  offsets = []; let cur = 0;
  const dest = record ? actx.createMediaStreamDestination() : null;
  for (let i = 0; i < S.items.length; i++) {
    offsets.push(cur);
    const src = actx.createBufferSource();
    src.buffer = S.items[i].buffer;
    src.connect(actx.destination);
    if (dest) src.connect(dest);
    src.start(t0 + cur);
    cur += S.items[i].buffer.duration + GAP;
  }
  S.total = cur - GAP;

  const reciterAr = RECITERS.find(r => r.id === S.reciter).ar;
  const surahName = S.chapters[S.chapter - 1].name_arabic;

  // التسجيل
  let recorder = null;
  if (record) {
    const stream = canvas.captureStream(30);
    const ms = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    // webm/vp9+opus: يقبله يوتيوب وتيك توك؛ mp4 احتياطي
    const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
                   'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
    // بعض المتصفحات تقول isTypeSupported=true ثم يفشل الإنشاء — نجرّب فعلياً
    for (const m of mimes) {
      try {
        if (!MediaRecorder.isTypeSupported(m)) continue;
        recorder = new MediaRecorder(ms, { mimeType: m, videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 192_000 });
        break;
      } catch (e) { recorder = null; }
    }
    if (!recorder) recorder = new MediaRecorder(ms, { videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 192_000 });
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec = recorder;
  }

  S.playing = true; S.recording = record;

  await new Promise(resolve => {
    const loop = () => {
      const t = actx.currentTime - t0;
      const idx = currentItemAt(Math.max(0, t));
      const it = S.items[idx];
      const alpha = Math.min(1, Math.max(0, (t - offsets[idx]) / FADE));
      drawScene(ctx, canvas.width, canvas.height, Math.max(0, t),
        itemDisplayText(it), alpha, surahName, t / (S.total + TAIL), reciterAr);
      if (t < S.total + TAIL && (S.playing || S.recording)) rafId = requestAnimationFrame(loop);
      else resolve();
    };
    if (record) { recorder.start(500); }
    loop();
  });

  if (record) {
    await new Promise(res => { recorder.onstop = res; recorder.stop(); });
    const mime = recorder.mimeType;
    rec = null; S.recording = false; S.playing = false;
    return new Blob(chunks, { type: mime });
  }
  S.playing = false;
  return null;
}

function stopAll() {
  S.playing = false; S.recording = false;
  cancelAnimationFrame(rafId);
  try { rec && rec.state !== 'inactive' && rec.stop(); } catch (e) {}
  rec = null;
  if (actx) { actx.close().catch(() => {}); actx = null; }
}

/* ================= العنوان والوصف ================= */
function buildCaption() {
  const ch = S.chapters[S.chapter - 1];
  const reciter = RECITERS.find(r => r.id === S.reciter);
  const range = S.from === S.to ? 'الآية ' + arDigits(S.from) : 'الآيات ' + arDigits(S.from) + '–' + arDigits(S.to);
  const rangeEn = S.from === S.to ? `verse ${S.from}` : `verses ${S.from}–${S.to}`;

  const title = `سورة ${ch.name_arabic} • ${range} | تلاوة هادئة بصوت ${reciter.ar} 🕌`;

  const desc =
`تلاوة خاشعة من سورة ${ch.name_arabic}، ${range}، بصوت القارئ ${reciter.ar}.

A calm recitation of Surah ${ch.name_simple} (${rangeEn}) by ${reciter.en}.

القارئ: ${reciter.ar}
المصدر: Quran Foundation — Quran.com / QuranicAudio
النص: المصحف العثماني (Quran.com)

#قرآن #تلاوة #quran #tilawah #quranrecitation #${ch.name_simple.replace(/[^A-Za-z]/g, '')}`;

  return { title, desc };
}

/* ================= واجهة ================= */
function setProgress(pct, text) {
  $('progressWrap').hidden = false;
  $('progressFill').style.width = Math.round(pct * 100) + '%';
  if (text) $('progressText').textContent = text;
}

async function ensureLoaded(onStage) {
  onStage && onStage('جاري تحميل النص القرآني…');
  S.items = await buildItems();
  if (S.items.length > MAX_AYAHS) throw new Error('max');
  const bufs = await preload(S.items, (i, n) =>
    onStage && onStage(`جاري تحميل التلاوة (${arDigits(i)}/${arDigits(n)})…`));
  for (let i = 0; i < S.items.length; i++) S.items[i].buffer = bufs[i];
  S.total = S.items.reduce((a, b) => a + b.buffer.duration + GAP, 0) - GAP;
  $('durationPill').hidden = false;
  $('durationVal').textContent = fmtTime(S.total);
}

async function onPreview() {
  try {
    $('btnPreview').disabled = true;
    $('previewOverlay').classList.add('hide');
    await ensureLoaded(msg => { $('btnPreview').textContent = msg; });
    $('btnStop').disabled = false;
    await play({ record: false });
  } catch (e) { handleErr(e); }
  $('btnPreview').disabled = false;
  $('btnPreview').textContent = '▶ معاينة حية';
  $('previewOverlay').classList.remove('hide');
  $('btnStop').disabled = true;
}

async function onRender() {
  try {
    $('btnRender').disabled = true;
    $('doneBox').hidden = true;
    await ensureLoaded(msg => setProgress(0.02, msg));
    setProgress(0.05, 'بدأ التجهيز — الفيديو بيتسجّل لحظة بلحظة…');
    const progTimer = setInterval(() => {
      if (actx && S.total) {
        const t = actx.currentTime - t0;
        setProgress(0.05 + 0.9 * Math.min(1, t / (S.total + TAIL)), 'جاري التسجيل… ' + fmtTime(Math.max(0, t)) + ' / ' + fmtTime(S.total));
      }
    }, 250);
    const blob = await play({ record: true });
    clearInterval(progTimer);
    if (!blob) throw new Error('cancelled');
    setProgress(1, 'تم ✅');

    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = $('btnDownload');
    a.href = url;
    a.download = `surah-${S.chapter}-ayahs-${S.from}-${S.to}-${S.ratio.replace(':', 'x')}.${ext}`;
    window.__lastVideo = blob;   // للفحص
    window.__lastVideoName = a.download;

    const cap = buildCaption();
    $('titleOut').textContent = cap.title;
    $('descOut').textContent = cap.desc;
    $('doneBox').hidden = false;
    $('doneBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) { handleErr(e); }
  $('btnRender').disabled = false;
  setTimeout(() => { if (!S.recording) $('progressWrap').hidden = true; }, 4000);
}

function handleErr(e) {
  console.error(e);
  if (e && e.message === 'max') toast(`الحد الأقصى ${arDigits(MAX_AYAHS)} آية للفيديو الواحد — قسّمها على فيديوهين`);
  else if (e && /^missing/.test(e.message || '')) toast('تلاوة هذا القارئ غير متاحة لبعض الآيات — جرّب قارئاً آخر');
  else if (e && /^audio/.test(e.message || '')) toast('تعذر تحميل التلاوة — تحقق من الاتصال أو جرّب قارئاً آخر');
  else if (e && e.message === 'cancelled') { /* أُوقف */ }
  else toast('حصل خطأ غير متوقع — حاول مرة أخرى');
}

/* ================= تهيئة ================= */
function saveState() {
  try {
    localStorage.setItem('ayat-settings', JSON.stringify({
      chapter: S.chapter, from: S.from, to: S.to, reciter: S.reciter,
      ratio: S.ratio, theme: S.theme, basmala: S.basmala,
    }));
  } catch (e) {}
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('ayat-settings') || 'null');
    if (s) Object.assign(S, s);
  } catch (e) {}
}

function refreshBasmala() {
  const ch = S.chapters[S.chapter - 1];
  const ok = S.chapter !== 1 && ch && ch.bismillah_pre;
  $('basmalaCheck').parentElement.style.display = ok ? '' : 'none';
}

async function init() {
  loadState();
  await loadChapters();

  const sel = $('surahSelect');
  sel.innerHTML = S.chapters.map(c =>
    `<option value="${c.id}">${arDigits(c.id)}. سورة ${c.name_arabic} (${arDigits(c.verses_count)} آية)</option>`).join('');
  sel.value = S.chapter;

  $('quickChips').innerHTML = QUICK.map((q, i) => `<button data-q="${i}">${q.label}</button>`).join('');
  $('quickChips').addEventListener('click', e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const q = QUICK[+b.dataset.q];
    S.chapter = q.ch; S.from = q.from; S.to = q.to;
    sel.value = q.ch; syncAyahInputs(); refreshBasmala(); saveState();
  });

  function syncAyahInputs() {
    const ch = S.chapters[S.chapter - 1];
    $('fromAyah').max = ch.verses_count; $('toAyah').max = ch.verses_count;
    $('fromAyah').value = S.from; $('toAyah').value = S.to;
  }
  syncAyahInputs(); refreshBasmala();

  sel.addEventListener('change', () => {
    S.chapter = +sel.value;
    S.from = 1; S.to = Math.min(7, S.chapters[S.chapter - 1].verses_count);
    syncAyahInputs(); refreshBasmala(); saveState();
  });
  $('fromAyah').addEventListener('change', () => {
    S.from = Math.max(1, Math.min(+$('fromAyah').value || 1, S.chapters[S.chapter - 1].verses_count));
    if (S.to < S.from) { S.to = S.from; $('toAyah').value = S.to; }
    $('fromAyah').value = S.from; saveState();
  });
  $('toAyah').addEventListener('change', () => {
    S.to = Math.max(S.from, Math.min(+$('toAyah').value || S.from, S.chapters[S.chapter - 1].verses_count));
    $('toAyah').value = S.to; saveState();
  });
  $('btnFullSurah').addEventListener('click', () => {
    S.from = 1; S.to = S.chapters[S.chapter - 1].verses_count;
    syncAyahInputs(); saveState();
  });

  $('reciterGrid').innerHTML = RECITERS.map(r =>
    `<button class="reciter-card${r.id === S.reciter ? ' on' : ''}" data-r="${r.id}">${r.ar}</button>`).join('');
  $('reciterGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    S.reciter = +b.dataset.r;
    document.querySelectorAll('.reciter-card').forEach(x => x.classList.toggle('on', +x.dataset.r === S.reciter));
    saveState();
  });

  $('ratioSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-ratio]'); if (!b) return;
    S.ratio = b.dataset.ratio;
    document.querySelectorAll('#ratioSeg button').forEach(x => x.classList.toggle('on', x === b));
    const [w, h] = RATIOS[S.ratio];
    $('previewFrame').style.aspectRatio = w + ' / ' + h;
    $('previewFrame').style.maxWidth = S.ratio === '16:9' ? '100%' : '';
    saveState();
  });
  if (S.ratio !== '9:16') document.querySelector(`#ratioSeg [data-ratio="${S.ratio}"]`).click();

  $('themeRow').innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button class="theme-swatch${k === S.theme ? ' on' : ''}" data-t="${k}" style="background:linear-gradient(135deg,${t.bg1},${t.bg2})"><span>${t.name}</span></button>`).join('');
  $('themeRow').addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    S.theme = b.dataset.t;
    document.querySelectorAll('.theme-swatch').forEach(x => x.classList.toggle('on', x === b));
    saveState();
  });

  $('basmalaCheck').checked = S.basmala;
  $('basmalaCheck').addEventListener('change', () => { S.basmala = $('basmalaCheck').checked; saveState(); });

  $('btnPreview').addEventListener('click', onPreview);
  $('btnRender').addEventListener('click', onRender);
  $('btnStop').addEventListener('click', () => { stopAll(); $('previewOverlay').classList.remove('hide'); $('btnStop').disabled = true; });

  document.querySelectorAll('.copy-btn').forEach(b => b.addEventListener('click', async () => {
    const txt = $(b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(txt); toast('اتنسخ ✅'); }
    catch (e) { toast('تعذر النسخ — حدد النص يدوياً'); }
  }));

  // إطار معاينة أولي
  const pc = $('previewCanvas');
  const pctx = pc.getContext('2d');
  drawScene(pctx, pc.width, pc.height, 0, '﷽', 1, 'الفاتحة', 0, RECITERS[0].ar);
}

init().catch(e => { console.error(e); toast('تعذر تحميل بيانات القرآن — تحقق من الاتصال'); });
