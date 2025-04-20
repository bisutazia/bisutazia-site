const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // ← .env を読み込むために必須

const admin = require('firebase-admin');
const FirebaseStore = require('connect-session-firebase')(session);

// ✅ .env の内容を変数にマッピング
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // ←ここ重要
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();


const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  store: new FirebaseStore({
    database: admin.firestore()
  }),
  secret: 'your_secret_key',  // ⚠️ 長くてランダムな文字列を推奨
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24  // 1日有効
  }
}));

app.set('view engine', 'ejs');

// ... ここからは既存のルーティングコード（app.get('/', ...など）を続けて記述 ...


app.get('/', (req, res) => {
  const matches = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));
  res.render('index', { matches }); // ←これ重要
});



app.get('/match/:id', (req, res) => {
  const matchId = req.params.id;
  const matchesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));

  let targetMatch = null;
  for (const league of Object.values(matchesData)) {
    for (const section of Object.values(league)) {
      if (Array.isArray(section.matches)) {
        const found = section.matches.find(m => m.id === matchId);
        if (found) {
          targetMatch = found;
          break;
        }
      }
    }
    if (targetMatch) break;
  }

  if (!targetMatch) {
    return res.status(404).send("試合が見つかりませんでした");
  }

  const voted = req.session.voted?.[targetMatch.id] || {};
  const now = Date.now();
  const expired = targetMatch.deadline && now > new Date(targetMatch.deadline).getTime();

  res.render('vote_match', { match: targetMatch, voted, expired });
});



app.post('/vote/:id', (req, res) => {
  const { id } = req.params;
  const { team, player } = req.body;

  const matchesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));
  let match = null;

  for (const league of Object.values(matchesData)) {
    for (const section of Object.values(league)) {
      if (Array.isArray(section.matches)) {
        const found = section.matches.find(m => m.id === id);
        if (found) {
          match = found;
          break;
        }
      }
    }
    if (match) break;
  }

  if (!match) {
    return res.status(404).send("試合が見つかりません");
  }

  if (match.deadline && Date.now() > new Date(match.deadline).getTime()) {
    return res.send("この試合の投票は締め切られました。");
  }

  if (!req.session.voted) req.session.voted = {};
  if (!req.session.voted[id]) req.session.voted[id] = {};
  if (req.session.voted[id][team]) {
    return res.send(`すでに${team === 'home' ? 'ホーム' : 'アウェイ'}に投票済みです`);
  }

  req.session.voted[id][team] = true;
  // Firestore に保存する
db.collection('votes').add({
  matchId: id,
  team: team,
  player: player,
  timestamp: admin.firestore.FieldValue.serverTimestamp()
}).then(() => {
  console.log('✅ Firestore に保存完了');
}).catch(err => {
  console.error('❌ Firestore 保存エラー:', err);
});



  const filePath = path.join(__dirname, 'data', 'votes', `${id}-${team}.json`);
  let votes = {};
  if (fs.existsSync(filePath)) {
    votes = JSON.parse(fs.readFileSync(filePath));
  }
  votes[player] = (votes[player] || 0) + 1;
  fs.writeFileSync(filePath, JSON.stringify(votes, null, 2));

  // ファイル保存後などの処理の後に追記

  const firebaseRef = db.ref(`votes/${id}/${team}/${player}`);
  firebaseRef.transaction(current => (current || 0) + 1);


  if (!req.session.history) req.session.history = [];
  req.session.history.push({ match: `${match.home} vs ${match.away}`, player });

  res.redirect(`/result/${id}?voted=${team}`);
});



app.get('/result/:id', (req, res) => {
  const { id } = req.params;

  const matchesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));
  let match = null;

  for (const league of Object.values(matchesData)) {
    for (const section of Object.values(league)) {
      if (Array.isArray(section.matches)) {
        const found = section.matches.find(m => m.id === id);
        if (found) {
          match = found;
          break;
        }
      }
    }
    if (match) break;
  }

  if (!match) {
    return res.status(404).send("試合が見つかりませんでした");
  }

  const homePath = path.join(__dirname, 'data', 'votes', `${id}-home.json`);
  const awayPath = path.join(__dirname, 'data', 'votes', `${id}-away.json`);

  const homeVotes = fs.existsSync(homePath) ? JSON.parse(fs.readFileSync(homePath)) : {};
  const awayVotes = fs.existsSync(awayPath) ? JSON.parse(fs.readFileSync(awayPath)) : {};

  const getTopPlayer = votes => Object.entries(votes).sort(([, a], [, b]) => b - a)[0]?.[0] || '';

  const topHome = getTopPlayer(homeVotes);
  const topAway = getTopPlayer(awayVotes);

  res.render('results', { homeVotes, awayVotes, match, topHome, topAway });
});



app.get('/history', (req, res) => {
  const history = req.session.history || [];
  res.render('history', { history });
});








// Render では必ず環境変数 PORT が渡される想定なので、ここは必須に
const port = process.env.PORT;
if (!port) {
  throw new Error('❌ PORT が定義されていません');
}
app.listen(port, () => console.log(`Server running on port ${port}`));

