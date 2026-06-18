const DATA_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const state = {
  filter: 'all',
  search: '',
  groupFilter: 'all',
  data: null,
  groupsCache: null,
  standingsCache: null,
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const FLAGS = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿',
  'Canada': '🇨🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭', 'Bosnia & Herzegovina': '🇧🇦',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷',
  'Germany': '🇩🇪', 'Ivory Coast': '🇨🇮', 'Curaçao': '🇨🇼', 'Ecuador': '🇪🇨',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾', 'Cape Verde': '🇨🇻',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
};

const PHASE_MAP = {
  'Round of 32': '32 Avos',
  'Round of 16': 'Oitavas',
  'Quarter-final': 'Quartas',
  'Semi-final': 'Semifinal',
  'Match for third place': '3º Lugar',
  'Final': 'Final',
};

const GROUP_NAMES = 'ABCDEFGHIJKL';

function extractGroups(matches) {
  const groups = {};
  const seen = {};
  matches.forEach(m => {
    if (!m.group) return;
    const gid = m.group.replace('Group ', '');
    if (!groups[gid]) groups[gid] = [];
    [m.team1, m.team2].forEach(t => {
      if (!seen[gid + ':' + t]) {
        seen[gid + ':' + t] = true;
        groups[gid].push(t);
      }
    });
  });
  return Object.entries(groups).map(([id, teams]) => ({ id, teams }));
}

function toBRT(timeStr, dateStr) {
  if (!timeStr || !dateStr) return null;
  const mt = timeStr.match(/(\d{2}):(\d{2})/);
  const tz = timeStr.match(/UTC([+-]\d+)/);
  if (!mt || !tz) return null;
  const h = parseInt(mt[1]), m = parseInt(mt[2]);
  const offset = parseInt(tz[1]);
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCHours(h - offset, m, 0, 0);
  return d;
}

function parseTime(timeStr, dateStr) {
  if (!timeStr) return { time: '', label: '' };
  const brt = toBRT(timeStr, dateStr);
  if (brt) {
    const brtLocal = new Date(brt.getTime() - 3 * 3600000);
    const h = String(brtLocal.getUTCHours()).padStart(2,'0');
    const m = String(brtLocal.getUTCMinutes()).padStart(2,'0');
    const label = `${h}:${m} BRT`;
    return { time: `${h}:${m}`, label };
  }
  const matchT = timeStr.match(/(\d{2}:\d{2})/);
  const time = matchT ? matchT[1] : '';
  return { time, label: time };
}

function parseScore(m) {
  if (m.score && m.score.ft) {
    const [home, away] = m.score.ft;
    if (typeof home === 'number' && typeof away === 'number') {
      return { home, away };
    }
  }
  return null;
}

function isPastMatch(m) {
  if (!m.date) return false;
  if (m.score) return true;
  const brt = toBRT(m.time, m.date);
  if (!brt) return false;
  return brt < new Date();
}

function isLiveMatch(m) {
  if (!m.date || !m.time) return false;
  if (m.score) return false;
  const brt = toBRT(m.time, m.date);
  if (!brt) return false;
  const now = Date.now();
  const start = brt.getTime();
  return now >= start && now <= start + 7200000;
}

function getFlag(name) {
  return FLAGS[name] || '🏳️';
}

function getPhase(m) {
  if (m.group) return m.group.replace('Group', 'Grupo').trim();
  return PHASE_MAP[m.round] || m.round;
}

function getRoundSortKey(round) {
  const order = [
    'Matchday 1','Matchday 2','Matchday 3','Matchday 4','Matchday 5','Matchday 6','Matchday 7',
    'Matchday 8','Matchday 9','Matchday 10','Matchday 11','Matchday 12','Matchday 13',
    'Matchday 14','Matchday 15','Matchday 16','Matchday 17',
    'Round of 32','Round of 16','Quarter-final','Semi-final','Match for third place','Final'
  ];
  const idx = order.indexOf(round);
  return idx >= 0 ? idx : 999;
}

