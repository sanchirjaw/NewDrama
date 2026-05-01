require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');
const express    = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors       = require('cors');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.DB_NAME || 'newdrama';

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

connect().catch(err => {
  console.error('MongoDB холбогдсонгүй:', err.message);
  process.exit(1);
});
