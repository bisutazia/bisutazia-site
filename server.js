const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const matches = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));


app.get('/', (req, res) => {
  res.render('index', { matches });
});

app.get('/match/:id', (req, res) => {
  const match = matches.find(m => m.id === req.params.id);
  const voted = req.session.voted?.[match.id] || {};
  const now = Date.now();
  const expired = match.deadline && now > new Date(match.deadline).getTime();
  res.render('vote_match', { match, voted, expired });
});

app.post('/vote/:id', (req, res) => {
  const matchId = req.params.id;
  const team = req.body.team;
  const player = req.body.player;
  const match = matches.find(m => m.id === matchId);

  if (match.deadline && Date.now() > new Date(match.deadline).getTime()) {
    return res.send('この試合の投票は終了しました。');
  }

  if (!req.session.voted) req.session.voted = {};
  if (!req.session.voted[matchId]) req.session.voted[matchId] = {};
  if (req.session.voted[matchId][team]) {
    return res.send(`すでに${team === 'home' ? 'ホーム' : 'アウェイ'}に投票済みです`);
  }
  req.session.voted[matchId][team] = true;

  const filePath = `./data/votes/${matchId}-${team}.json`;
  let votes = {};
  if (fs.existsSync(filePath)) {
    votes = JSON.parse(fs.readFileSync(filePath));
  }
  votes[player] = (votes[player] || 0) + 1;
  fs.writeFileSync(filePath, JSON.stringify(votes));

  if (!req.session.history) req.session.history = [];
  req.session.history.push({ player });

  res.redirect(`/result/${matchId}?voted=${team}`);
});

app.get('/result/:id', (req, res) => {
  const matchId = req.params.id;
  const homeFile = `./data/votes/${matchId}-home.json`;
  const awayFile = `./data/votes/${matchId}-away.json`;

  // ファイルがない時もエラーにならない安全版
  const homeVotes = fs.existsSync(homeFile) ? JSON.parse(fs.readFileSync(homeFile)) : {};
  const awayVotes = fs.existsSync(awayFile) ? JSON.parse(fs.readFileSync(awayFile)) : {};

  const match = matches.find(m => m.id === matchId);
  
  // SNS共有に必要なラベルを設定
  match.vote_label = "ピカイチ";

  // 各チームの最多得票選手
  const getTop = votes => Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  const topHome = getTop(homeVotes);
  const topAway = getTop(awayVotes);

  const justVoted = req.query.voted || null;

  // テンプレートに渡す
  res.render('results', { homeVotes, awayVotes, match, justVoted, topHome, topAway });
});


app.get('/history', (req, res) => {
  const history = req.session.history || [];
  res.render('history', { history });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on port ${port}`));