function computeStandingsForGroup(gid, matches) {
  const groupMatches = matches.filter(m =>
    m.group === `Group ${gid}` && parseScore(m)
  );
  const teams = {};
  groupMatches.forEach(m => {
    [m.team1, m.team2].forEach(t => {
      if (!teams[t]) teams[t] = { name: t, points: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0 };
    });
  });
  groupMatches.forEach(m => {
    const s = parseScore(m);
    if (!s) return;
    const h = teams[m.team1], a = teams[m.team2];
    if (!h || !a) return;
    h.gf += s.home; h.ga += s.away;
    a.gf += s.away; a.ga += s.home;
    if (s.home > s.away) { h.points += 3; h.wins++; a.losses++; }
    else if (s.home < s.away) { a.points += 3; a.wins++; h.losses++; }
    else { h.points++; a.points++; h.draws++; a.draws++; }
  });
  Object.values(teams).forEach(t => { t.gd = t.gf - t.ga; });
  return Object.values(teams).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });
}

function computeTopScorers(rawMatches) {
  const players = {};
  rawMatches.forEach(m => {
    if (!m.score || !m.score.ft) return;
    const processGoals = (goals, team) => {
      if (!goals) return;
      goals.forEach(g => {
        if (!g.name) return;
        const key = g.name + '|' + team;
        if (!players[key]) {
          players[key] = { name: g.name, team, goals: 0 };
        }
        players[key].goals++;
      });
    };
    processGoals(m.goals1, m.team1);
    processGoals(m.goals2, m.team2);
  });

  return Object.values(players)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 3);
}

function resolveTeamName(placeholder, groups, matches) {
  if (!placeholder || placeholder.length < 2) return placeholder;
  if (placeholder.startsWith('W')) {
    const num = parseInt(placeholder.slice(1));
    const m = matches.find(x => x.num === num);
    if (m) {
      const s = parseScore(m);
      if (s) {
        const winner = s.home > s.away ? m.team1 : s.away > s.home ? m.team2 : null;
        if (winner) return winner;
      }
    }
    return `Vencedor #${num}`;
  }
  if (placeholder.startsWith('L')) {
    const num = parseInt(placeholder.slice(1));
    const m = matches.find(x => x.num === num);
    if (m) {
      const s = parseScore(m);
      if (s) {
        const loser = s.home < s.away ? m.team1 : s.away < s.home ? m.team2 : null;
        if (loser) return loser;
      }
    }
    return `Perdedor #${num}`;
  }
  if (/^\d+[A-Z]$/.test(placeholder)) {
    return `Classificado ${placeholder}`;
  }
  return placeholder;
}

function resolveAllKnockoutTeams(matches, groups) {
  const resolved = {};
  matches.forEach(m => {
    if (m.round !== 'Matchday 1' && m.round !== 'Matchday 2' && m.round !== 'Matchday 3' &&
        m.round !== 'Matchday 4' && m.round !== 'Matchday 5' && m.round !== 'Matchday 6' &&
        m.round !== 'Matchday 7' && m.round !== 'Matchday 8' && m.round !== 'Matchday 9' &&
        m.round !== 'Matchday 10' && m.round !== 'Matchday 11' && m.round !== 'Matchday 12' &&
        m.round !== 'Matchday 13' && m.round !== 'Matchday 14' && m.round !== 'Matchday 15' &&
        m.round !== 'Matchday 16' && m.round !== 'Matchday 17') {
      if (!m.team1_orig) m.team1_orig = m.team1;
      if (!m.team2_orig) m.team2_orig = m.team2;
      m.team1 = resolveTeamName(m.team1, groups, matches);
      m.team2 = resolveTeamName(m.team2, groups, matches);
    }
  });
}

async function fetchData() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return json;
  } catch (err) {
    console.error('Erro ao buscar dados:', err);
    return null;
  }
}

function transformMatches(raw) {
  const matches = raw.matches.map((m, idx) => {
    const parsed = parseTime(m.time, m.date);
    const groupId = m.group ? m.group.replace('Group ', '') : null;
    const roundKey = m.round;
    const slug = m.num
      ? `m${m.num}`
      : `${m.date}-${m.team1.replace(/[^a-zA-Z0-9]/g, '')}-${m.team2.replace(/[^a-zA-Z0-9]/g, '')}-${idx}`;
    const brtDate = (() => {
      const b = toBRT(m.time, m.date);
      if (!b) return m.date;
      const bl = new Date(b.getTime() - 3 * 3600000);
      const y = bl.getUTCFullYear();
      const mo = String(bl.getUTCMonth() + 1).padStart(2,'0');
      const d = String(bl.getUTCDate()).padStart(2,'0');
      return `${y}-${mo}-${d}`;
    })();

    return {
      id: m.num || `${m.date}-${m.team1}-${m.team2}`,
      slug,
      num: m.num,
      idx,
      group: groupId,
      phase: getPhase(m),
      round: m.round,
      roundKey: getRoundSortKey(m.round),
      home: m.team1,
      away: m.team2,
      date: m.date,
      brtDate,
      time: parsed.time,
      timeLabel: parsed.label,
      venue: m.ground || '',
      score: parseScore(m),
      raw: m,
    };
  });
  return matches;
}

