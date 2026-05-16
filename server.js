require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');
const express    = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.DB_NAME || 'newdrama';

// Middleware — must come before routes
app.use(cors());
app.use(express.json());

// Static assets (css, js, images)
app.use(express.static(path.join(__dirname)));

// ── Lazy MongoDB connection (serverless-д хэрэгтэй) ──────────────
let _connectPromise = null;
function lazyConnect() {
  if (!_connectPromise) {
    _connectPromise = MongoClient.connect(MONGO_URI)
      .then(client => { db = client.db(DB_NAME); })
      .catch(err => { _connectPromise = null; throw err; });
  }
  return _connectPromise;
}
// API route бүрийн өмнө DB холболт баталгаажуулна
app.use('/api', async (req, res, next) => {
  if (!db) {
    try { await lazyConnect(); }
    catch(e) { return res.status(500).json({ error: 'DB холбогдсонгүй: ' + e.message }); }
  }
  next();
});

// Page routes — explicit so /login works without .html
const pages = ['index','admin','login','movie','dashboard','pricing'];
pages.forEach(p => {
  app.get(`/${p === 'index' ? '' : p}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${p}.html`));
  });
});

let db;

async function connect() {
  if (!MONGO_URI) {
    console.error('❌  .env файлд MONGO_URI байхгүй байна');
    process.exit(1);
  }
  const client = await MongoClient.connect(MONGO_URI);
  db = client.db(DB_NAME);
  console.log(`✅  MongoDB: ${DB_NAME} холбогдлоо`);
  app.listen(PORT, HOST, () => console.log(`🚀  Server listening on ${HOST}:${PORT}`));
}

/* ── helpers ── */
function col(name) { return db.collection(name); }
function oid(id)   { return new ObjectId(id); }

/* ════════════════════════════════
   MOVIES
════════════════════════════════ */
app.get('/api/movies', async (req, res) => {
  const movies = await col('movies').find().toArray();
  res.json(movies);
});

app.post('/api/movies', async (req, res) => {
  const movie = { ...req.body, views: req.body.views || 0, added: new Date().toISOString().slice(0,10) };
  const result = await col('movies').insertOne(movie);
  res.json({ ...movie, _id: result.insertedId });
});

