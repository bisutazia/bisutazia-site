let chart;

document.addEventListener('DOMContentLoaded', () => {
  const ctx = document.getElementById('voteChart').getContext('2d');
  const raw = JSON.parse(document.getElementById('chartData').textContent);

  // 初期表示（ホーム）
  renderChart('home', raw, ctx);
  
  // グローバル関数としてボタン切替を使えるように
  window.showChart = function (mode) {
    if (chart) chart.destroy();
    renderChart(mode, raw, ctx);
  };
});

function renderChart(type, data, ctx) {
  const votes = data[type];
  const labels = Object.keys(votes);
  const values = Object.values(votes);

  // 🔽 ここに新しい処理を追加
  const meta = JSON.parse(document.getElementById('chartMeta').textContent);
  const homeTeam = meta.homeTeam;
  const awayTeam = meta.awayTeam;

  const teamColors = {
    '横浜F・マリノス': 'rgba(0, 66, 133, 0.6)',
    '川崎フロンターレ': 'rgba(14, 171, 215, 0.93)',
    '浦和レッズ': 'rgba(254, 0, 0, 0.6)',
    '鹿島アントラーズ': 'rgba(172, 0, 60, 0.6)'
  };

  const selectedTeam = type === 'home' ? homeTeam : awayTeam;
  const backgroundColor = teamColors[selectedTeam] || 'rgba(128, 128, 128, 0.6)';
  const borderColor = backgroundColor.replace('0.6', '1');

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: type === 'home' ? 'ホーム票' : 'アウェイ票',
        data: values,
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: type === 'home' ? `${homeTeam} の投票結果` : `${awayTeam} の投票結果`
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '票数'
          }
        },
        x: {
          title: {
            display: true,
            text: '選手名'
          }
        }
      }
    }
  };

  chart = new Chart(ctx, config);
}