function applyFilter(matches) {
  return matches.filter(m => {
    if (state.filter === 'grupo' && m.group) return true;
    if (state.filter === 'mata-mata' && !m.group) return true;
    if (state.filter === 'all') return true;
    return false;
  }).filter(m => {
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return m.home.toLowerCase().includes(q) || m.away.toLowerCase().includes(q) ||
           m.phase.toLowerCase().includes(q) || m.venue.toLowerCase().includes(q);
  });
}

function renderMatches() {
  const container = document.getElementById('matchesContainer');
  const all = applyFilter(state.data);

  const grouped = {};
  all.forEach(m => {
    const key = m.brtDate || m.date || 'unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  const sortedDates = Object.keys(grouped).sort();

  if (sortedDates.length === 0) {
    container.innerHTML = `<div class="loading-state"><p style="font-size:1.125rem;">Nenhum jogo encontrado</p><p style="color:var(--text-tertiary);font-size:0.875rem;">Tente ajustar os filtros</p></div>`;
    return;
  }

  container.innerHTML = sortedDates.map(date => {
    const fmt = formatDate(date);
    const matches = grouped[date].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return `
      <div class="match-day-group">
        <div class="match-day-header">
          <span class="match-day-date">${fmt.day} de ${fmt.month}</span>
          <span class="match-day-weekday">${fmt.week}</span>
          <span class="match-day-count">${matches.length} jogo${matches.length > 1 ? 's' : ''}</span>
        </div>
        <div class="match-cards">
          ${matches.map(m => renderMatchCard(m)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderMatchCard(m) {
  const past = !!m.score;
  const live = isLiveMatch(m.raw);
  const scoreText = m.score ? `${m.score.home} - ${m.score.away}` : 'x';
  const scoreClass = m.score ? '' : 'match-score--tbd';

  let classes = 'match-card';
  if (live) classes += ' match-card--live';
  else if (past) classes += ' match-card--past';

  const detailUrl = `jogo.html?slug=${encodeURIComponent(m.slug)}`;

  return `
    <a href="${detailUrl}" class="${classes}" style="animation-delay:${((m.num || m.idx) % 10) * 40}ms;text-decoration:none;color:inherit;display:grid;">
      <div class="match-team match-team--home">
        <span class="match-team-name">${m.home}</span>
        <span class="match-team-flag">${getFlag(m.home)}</span>
      </div>
      <div class="match-center">
        <span class="match-phase">${m.phase}</span>
        <div class="match-score ${scoreClass}">${scoreText}</div>
        <div class="match-time ${live ? 'match-time--live' : ''}">${live ? 'Ao Vivo' : m.timeLabel || ''}</div>
        <div class="match-venue">${m.venue}</div>
        <div class="match-watch-btn">${!past ? 'Assistir' : 'Detalhes'}</div>
      </div>
      <div class="match-team match-team--away">
        <span class="match-team-flag">${getFlag(m.away)}</span>
        <span class="match-team-name">${m.away}</span>
      </div>
    </a>
  `;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'unknown') return { week: '', day: '??', month: '??' };
  const d = new Date(dateStr + 'T12:00:00');
  const week = WEEKDAYS[d.getDay()];
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTHS[d.getMonth()];
  return { week, day, month };
}

function formatDateBRT(dateStr, timeStr) {
  if (!dateStr) return formatDate(dateStr);
  const brt = toBRT(timeStr, dateStr);
  if (!brt) return formatDate(dateStr);
  const brtLocal = new Date(brt.getTime() - 3 * 3600000);
  const week = WEEKDAYS[brtLocal.getUTCDay()];
  const day = String(brtLocal.getUTCDate()).padStart(2, '0');
  const month = MONTHS[brtLocal.getUTCMonth()];
  return { week, day, month };
}

function renderStandings() {
  const container = document.getElementById('standingsContainer');
  const groups = state.groupFilter === 'all'
    ? state.groupsCache
    : state.groupsCache.filter(g => g.id === state.groupFilter);

  container.innerHTML = groups.map(group => {
    const standings = computeStandingsForGroup(group.id, state.data);
    const hasMatches = standings.some(t => t.wins > 0 || t.draws > 0 || t.losses > 0);
    return `
      <div class="standings-card">
        <div class="standings-card-header">
          <span>Grupo ${group.id}</span>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>P</th>
              <th>V</th>
              <th>E</th>
              <th>D</th>
              <th>SG</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map((t, i) => `
              <tr>
                <td><span class="standings-pos standings-pos--${i + 1}">${i + 1}</span></td>
                <td>
                  <div class="team-cell">
                    <span class="team-flag">${getFlag(t.name)}</span>
                    ${t.name}
                    ${i < 2 && hasMatches ? '<span style="margin-left:auto;font-size:0.625rem;color:var(--green);background:var(--green-bg);padding:1px 6px;border-radius:100px;font-weight:600;">Zona</span>' : ''}
                  </div>
                </td>
                <td class="standings-points">${t.points}</td>
                <td>${t.wins}</td>
                <td>${t.draws}</td>
                <td>${t.losses}</td>
                <td>${t.gd > 0 ? '+' : ''}${t.gd}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

function renderTopScorers() {
  const container = document.getElementById('scorersContainer');
  const top = computeTopScorers(state.data.map(m => m.raw));

  if (top.length === 0) {
    container.innerHTML = `<div class="loading-state"><p style="color:var(--text-tertiary);">Nenhum gol marcado até o momento</p></div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  container.innerHTML = `
    <div class="scorers-podium">
      ${top.map((p, i) => {
        const position = i;
        const isFirst = i === 0;
        return `
          <div class="scorer-card ${isFirst ? 'scorer-card--gold' : ''}">
            <div class="scorer-medal">${medals[i]}</div>
            <div class="scorer-position">${i + 1}º</div>
            <div class="scorer-name">${p.name}</div>
            <div class="scorer-team">
              <span class="team-flag">${getFlag(p.team)}</span>
              ${p.team}
            </div>
            <div class="scorer-goals">
              <span class="scorer-goals-count">${p.goals}</span>
              <span class="scorer-goals-label">gol${p.goals > 1 ? 's' : ''}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStats() {
  const container = document.getElementById('statsGrid');
  const played = state.data.filter(m => m.score);
  const totalGoals = played.reduce((sum, m) => sum + m.score.home + m.score.away, 0);
  const avgGoals = played.length ? (totalGoals / played.length).toFixed(1) : '0';
  const pastDates = [...new Set(played.map(m => m.date))].length;

  const goalCounts = {};
  played.forEach(m => {
    goalCounts[m.home] = (goalCounts[m.home] || 0) + m.score.home;
    goalCounts[m.away] = (goalCounts[m.away] || 0) + m.score.away;
  });
  const topScorers = Object.entries(goalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const winCounts = {};
  played.forEach(m => {
    if (m.score.home !== m.score.away) {
      const winner = m.score.home > m.score.away ? m.home : m.away;
      winCounts[winner] = (winCounts[winner] || 0) + 1;
    }
  });
  const mostWins = Object.entries(winCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const cleanSheets = {};
  played.forEach(m => {
    if (m.score.home === 0) cleanSheets[m.away] = (cleanSheets[m.away] || 0) + 1;
    if (m.score.away === 0) cleanSheets[m.home] = (cleanSheets[m.home] || 0) + 1;
  });
  const topCleanSheets = Object.entries(cleanSheets).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const totalCards = Math.floor(played.length * 2.3);

  container.innerHTML = `
    <div class="stat-card">
      <span class="stat-card-icon">⚽</span>
      <div class="stat-card-title">Total de Gols</div>
      <div class="stat-card-value">${totalGoals}</div>
      <div class="stat-card-desc">Média de ${avgGoals} gols/jogo (${played.length} jogos)</div>
    </div>
    <div class="stat-card">
      <span class="stat-card-icon">📅</span>
      <div class="stat-card-title">Dias de Jogo</div>
      <div class="stat-card-value">${pastDates}</div>
      <div class="stat-card-desc">Dias com partidas realizadas</div>
    </div>
    <div class="stat-card">
      <span class="stat-card-icon">🏆</span>
      <div class="stat-card-title">Artilharia</div>
      <div class="stat-card-value">${topScorers[0] ? topScorers[0][1] : 0}</div>
      <div class="stat-card-desc">Maior pontaria: ${topScorers[0] ? topScorers[0][0] : '—'}</div>
      <ul class="stat-card-list">
        ${topScorers.slice(1).map(([team, goals]) => `
          <li><span class="team-info"><span class="team-flag">${getFlag(team)}</span> ${team}</span><span class="stat-num">${goals}</span></li>
        `).join('')}
      </ul>
    </div>
    <div class="stat-card">
      <span class="stat-card-icon">🛡️</span>
      <div class="stat-card-title">Defesas Invictas</div>
      <div class="stat-card-value">${topCleanSheets[0] ? topCleanSheets[0][1] : 0}</div>
      <div class="stat-card-desc">Mais jogos sem sofrer gols</div>
      <ul class="stat-card-list">
        ${topCleanSheets.map(([team, cs]) => `
          <li><span class="team-info"><span class="team-flag">${getFlag(team)}</span> ${team}</span><span class="stat-num">${cs}</span></li>
        `).join('')}
      </ul>
    </div>
    <div class="stat-card">
      <span class="stat-card-icon">💪</span>
      <div class="stat-card-title">Mais Vitórias</div>
      <div class="stat-card-value">${mostWins[0] ? mostWins[0][1] : 0}</div>
      <div class="stat-card-desc">Time com mais vitórias</div>
      <ul class="stat-card-list">
        ${mostWins.slice(0, 4).map(([team, wins]) => `
          <li><span class="team-info"><span class="team-flag">${getFlag(team)}</span> ${team}</span><span class="stat-num">${wins}</span></li>
        `).join('')}
      </ul>
    </div>
    <div class="stat-card">
      <span class="stat-card-icon">🟨</span>
      <div class="stat-card-title">Cartões</div>
      <div class="stat-card-value">${totalCards}</div>
      <div class="stat-card-desc">Estimativa baseada em jogos realizados</div>
    </div>
  `;
}

function updateHeroStats() {
  const played = state.data.filter(m => m.score);
  const totalGoals = played.reduce((sum, m) => sum + m.score.home + m.score.away, 0);
  document.getElementById('totalMatches').textContent = state.data.length;
  document.getElementById('totalGoals').textContent = totalGoals;
  document.getElementById('playedMatches').textContent = played.length;
}

function setupFilters() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      if (state.data) renderMatches();
    });
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    if (state.data) renderMatches();
  });
}

function setupGroupFilters() {
  const container = document.getElementById('groupFilter');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.groupFilter = btn.dataset.group;
      if (state.data) renderStandings();
    });
  });

  for (let i = 0; i < 12; i++) {
    const gid = GROUP_NAMES[i];
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.group = gid;
    btn.textContent = `Grupo ${gid}`;
    container.appendChild(btn);
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.groupFilter = gid;
      if (state.data) renderStandings();
    });
  }
}

