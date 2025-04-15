const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

const matches = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matches.json')));

app.get('/', (req, res) => {
  res.render('index', { matches: JSON.stringify(matches) });
});

app.get('/match/:id', (req, res) => {
  const matchId = req.params.id;

  // matches はすでにオブジェクトである前提
  const match = Object.entries(matches).flatMap(([league, sections]) =>
    Object.entries(sections).flatMap(([section, data]) =>
      data.matches.map(m => ({ ...m, league, section }))
    )
  ).find(m => m.id === matchId);

  if (!match) {
    return res.status(404).send("試合が見つかりませんでした");
  }

  const voted = req.session.voted?.[match.id] || {};
  const now = Date.now();
  const expired = match.deadline && now > new Date(match.deadline).getTime();

  res.render('vote_match', { match, voted, expired });
});


app.post('/vote/:id', (req, res) => {
  const { id } = req.params;
  const { team, player } = req.body;

  const match = Object.entries(matches).flatMap(([league, sections]) =>
    Object.entries(sections).flatMap(([section, data]) =>
      data.matches.map(m => ({ ...m, league, section }))
    )
  ).find(m => m.id === id);

  if (!match) return res.status(404).send("試合が見つかりません");

  if (!req.session.voted) req.session.voted = {};
  if (!req.session.voted[id]) req.session.voted[id] = {};
  if (req.session.voted[id][team]) {
    return res.send('すでに投票済みです。');
  }

  req.session.voted[id][team] = true;

  const filePath = path.join(__dirname, 'data', 'votes', `${id}-${team}.json`);
  let votes = {};
  if (fs.existsSync(filePath)) {
    votes = JSON.parse(fs.readFileSync(filePath));
  }
  votes[player] = (votes[player] || 0) + 1;
  fs.writeFileSync(filePath, JSON.stringify(votes, null, 2));

  if (!req.session.history) req.session.history = [];
  req.session.history.push({ match: `${match.section} ${match.home} vs ${match.away}`, player });

  // ✅ 結果ページに遷移
  res.redirect(`/result/${id}`);
});


app.get('/result/:id', (req, res) => {
  const { id } = req.params;

  const match = Object.entries(matches).flatMap(([league, sections]) =>
    Object.entries(sections).flatMap(([section, data]) =>
      data.matches.map(m => ({ ...m, league, section }))
    )
  ).find(m => m.id === id);

  if (!match) return res.status(404).send("試合が見つかりません");

  const homePath = path.join(__dirname, 'data', 'votes', `${id}-home.json`);
  const awayPath = path.join(__dirname, 'data', 'votes', `${id}-away.json`);
  const homeVotes = fs.existsSync(homePath) ? JSON.parse(fs.readFileSync(homePath)) : {};
  const awayVotes = fs.existsSync(awayPath) ? JSON.parse(fs.readFileSync(awayPath)) : {};

  const getTopPlayer = votes => Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topHome = getTopPlayer(homeVotes);
  const topAway = getTopPlayer(awayVotes);

  res.render('results', {
    homeVotes,
    awayVotes,
    match,
    topHome,
    topAway
  });
});


app.get('/history', (req, res) => {
  const history = req.session.history || [];
  res.render('history', { history });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
