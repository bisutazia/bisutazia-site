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
  res.render('index', { matches });
});

app.get('/match/:id', (req, res) => {
  const match = Object.values(matches).flatMap(season => Object.values(season).flat())
    .find(m => m.id === req.params.id);
  const voted = req.session.voted?.[match.id] || {};
  const expired = match.deadline && (Date.now() > new Date(match.deadline).getTime());
  res.render('vote_match', { match, voted, expired });
});

app.post('/vote/:id', (req, res) => {
  const { id } = req.params;
  const { team, player } = req.body;

  const match = Object.values(matches).flatMap(season => Object.values(season).flat())
    .find(m => m.id === id);

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
  req.session.history.push({ match: `${match.home} vs ${match.away}`, player });

  res.redirect(`/result/${id}?voted=${team}`);
});

app.get('/result/:id', (req, res) => {
  const { id } = req.params;
  const match = Object.values(matches).flatMap(season => Object.values(season).flat())
    .find(m => m.id === id);

  const homeVotesPath = path.join(__dirname, 'data', 'votes', `${id}-home.json`);
  const awayVotesPath = path.join(__dirname, 'data', 'votes', `${id}-away.json`);

  const homeVotes = fs.existsSync(homeVotesPath) ? JSON.parse(fs.readFileSync(homeVotesPath)) : {};
  const awayVotes = fs.existsSync(awayVotesPath) ? JSON.parse(fs.readFileSync(awayVotesPath)) : {};

  const getTopPlayer = votes => Object.entries(votes).sort(([, a], [, b]) => b - a)[0]?.[0] || 'なし';

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