function setupThemeToggle() {
  const toggle = document.querySelector('.theme-toggle');
  const html = document.documentElement;
  const saved = localStorage.getItem('theme');
  if (saved) html.setAttribute('data-theme', saved);

  toggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

function setupMobileNav() {
  const btn = document.querySelector('.nav-mobile');
  const links = document.querySelector('.nav-links');
  btn.addEventListener('click', () => links.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => links.classList.remove('open'));
  });
}

function setupNavScroll() {
  const links = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => {
          l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`);
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-80px 0px 0px 0px' });

  sections.forEach(s => observer.observe(s));

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function initApp() {
  setupThemeToggle();
  setupMobileNav();
  setupNavScroll();
  setupFilters();
  setupGroupFilters();

  const container = document.getElementById('matchesContainer');
  container.innerHTML = `<div class="loading-state"><div class="loader"></div><p>Carregando dados oficiais da Copa 2026...</p></div>`;

  const raw = await fetchData();
  if (!raw) {
    container.innerHTML = `<div class="loading-state"><p style="color:var(--red);font-size:1.125rem;">Erro ao carregar dados</p><p style="color:var(--text-tertiary);">Tente recarregar a página</p></div>`;
    return;
  }

  const groups = extractGroups(raw.matches);
  state.groupsCache = groups;

  resolveAllKnockoutTeams(raw.matches, groups);
  state.data = transformMatches(raw);
  state.data.sort((a, b) => {
    const da = a.date || '', db = b.date || '';
    if (da !== db) return da.localeCompare(db);
    const ra = a.roundKey || 0, rb = b.roundKey || 0;
    if (ra !== rb) return ra - rb;
    return (a.time || '').localeCompare(b.time || '');
  });

  updateHeroStats();
  renderMatches();
  renderStandings();
  renderTopScorers();
  renderStats();
  window.initAds?.();
}

document.addEventListener('DOMContentLoaded', initApp);
