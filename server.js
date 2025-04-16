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

  const filePath = path.join(__dirname, 'data', 'votes', `${id}-${team}.json`);
  let votes = {};
  if (fs.existsSync(filePath)) {
    votes = JSON.parse(fs.readFileSync(filePath));
  }
  votes[player] = (votes[player] || 0) + 1;
  fs.writeFileSync(filePath, JSON.stringify(votes, null, 2));

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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