app.get('/api/movies/:id', async (req, res) => {
  const id = req.params.id;
  const query = ObjectId.isValid(id) ? { _id: oid(id) } : { id };
  const movie = await col('movies').findOne(query);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

app.put('/api/movies/:id', async (req, res) => {
  const update = { ...req.body };
  delete update._id;
  await col('movies').updateOne({ _id: oid(req.params.id) }, { $set: update });
  res.json({ ok: true });
});

/* ════════════════════════════════
   ADMIN UTILITY — Trailer ID-г Bunny-с засах
   Bunny library-н бүх видеог татаж, "— Trailer" нэртэй тохирохыг олж DB update хийнэ
════════════════════════════════ */
app.post('/api/admin/fix-trailer-ids', async (req, res) => {
  const { libraryId, apiKey } = req.body;
  if (!libraryId || !apiKey) return res.status(400).json({ error: 'libraryId, apiKey шаардлагатай' });

  // 1. Bunny-с бүх видео жагсаалт татах (100 хуудас хүртэл)
  let allVideos = [];
  for (let page = 1; page <= 100; page++) {
    const r = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos?page=${page}&itemsPerPage=100&orderBy=date`,
      { headers: { AccessKey: apiKey, Accept: 'application/json' } }
    );
    const data = await r.json();
    const items = data.items || [];
    allVideos = allVideos.concat(items);
    if (items.length < 100) break;
  }

  // Trailer видеог нэрээр нь индекслэх — Finished (status=4) видеог давуу эрхтэй сонгоно
  // Bunny status: 0=Queued,1=Processing,2=Encoding,3=Finished,4=ResolutionFinished,5=Failed
  const trailerMap = {}; // key → { guid, status }
  for (const v of allVideos) {
    const title = v.title || '';
    const m = title.match(/^(.+?)\s*—\s*Trailer$/i) || title.match(/^(.+?)_cut$/i);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const existing = trailerMap[key];
    // Finished (3 эсвэл 4) байвал хадгалах; байхгүй эсвэл одоогийнх нь муу бол солих
    const isFinished = v.status === 3 || v.status === 4;
    const existingFinished = existing && (existing.status === 3 || existing.status === 4);
    if (!existing || (isFinished && !existingFinished)) {
      trailerMap[key] = { guid: v.guid, status: v.status };
    }
  }

  // 2. DB-н бүх кинонд тохирох trailer guid олж update
  const movies = await col('movies').find({}).toArray();
  const fixedList = [], skippedList = [];
  for (const movie of movies) {
    const key = (movie.title || '').trim().toLowerCase();
    const trailer = trailerMap[key];
    const correctId = trailer?.guid;
    if (correctId && movie.trailerVideoId !== correctId) {
      await col('movies').updateOne({ _id: movie._id }, { $set: { trailerVideoId: correctId } });
      fixedList.push({ title: movie.title, old: movie.trailerVideoId || null, new: correctId, status: trailer.status });
    } else {
      skippedList.push({ title: movie.title, reason: correctId ? 'already correct' : 'no trailer in Bunny', status: trailer?.status });
    }
  }

  res.json({ ok: true, fixed: fixedList.length, skipped: skippedList.length, fixedList, skippedList, totalBunnyVideos: allVideos.length });
});

app.delete('/api/movies/:id', async (req, res) => {
  await col('movies').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
});

// View count нэмэх
app.post('/api/movies/:id/view', async (req, res) => {
  await col('movies').updateOne({ _id: oid(req.params.id) }, { $inc: { views: 1 } });
  res.json({ ok: true });
});

/* ════════════════════════════════
   USERS
════════════════════════════════ */
app.get('/api/users', async (req, res) => {
  const users = await col('users').find({}, { projection: { password: 0 } }).toArray();
  res.json(users);
});

// Хэрэглэгчийн мэдээлэл (plan, planExpiry) авах
app.get('/api/users/me/:uid', async (req, res) => {
  const user = await col('users').findOne({ uid: req.params.uid }, { projection: { password: 0 } });
  if (!user) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });
  res.json(user);
});

// Firebase-р нэвтэрсэн хэрэглэгч sync
app.post('/api/users/sync', async (req, res) => {
  const { uid, name, email, photo, provider } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid шаардлагатай' });
  await col('users').updateOne(
    { uid },
    { $set: { uid, name, email, photo, provider, lastLogin: new Date() },
      $setOnInsert: { createdAt: new Date(), plan: 'free', totalPaid: 0 } },
    { upsert: true }
  );
  res.json({ ok: true });
});

// Admin эрх олгох / хасах
app.put('/api/users/:uid/role', async (req, res) => {
  const { isAdmin } = req.body;
  await col('users').updateOne(
    { uid: req.params.uid },
    { $set: { isAdmin: !!isAdmin } }
  );
  res.json({ ok: true });
});

/* ════════════════════════════════
   PAYMENTS
════════════════════════════════ */
app.get('/api/payments', async (req, res) => {
  const payments = await col('payments').find().sort({ date: -1 }).toArray();
  res.json(payments);
});

app.post('/api/payments', async (req, res) => {
  const payment = { ...req.body, date: new Date().toISOString().slice(0,10), status: 'pending' };
  const result = await col('payments').insertOne(payment);
  res.json({ ...payment, _id: result.insertedId });
});

/* ════════════════════════════════
   SETTINGS (үнэ, bunny, etc.)
════════════════════════════════ */
app.get('/api/settings', async (req, res) => {
  const settings = await col('settings').findOne({ _id: 'config' });
  res.json(settings || {});
});

app.put('/api/settings', async (req, res) => {
  const update = { ...req.body };
  delete update._id;
  await col('settings').updateOne(
    { _id: 'config' },
    { $set: update },
    { upsert: true }
  );
  // CDN config cache цэвэрлэх (шинэ key шууд хүчин төгөлдөр болно)
  _cdnCfgCache = null;
  if (typeof _thumbHost !== 'undefined') _thumbHost = null;
  res.json({ ok: true });
});

/* ════════════════════════════════
   EXPENSES
════════════════════════════════ */
app.get('/api/expenses', async (req, res) => {
  const expenses = await col('expenses').find().sort({ date: -1 }).toArray();
  res.json(expenses);
});

app.post('/api/expenses', async (req, res) => {
  const expense = { ...req.body, date: req.body.date || new Date().toISOString().slice(0,10) };
  const result = await col('expenses').insertOne(expense);
  res.json({ ...expense, _id: result.insertedId });
});

app.delete('/api/expenses/:id', async (req, res) => {
  await col('expenses').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
});

/* ════════════════════════════════
   BYL.MN PAYMENT
════════════════════════════════ */
const BYL_TOKEN      = process.env.BYL_TOKEN;
const BYL_PROJECT_ID = process.env.BYL_PROJECT_ID || '568';

// Invoice үүсгэж payment URL буцаана
app.post('/api/byl/checkout', async (req, res) => {
  const { plan, uid, movieId } = req.body;
  if (!plan || !uid) return res.status(400).json({ error: 'plan болон uid шаардлагатай' });
  if (!BYL_TOKEN)    return res.status(500).json({ error: 'BYL_TOKEN тохируулаагүй' });

  const planCfg = {
    monthly:   { amount: 12000, name: '1 Сарын Багц',  days: 30 },
    quarterly: { amount: 20000, name: '3 Сарын Багц',  days: 90 },
    movie:     { amount: 3400,  name: 'Дан Кино',      days: 2  },
  };
  // Settings + movie price fetched in parallel
  try {
    const [s, movie] = await Promise.all([
      col('settings').findOne({ _id: 'config' }),
      plan === 'movie' && movieId ? col('movies').findOne({ _id: oid(movieId) }) : null,
    ]);
    const pr = s?.prices || {};
    if (pr.monthly)   planCfg.monthly.amount   = pr.monthly;
    if (pr.quarterly) planCfg.quarterly.amount = pr.quarterly;
    if (pr.movie)     planCfg.movie.amount     = pr.movie;
    if (movie?.price > 0) {
      planCfg.movie.amount = movie.price;
      planCfg.movie.name   = movie.title || 'Дан Кино';
    }
  } catch (_) {}

  const p = planCfg[plan];
  if (!p) return res.status(400).json({ error: 'Буруу план' });

  try {
    const r = await fetch(`https://byl.mn/api/v1/projects/${BYL_PROJECT_ID}/invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BYL_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: p.amount,
        description: `NEW DRAMA · ${p.name}`,
        success_url:  'https://newdrama.mn/paid',
        redirect_url: 'https://newdrama.mn/paid',
        return_url:   'https://newdrama.mn/paid',
      }),
    });
    const data = await r.json();
    const inv = data.data || data;
    if (!inv?.url) return res.status(500).json({ error: 'Invoice үүсгэхэд алдаа', raw: data });

    await col('payments').insertOne({
      uid, plan, amount: p.amount, days: p.days,
      movieId: plan === 'movie' ? (movieId || null) : null,
      movieTitle: plan === 'movie' ? (p.name || 'Дан Кино') : null,
      status: 'pending',
      date: new Date().toISOString().slice(0, 10),
      bylInvoiceId: inv.id,
    });

    res.json({ url: inv.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Shared: payment баталгаажсан үед хэрэглэгчид эрх олгох ── */
async function grantAccess(payment) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + (payment.days || 30));

  if (payment.plan === 'movie') {
    // Дан кино: purchasedMovies array-д нэмнэ, subscription-г өөрчлөхгүй
    await col('users').updateOne(
      { uid: payment.uid },
      {
        $push: { purchasedMovies: {
          movieId:    payment.movieId || null,
          movieTitle: payment.movieTitle || 'Дан Кино',
          expiry,
          paidAt: new Date(),
        }},
        $inc: { totalPaid: payment.amount || 0 },
      }
    );
  } else {
    // Monthly / Quarterly: ерөнхий subscription тавина
    await col('users').updateOne(
      { uid: payment.uid },
      {
        $set: { plan: payment.plan, planExpiry: expiry },
        $inc: { totalPaid: payment.amount || 0 },
      }
    );
  }

  await col('payments').updateOne(
    { _id: payment._id },
    { $set: { status: 'paid', paidAt: new Date() } }
  );
}

// Webhook — byl.mn invoice.paid дуудна
app.post('/api/byl/webhook', async (req, res) => {
  try {
    const event = req.body;
    if (event.type === 'invoice.paid') {
      const invoiceId = event.data?.object?.id ?? event.data?.id;
      const payment   = invoiceId ? await col('payments').findOne({ bylInvoiceId: invoiceId }) : null;
      if (payment && payment.status !== 'paid') {
        await grantAccess(payment);
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook алдаа:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════
   BUNNY — Thumbnail proxy
   Pull zone нь referrer/token security-тай үед
   сервер дундуур дамжуулж браузерт өгнө
════════════════════════════════ */
let _thumbHost = null;  // in-memory cache for cdnHost
app.get('/api/thumb/:videoId', async (req, res) => {
  try {
    if (!_thumbHost) {
      const s = await col('settings').findOne({ _id: 'config' });
      _thumbHost = (s?.bunny?.cdnHost || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
    if (!_thumbHost) return res.status(404).end();
    const r = await fetch(
      `https://${_thumbHost}/${req.params.videoId}/thumbnail.jpg`,
      { headers: { 'Referer': 'https://newdrama.mn/', 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!r.ok) return res.status(r.status).end();
    const buf = await r.arrayBuffer();
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buf));
  } catch(e) { res.status(500).end(); }
});

/* ════════════════════════════════
   BUNNY — Video entry үүсгэх
════════════════════════════════ */
app.post('/api/bunny/create-video', async (req, res) => {
  const { title, libraryId, apiKey } = req.body;
  if (!libraryId || !apiKey) return res.status(400).json({ error: 'libraryId болон apiKey шаардлагатай' });
  try {
    const r = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: { 'AccessKey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled' })
    });
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════
   BUNNY — Видео устгах
════════════════════════════════ */
app.post('/api/bunny/delete-video', async (req, res) => {
  const { videoId, libraryId, apiKey } = req.body;
  if (!videoId || !libraryId || !apiKey)
    return res.status(400).json({ error: 'videoId, libraryId, apiKey шаардлагатай' });
  try {
    const r = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
      method: 'DELETE',
      headers: { 'AccessKey': apiKey, 'Accept': 'application/json' },
    });
    const data = await r.json().catch(() => ({}));
    res.json({ ok: true, bunny: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════
   BUNNY — Signed embed URL
   Token auth: SHA256(key + videoId + expiry), 4 цагийн хугацаа
════════════════════════════════ */
app.post('/api/bunny/signed-url', (req, res) => {
  const { videoId, libraryId } = req.body;
  if (!videoId || !libraryId) return res.status(400).json({ error: 'videoId, libraryId шаардлагатай' });

  const tokenKey = process.env.BUNNY_TOKEN_KEY;
  if (!tokenKey) {
    const url = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=true&responsive=true`;
    return res.json({ url });
  }

  const expiry = Math.floor(Date.now() / 1000) + 14400;
  const token  = crypto.createHash('sha256').update(tokenKey + videoId + expiry).digest('hex');
  const url    = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expiry}&autoplay=true&responsive=true`;
  res.json({ url });
});

/* ════════════════════════════════
   STREAM — IDM хамгаалалт
   Auth хэрэглэгчид жинхэнэ m3u8,
   IDM/бусад → хоосон (decoy) playlist
════════════════════════════════ */
const DECOY_M3U8 = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST';

// m3u8 proxy — Firebase ID token шалгаж жинхэнэ эсвэл decoy playlist буцаана
const FIREBASE_API_KEY = 'AIzaSyA_1-nW3tAA6G-VIe68lSWsQXmRjzvZxDM';
let _cdnCfgCache = null;
async function _getCdnCfg() {
  if (_cdnCfgCache) return _cdnCfgCache;
  const s = await col('settings').findOne({ _id: 'config' });
  const host = (s?.bunny?.cdnHost || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  // cdnTokenKey: MongoDB-д хадгална (env var байхгүй тохиолдолд)
  const key = s?.bunny?.cdnTokenKey || process.env.BUNNY_TOKEN_KEY || '';
  _cdnCfgCache = { host, key };
  return _cdnCfgCache;
}
function _signCdnUrl(cdnHost, urlPath, expiry, key) {
  if (!key) return `https://${cdnHost}${urlPath}`;
  // Bunny CDN token auth: SHA256(key + expiry + path) → base64url
  const raw = crypto.createHash('sha256').update(key + expiry + urlPath).digest('base64');
  const token = raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `https://${cdnHost}${urlPath}?token=${token}&expires=${expiry}`;
}
async function _bunnyFetch(path) {
  const { host: cdnHost, key } = await _getCdnCfg();
  const expiry = Math.floor(Date.now() / 1000) + 14400;
  const signed = _signCdnUrl(cdnHost, '/' + path, expiry, key);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(signed, {
      signal: ctrl.signal,
      headers: { 'Referer': 'https://iframe.mediadelivery.net/', 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(t);
    return r;
  } catch(e) {
    clearTimeout(t);
    throw e;
  }
}

// Debug — Bunny CDN fetch тест
app.get('/api/debug/stream/:videoId', async (req, res) => {
  try {
    const { host: cdnHost, key } = await _getCdnCfg();
    const path = `${req.params.videoId}/playlist.m3u8`;
    const expiry = Math.floor(Date.now() / 1000) + 14400;
    const signed = _signCdnUrl(cdnHost, '/' + path, expiry, key);
    const resp = await _bunnyFetch(path);
    const text = await resp.text();
    res.json({ cdnHost, hasKey: !!key, signed, status: resp.status, preview: text.slice(0, 300) });
  } catch(e) { res.json({ error: e.message }); }
});

// Master playlist — auth шалгана (subscribed) эсвэл free=1
app.get('/api/stream/:videoId/playlist.m3u8', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache');
  const isFree = req.query.free === '1';
  const idToken = req.headers['x-stream-token'] || req.query.t;

  if (!isFree) {
    // Firebase JWT: 3 хэсэгтэй (header.payload.signature)
    // IDM-д token байхгүй → DECOY буцаана
    if (!idToken || idToken.split('.').length !== 3) return res.send(DECOY_M3U8);
  }

  const { host: cdnHost } = await _getCdnCfg();
  if (!cdnHost) return res.status(500).end();
  const { videoId } = req.params;
  try {
    const resp = await _bunnyFetch(`${videoId}/playlist.m3u8`);
    if (!resp.ok) return res.status(resp.status).send(DECOY_M3U8);
    let content = await resp.text();
    // Quality m3u8 URL-уудыг серверийн прокси руу чиглүүлэх
    const suffix = isFree ? '?free=1' : '';
    content = content.replace(/^(?!#)(\S+\.m3u8\S*)$/gm,
      line => `/api/stream/${videoId}/${line.trim()}${suffix}`);
    res.send(content);
  } catch { res.send(DECOY_M3U8); }
});

// Quality sub-playlist — сегментийн URL-ыг манай серверийн proxy руу чиглүүлэх (CORS алдаагүй)
app.get('/api/stream/:videoId/:quality/video.m3u8', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-mpegURL');
  res.setHeader('Cache-Control', 'no-cache');
  const { videoId, quality } = req.params;
  const { host: cdnHost } = await _getCdnCfg();
  if (!cdnHost) return res.status(500).end();
  try {
    const resp = await _bunnyFetch(`${videoId}/${quality}/video.m3u8`);
    if (!resp.ok) return res.status(resp.status).end();
    let content = await resp.text();
    // Сегментийг серверээр дамжуулах → browser CDN-д шууд хандахгүй → CORS алдаагүй
    content = content.replace(/^(?!#)(\S+\.ts\S*)$/gm, line => {
      const seg = line.trim().split('?')[0]; // query param хасах
      return `/api/stream/${videoId}/${quality}/${seg}`;
    });
    res.send(content);
  } catch { res.status(500).end(); }
});

// Segment proxy — Bunny CDN-с татаж browser-д өгнө (same-origin → CORS алдаагүй)
app.get('/api/stream/:videoId/:quality/:segment', async (req, res) => {
  const { videoId, quality, segment } = req.params;
  if (!segment.endsWith('.ts')) return res.status(400).end();
  const { host: cdnHost, key } = await _getCdnCfg();
  if (!cdnHost) return res.status(500).end();
  const segPath = `/${videoId}/${quality}/${segment}`;
  const expiry = Math.floor(Date.now() / 1000) + 14400;
  const signedUrl = _signCdnUrl(cdnHost, segPath, expiry, key);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(signedUrl, {
      signal: ctrl.signal,
      headers: { 'Referer': 'https://iframe.mediadelivery.net/', 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(t);
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const buf = await r.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch { res.status(500).end(); }
});

/* ════════════════════════════════
   PAYMENTS — Manual approve
════════════════════════════════ */
app.post('/api/payments/:id/approve', async (req, res) => {
  try {
    const payment = await col('payments').findOne({ _id: oid(req.params.id) });
    if (!payment) return res.status(404).json({ error: 'Төлбөр олдсонгүй' });
    if (payment.status === 'paid') return res.json({ ok: true, already: true });

    await grantAccess(payment);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════
   PAID — byl.mn success_url redirect page (auto-closes tab)
════════════════════════════════ */
app.get('/paid', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Амжилттай</title></head>
<body style="background:#07070e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:1rem;">
<div style="font-size:3rem;">✅</div>
<div style="font-size:1.2rem;">Төлбөр амжилттай!</div>
<div style="color:#aaa;font-size:.9rem;">Таб автоматаар хаагдана...</div>
<script>window.close();</script>
</body></html>`);
});

// Локал орчинд шууд эхлүүлэх, Vercel-д module export хийнэ
if (require.main === module) {
  connect().catch(err => {
    console.error('MongoDB холбогдсонгүй:', err.message);
    process.exit(1);
  });
}

module.exports = app;
