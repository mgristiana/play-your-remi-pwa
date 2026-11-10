
    const state = {
        page: 'home',
        home: null,
        history: [],
        game: null,
        detail: null,
        modal: false,
        confirm: null,
        roundNotice: null,
        pendingRoundNotice: null,
        roundPage: 0,
        historyPage: 0,
        historyPageAnimate: false,
        animatePage: false,
        animateCeremony: false,
        nameEntrance: false,
        scoreAnimation: null,
        roundTransition: false,
        roundTransitionTitle: 'Putaran berikutnya',
        pendingRanking: null,
        deleteGameId: null,
        nameIndex: 0,
        ruleMode: 'with-cut',
        scoreSheetScrollY: 0,
        loading: false
    };
    const app = document.getElementById('app');
    function syncVisualViewport() {
        const viewport = window.visualViewport;
        if (!viewport) return;
        document.documentElement.style.setProperty('--visual-height', `${viewport.height}px`);
        document.documentElement.style.setProperty('--visual-top', `${viewport.offsetTop}px`)
    }
    syncVisualViewport();
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncVisualViewport);
        window.visualViewport.addEventListener('scroll', syncVisualViewport)
    }
    document.addEventListener('focusin', event => {
        if (event.target.matches('input, textarea')) document.body.classList.add('keyboard-open')
    });
    document.addEventListener('focusout', event => {
        if (event.target.matches('input, textarea')) setTimeout(() => {
            if (!document.activeElement || !document.activeElement.matches('input, textarea')) document.body.classList.remove('keyboard-open')
        }, 120)
    });
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
    const dateLabel = value => {
        if (!value)
            return 'Baru saja';
        const d = new Date(value);
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(d)
    };
    const safeScore = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    function server(method, arg) {
        if (!(window.google && google.script && google.script.run))
            return Promise.resolve().then(() => localServer(method, arg));
        return new Promise((resolve, reject) => {
            let runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(e => reject(new Error(e && e.message || 'Terjadi kendala.')));
            if (arg === undefined)
                runner[method]();
            else
                runner[method](arg)
        })
    }
    function toast(message) {
        const old = document.querySelector('.toast');
        if (old)
            old.remove();
        const node = document.createElement('div');
        node.className = 'toast';
        node.textContent = message;
        document.body.appendChild(node);
        setTimeout(() => node.remove(), 2500)
    }
    function fail(error) {
        state.loading = false;
        toast(error.message || 'Terjadi kendala.');
        render()
    }
    const localDbKey = 'play-your-remi-preview-v1';
    async function readLocalGames() {
        if (window.remiStorage)
            return window.remiStorage.readGames();
        try {
            return JSON.parse(localStorage.getItem(localDbKey) || '[]')
        } catch (e) {
            return []
        }
    }
    async function writeLocalGames(games) {
        if (window.remiStorage)
            await window.remiStorage.writeGames(games);
        else
            localStorage.setItem(localDbKey, JSON.stringify(games));
    }
    function rankLocal(game) {
        return game.players.slice().sort((a, b) => b.totalScore - a.totalScore).map((p, i) => ({
            playerId: p.playerId,
            playerName: p.playerName,
            totalScore: p.totalScore,
            rank: i + 1,
            seat: p.seat
        }))
    }
    function normalizeStandingOrder(game) {
        let order = game.players.slice().sort((a, b) => Number(a.seat) - Number(b.seat)).map(p => p.playerId);
        const priorRounds = game.rounds.filter(r => r.status === 'ended').slice().sort((a, b) => a.roundNumber - b.roundNumber);
        priorRounds.forEach(round => {
            const startingScores = new Map(round.scores.map(score => [score.playerId, safeScore(score.scoreBefore)]));
            const savedOrder = Array.isArray(round.standingOrderBefore) ? round.standingOrderBefore.filter(id => game.players.some(player => player.playerId === id)) : [];
            if (savedOrder.length === game.players.length) {
                order = savedOrder
            } else {
                order.sort((a, b) => (startingScores.get(b) ?? 0) - (startingScores.get(a) ?? 0))
            }
            const totals = new Map(round.scores.map(score => [score.playerId, safeScore(score.scoreAfter)]));
            order.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
        });
        const players = new Map(game.players.map(player => [player.playerId, player]));
        game.players = order.map(id => players.get(id)).filter(Boolean)
    }
    function localView(game) {
        const active = game.rounds.find(r => r.status === 'active');
        const results = rankLocal(game);
        const roundHistory = game.rounds.filter(r => r.status === 'ended').map(r => ({
            roundNumber: r.roundNumber,
            players: game.players.map(p => {
                const s = r.scores.find(x => x.playerId === p.playerId);
                const resetBy = game.players.find(x => x.playerId === s.resetByPlayerId);
                return {
                    playerId: p.playerId,
                    playerName: p.playerName,
                    pointsDelta: s.pointsDelta || 0,
                    pointChanges: (s.pointChanges && s.pointChanges.length ? s.pointChanges : [s.pointsDelta || 0]),
                    scoreAfter: s.scoreAfter,
                    resetApplied: !!s.resetApplied,
                    resetByPlayerId: s.resetByPlayerId || '',
                    resetByPlayerName: resetBy ? resetBy.playerName : ''
                }
            })
        }));
        const last = roundHistory.length ? roundHistory[roundHistory.length - 1] : null;
        return {
            gameId: game.gameId,
            ruleMode: game.ruleMode || 'with-cut',
            status: game.status,
            createdAt: game.createdAt,
            endedAt: game.endedAt,
            roundNumber: active ? active.roundNumber : game.roundCount,
            playerCount: game.players.length,
            players: game.players.map(p => {
                const entry = active && active.scores.find(s => s.playerId === p.playerId);
                return {
                    playerId: p.playerId,
                    playerName: p.playerName,
                    seat: p.seat,
                    totalScore: p.totalScore,
                    scoreBefore: entry ? entry.scoreBefore : p.totalScore,
                    scored: !!entry && entry.pointsDelta !== null,
                    pointsDelta: entry && entry.pointsDelta !== null ? entry.pointsDelta : null
                }
            }),
            roundHistory,
            lastRoundResets: last ? last.players.filter(p => p.resetApplied).map(p => ({
                playerId: p.playerId,
                playerName: p.playerName,
                resetByPlayerId: p.resetByPlayerId,
                resetByPlayerName: p.resetByPlayerName
            })) : [],
            results,
            winnerPlayerId: game.winnerPlayerId || '',
            loserPlayerId: game.loserPlayerId || ''
        }
    }
    function localFinish(game, forceEnd) {
        const round = game.rounds.find(r => r.status === 'active');
        if (!round)
            throw new Error('Tidak ada putaran aktif.');
        round.scores.filter(s => s.pointsDelta === null).forEach(s => s.pointsDelta = 0);
        const finals = {}, resetBy = {};
        round.scores.forEach(s => { finals[s.playerId] = s.scoreBefore + s.pointsDelta });
        const events = Array.isArray(round.scoreEvents) ? round.scoreEvents : [];
        const cutBaseline = Object.fromEntries(round.scores.map(score => [score.playerId, Number(score.scoreBefore) || 0]));
        const openingPenalties = {};
        let openingPenaltyPhase = true;
        events.forEach(event => {
            const delta = Number(event.pointsDelta) || 0;
            if (openingPenaltyPhase && delta < 0) {
                cutBaseline[event.playerId] = (cutBaseline[event.playerId] || 0) + delta;
                openingPenalties[event.playerId] = (openingPenalties[event.playerId] || 0) + delta;
            } else if (delta >= 0) {
                openingPenaltyPhase = false;
            }
        });
        round.openingPenalties = openingPenalties;
        round.cutBaseline = cutBaseline;
        if (game.ruleMode !== 'without-cut') game.players.forEach(target => {
            if (finals[target.playerId] < 100) return;
            const cutters = game.players.filter(chaser => chaser.playerId !== target.playerId &&
                cutBaseline[chaser.playerId] < cutBaseline[target.playerId] &&
                finals[chaser.playerId] > finals[target.playerId]);
            if (cutters.length) {
                cutters.sort((a, b) => finals[b.playerId] - finals[a.playerId] || cutBaseline[a.playerId] - cutBaseline[b.playerId]);
                resetBy[target.playerId] = cutters[0].playerId;
            }
        });
        game.players.forEach(p => {
            const s = round.scores.find(x => x.playerId === p.playerId);
            s.resetApplied = !!resetBy[p.playerId];
            s.resetByPlayerId = resetBy[p.playerId] || '';
            s.scoreAfter = s.resetApplied ? 0 : finals[p.playerId]
        });
        round.status = 'ended';
        round.endedAt = new Date().toISOString();
        game.roundCount = round.roundNumber;
        game.players.forEach(p => {
            p.totalScore = round.scores.find(s => s.playerId === p.playerId).scoreAfter
        });
        game.players.sort((a, b) => b.totalScore - a.totalScore || Number(a.seat) - Number(b.seat));
        if (forceEnd || game.players.some(p => p.totalScore >= 1000)) {
            game.status = 'ended';
            game.endedAt = round.endedAt;
            const ranks = rankLocal(game);
            game.winnerPlayerId = ranks[0].playerId;
            game.loserPlayerId = ranks[ranks.length - 1].playerId
        } else {
            const number = round.roundNumber + 1;
            game.roundCount = number;
            game.rounds.push({
                roundNumber: number,
                startedAt: new Date().toISOString(),
                endedAt: '',
                status: 'active',
                scores: game.players.map(p => ({
                    playerId: p.playerId,
                    scoreBefore: p.totalScore,
                    pointsDelta: null,
                    pointChanges: [],
                    scoreAfter: p.totalScore,
                    resetApplied: false,
                    resetByPlayerId: ''
                })),
                scoreEvents: [],
                standingOrderBefore: game.players.slice().sort((a, b) => safeScore(a.totalScore) - safeScore(b.totalScore) || Number(a.seat) - Number(b.seat)).map(player => player.playerId)
            })
        }
        return localView(game)
    }
    function localHistoryCard(game) {
        const results = rankLocal(game);
        return {
            gameId: game.gameId,
            ruleMode: game.ruleMode === 'without-cut' ? 'without-cut' : 'with-cut',
            endedAt: game.endedAt,
            createdAt: game.createdAt,
            roundCount: game.roundCount,
            playerCount: game.players.length,
            winner: results[0] || null,
            loser: results[results.length - 1] || null,
            results
        }
    }
    async function localServer(method, arg) {
        const games = await readLocalGames();
        games.forEach(normalizeStandingOrder);
        if (method === 'setupDatabase')
            return {
                ok: true,
                preview: true
            };
        if (method === 'apiGetHome') {
            const ended = games.filter(g => g.status === 'ended').sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
            return {
                recent: ended.slice(0, 3).map(localHistoryCard),
                totalGames: ended.length
            }
        }
        if (method === 'apiListHistory')
            return games.filter(g => g.status === 'ended').sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt)).map(localHistoryCard);
        if (method === 'apiGetGame') {
            const game = games.find(g => g.gameId === arg);
            if (!game)
                throw new Error('Permainan tidak ditemukan.');
            return localView(game)
        }
        if (method === 'apiDeleteGame') {
            const index = games.findIndex(g => g.gameId === arg && g.status === 'ended');
            if (index < 0)
                throw new Error('Riwayat permainan tidak ditemukan.');
            games.splice(index, 1);
            await writeLocalGames(games);
            return {ok: true}
        }
        if (method === 'apiNewGame') {
            const names = (arg.names || []).map(n => String(n || '').trim().slice(0, 24));
            if (names.length < 3 || names.length > 6 || names.some(n => !n))
                throw new Error('Isi nama untuk 3 sampai 6 pemain.');
            const now = new Date().toISOString();
            const game = {
                gameId: 'preview-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                createdAt: now,
                endedAt: '',
                status: 'active',
                roundCount: 1,
                winnerPlayerId: '',
                loserPlayerId: '',
                ruleMode: arg.ruleMode === 'without-cut' ? 'without-cut' : 'with-cut',
                players: names.map((name, i) => ({
                    playerId: 'p-' + i + '-' + Math.random().toString(36).slice(2),
                    playerName: name,
                    seat: i + 1,
                    totalScore: 0
                })),
                rounds: [{
                    roundNumber: 1,
                    startedAt: now,
                    endedAt: '',
                    status: 'active',
                    scores: [],
                    scoreEvents: [],
                    standingOrderBefore: []
                }]
            };
            game.rounds[0].standingOrderBefore = game.players.slice().sort((a, b) => a.totalScore - b.totalScore).map(p => p.playerId);
            game.rounds[0].scores = game.players.map(p => ({
                playerId: p.playerId,
                scoreBefore: 0,
                pointsDelta: null,
                pointChanges: [],
                scoreAfter: 0,
                resetApplied: false,
                resetByPlayerId: ''
            }));
            games.push(game);
            await writeLocalGames(games);
            return localView(game)
        }
        if (method === 'apiSaveScore') {
            const game = games.find(g => g.gameId === arg.gameId);
            if (!game || game.status !== 'active')
                throw new Error('Permainan sudah berakhir atau tidak ditemukan.');
            const delta = Number(arg.pointsDelta);
            if (!Number.isInteger(delta))
                throw new Error('Masukkan poin bulat yang valid.');
            const round = game.rounds.find(r => r.status === 'active');
            const entry = round.scores.find(s => s.playerId === arg.playerId);
            const player = game.players.find(p => p.playerId === arg.playerId);
            if (!entry || !player)
                throw new Error('Pemain tidak ditemukan.');
            if (!Array.isArray(round.scoreEvents)) {
                round.scoreEvents = game.players.flatMap(existingPlayer => {
                    const prior = round.scores.find(score => score.playerId === existingPlayer.playerId);
                    const changes = prior && prior.pointChanges && prior.pointChanges.length ? prior.pointChanges : prior && prior.pointsDelta != null ? [prior.pointsDelta] : [];
                    return changes.map(pointsDelta => ({playerId:existingPlayer.playerId, pointsDelta, legacyOrderApproximation:true}))
                })
            }
            entry.pointChanges = entry.pointChanges || (entry.pointsDelta !== null && entry.pointsDelta !== undefined ? [entry.pointsDelta] : []);
            entry.pointsDelta = (entry.pointsDelta || 0) + delta;
            entry.pointChanges.push(delta);
            entry.scoreAfter = entry.scoreBefore + entry.pointsDelta;
            round.scoreEvents.push({playerId:arg.playerId, pointsDelta:delta, recordedAt:new Date().toISOString()});
            player.totalScore = entry.scoreAfter;
            await writeLocalGames(games);
            return localView(game)
        }
        if (method === 'apiRenamePlayer') {
            const game = games.find(g => g.gameId === arg.gameId && g.status === 'active');
            if (!game) throw new Error('Permainan aktif tidak ditemukan.');
            const player = game.players.find(p => p.playerId === arg.playerId);
            const name = String(arg.playerName || '').trim().slice(0, 24);
            if (!player) throw new Error('Pemain tidak ditemukan.');
            if (!name) throw new Error('Nama pemain tidak boleh kosong.');
            player.playerName = name;
            await writeLocalGames(games);
            return localView(game)
        }
        if (method === 'apiAbandonGame') {
            const index = games.findIndex(g => g.gameId === arg && g.status === 'active');
            if (index < 0)
                throw new Error('Permainan aktif tidak ditemukan.');
            games.splice(index, 1);
            await writeLocalGames(games);
            return {
                ok: true
            }
        }
        if (method === 'apiFinishRound' || method === 'apiEndGame') {
            const game = games.find(g => g.gameId === arg);
            if (!game || game.status !== 'active')
                throw new Error('Permainan sudah berakhir atau tidak ditemukan.');
            const result = localFinish(game, method === 'apiEndGame');
            await writeLocalGames(games);
            return result
        }
        throw new Error('Aksi tidak dikenal.')
    }
    async function init() {
        try {
            state.animatePage = true;
            await server('setupDatabase');
            const stored = localStorage.getItem('remi-active-game');
            if (stored) {
                const game = await server('apiGetGame', stored);
                if (game.status === 'active') {
                    state.game = game;
                    state.page = 'game'
                } else {
                    localStorage.removeItem('remi-active-game')
                }
            }
            state.home = await server('apiGetHome');
            render()
        } catch (e) {
            fail(e)
        }
    }
    function shell(content) {
        return `<header class="topbar"><button class="brand-home" onclick="brandClick()" aria-label="Kembali ke beranda"><img class="brand-icon" src="./pastel-green-cards-icon.png" alt=""><div class="brand"><span><small>Play Your Remi</small><strong>Score Calculation</strong></span></div></button></header>${content}${state.page === 'game' ? '' : nav()}`
    }
    function nav() {
        return `<nav class="bottom-nav"><button class="nav-item ${state.page === 'home' ? 'active' : ''}" onclick="go('home')"><span>⌂</span>Beranda</button><button class="nav-item ${state.page === 'history' || state.page === 'detail' ? 'active' : ''}" onclick="openHistory()"><span>◷</span>Riwayat</button><button class="nav-item" onclick="go('setup')"><span>＋</span>Permainan</button></nav>`
    }
    function pageHead(title, copy) {
        return `<div class="page-head"><button class="icon-button back-button" onclick="back()">‹</button><div><div class="eyebrow">Play Your Remi</div><h1 class="title">${title}</h1></div></div>${copy ? `<p class="subtitle" style="margin:-8px 3px 18px">${copy}</p>` : ''}`
    }
    function historyItem(item) {
        const modeLabel = item.ruleMode === 'without-cut' ? 'Tanpa pemotongan' : 'Dengan pemotongan';
        return `<div class="history-entry"><button class="history-card glass" onclick="openDetail('${esc(item.gameId)}')"><span class="history-main"><strong>${esc(item.winner ? item.winner.playerName : 'Permainan selesai')} <span class="king-tag">👑 King</span></strong><small>${dateLabel(item.endedAt)} · ${item.playerCount} pemain · ${item.roundCount} putaran · ${modeLabel}</small></span><span class="history-score"><b>${item.winner ? item.winner.totalScore : 0} poin</b><small class="rt-tag">${item.loser ? 'Kalah: ' + esc(item.loser.playerName) : ''}</small></span></button><button class="history-delete" onclick="requestDeleteHistory('${esc(item.gameId)}')" aria-label="Hapus riwayat ${esc(item.winner ? item.winner.playerName : 'permainan')}" title="Hapus riwayat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m3 3v7m4-7v7"/></svg></button></div>`
    }
    function renderHome() {
        const recent = state.home && state.home.recent || [];
        return `<section class="hero glass"><div class="eyebrow">Kartu dibagi, skor tercatat</div><h1 class="title">Meja remi lo,<br>skor tetap rapi.</h1><p class="subtitle">Catat poin tiap putaran dan pantau posisi pemain.</p><button class="primary" onclick="go('setup')">Mulai permainan <span style="padding-left:12px">→</span></button></section><div class="stats"><div class="stat glass"><strong>${state.home ? state.home.totalGames : 0}</strong><span>permainan tersimpan</span></div><div class="stat glass"><strong>3–6</strong><span>pemain per meja</span></div></div><div class="section-head"><div><h2>Permainan terakhir</h2><span class="section-sub">${recent.length ? 'Hasil terbaru yang tersimpan' : 'Selesaikan permainan untuk menyimpan hasil'}</span></div><button class="history-all-button" onclick="openHistory()">Semua riwayat <span aria-hidden="true">→</span></button></div><div class="history-list">${recent.length ? recent.slice(0, 3).map(historyItem).join('') : `<div class="empty glass">Belum ada permainan tersimpan.</div>`}</div>`
    }
    function renderSetup() {
        const count = window.playerCount || null;
        const namesStep = state.setupStep === 'names' && count;
        const ruleStep = state.setupStep === 'rule';
        const index = Math.min(state.nameIndex || 0, Math.max(0, count - 1));
        const draft = state.nameDraft || [];
        return `${pageHead('Permainan baru', ruleStep ? 'Pilih aturan meja sebelum menambahkan pemain.' : namesStep ? 'Masukkan nama pemain satu per satu.' : 'Tentukan jumlah pemain dulu. Nama pemain diisi setelahnya.')}<section class="panel glass">${ruleStep ? `<div class="setup-step"><b>1</b><span>Pilih aturan permainan</span></div><div class="panel-title">Pakai aturan yang mana?</div><div class="panel-copy">Pilihan ini berlaku untuk seluruh permainan.</div><div class="rule-choice-grid"><button class="rule-card" onclick="chooseRule('with-cut')"><b>Dengan pemotongan</b><span>Jika setelah input pertama pemain yang tadinya di bawah melewati pemain di atasnya, skor pemain yang terpotong kembali ke 0 (mulai 100 poin).</span><i>Aturan pemotongan</i></button><button class="rule-card" onclick="chooseRule('without-cut')"><b>Tanpa pemotongan</b><span>Skor tetap berjalan walaupun pemain berhasil menyusul pemain lain.</span><i>Tanpa reset skor</i></button></div>` : namesStep ? `<div class="setup-step"><b>3</b><span>Nama pemain</span><span style="margin-left:auto">${index + 1} dari ${count}</span></div><button class="setup-back" onclick="backToCount()">← Ganti jumlah pemain</button><div class="name-fields" id="name-fields"><label><span class="field-label">Pemain ${index + 1}</span><input class="input player-name-input" maxlength="24" placeholder="Nama pemain ${index + 1}" value="${esc(draft[index] || '')}" autocomplete="off" enterkeyhint="${index + 1 === count ? 'done' : 'next'}" oninput="saveNameDraft(${index},this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();nextPlayerName()}"></label></div><div class="name-step-actions">${index > 0 ? '<button class="secondary" onclick="previousPlayerName()"><span>←</span> Kembali</button>' : '<span></span>'}<button class="primary" onclick="nextPlayerName()">${index + 1 === count ? 'Mulai' : 'Lanjut'} <span>→</span></button></div>` : `<div class="setup-step"><b>2</b><span>Pilih jumlah pemain</span></div><button class="setup-back" onclick="backToRule()">← Ganti aturan</button><div class="panel-title">Berapa pemain?</div><div class="panel-copy">Pilih satu meja untuk 3 sampai 6 pemain.</div><div class="player-count-grid">${[3, 4, 5, 6].map(n => `<button class="count-card" onclick="chooseCount(${n})"><span class="count-users">${Array.from({length: n}, () => personIcon()).join('')}</span><span class="count-label"><b>${n}</b><span>pemain</span></span></button>`).join('')}</div>`}</section>`
    }
    function fillNameFields() {}
    function personIcon() {
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c.5-3.4 2.7-5.2 6.5-5.2s6 1.8 6.5 5.2"></path></svg>`
    }
    function renderGame() {
        const g = state.game;
        if (!g)
            return `<div class="loading"><div class="spinner"></div>Menyiapkan permainan…</div>`;
        const scores = g.players.map(player => safeScore(player.totalScore));
        const high = Math.max(...scores), low = Math.min(...scores);
        const distinctScores = high !== low;
        return `<div class="game-heading"><div class="eyebrow">Permainan berlangsung</div><h1 class="title">Meja remi</h1><span class="mode-label">${g.ruleMode === 'without-cut' ? 'Tanpa pemotongan' : 'Dengan pemotongan'}</span></div><section class="round-banner glass"><div><span>PUTARAN</span><br><strong>Putaran ${g.roundNumber}</strong></div></section><div class="player-grid">${g.players.map(p => {
            const score = state.scoreAnimation && state.scoreAnimation[p.playerId] != null ? state.scoreAnimation[p.playerId] : safeScore(p.totalScore);
            const isHigh = distinctScores && safeScore(p.totalScore) === high;
            const isLow = distinctScores && safeScore(p.totalScore) === low;
            const rankClass = isHigh ? 'rank-high' : isLow ? 'rank-low' : 'rank-tie';
            const rankLabel = !distinctScores ? '<span class="score-rank tie">• Seri</span>' : isHigh ? '<span class="score-rank high">↑ Tertinggi</span>' : isLow ? '<span class="score-rank low">↓ Terendah</span>' : '';
            return `<div class="player-row"><button class="player-card tone-${(Number(p.seat) - 1) % 6} ${p.scored ? 'scored' : ''} ${rankClass}" data-player-id="${esc(p.playerId)}" onclick="openScore('${esc(p.playerId)}',this)"><span class="left"><span class="avatar">${personIcon()}</span><span style="min-width:0"><span class="player-name">${esc(p.playerName)}</span><span class="player-meta">${p.scored ? 'Poin ronde ini: ' + (p.pointsDelta > 0 ? '+' : '') + p.pointsDelta : 'Ketuk untuk isi skor'}</span></span></span><span class="score-side">${rankLabel}<span class="score" data-score-player="${esc(p.playerId)}">${score}</span></span></button><button class="player-edit" onclick="openRename('${esc(p.playerId)}')" aria-label="Edit nama ${esc(p.playerName)}" title="Edit nama">✎</button></div>`
        }).join('')}</div><div class="action-stack"><div class="hint">Poin dapat dicatat beberapa kali. Pemain tanpa input dihitung 0.</div><button class="primary" onclick="requestFinishRound()">Akhiri putaran <span style="float:right">→</span></button><button class="secondary" onclick="requestEndGame()">Akhiri permainan</button></div>`
    }
    function podium(results) {
        const one = results.find(p => p.rank === 1),
            two = results.find(p => p.rank === 2),
            three = results.find(p => p.rank === 3);
        return `<div class="podium">${[[two, 'second', '2'], [one, 'first', '1'], [three, 'third', '3']].map(([p, cls, num]) => p ? `<div class="podium-item ${cls}"><div class="podium-name">${esc(p.playerName)}</div><div class="podium-score">${p.totalScore} poin</div><div class="podium-block">${num}${cls === 'first' ? ' 🏆<small class=\"king-podium-label\">KING</small>' : ''}</div></div>` : '<div></div>').join('')}</div>`
    }
    function renderResult(g, historyMode) {
        const ranks = g.results || [];
        const loser = g.loserPlayerId;
        return `${pageHead(historyMode ? 'Rincian hasil' : 'Permainan selesai', historyMode ? `${dateLabel(g.endedAt)} · ${g.roundNumber} putaran` : 'Skor akhir sudah tersimpan. Ini urutan meja kali ini.')}<section class="panel glass ceremony ${state.animateCeremony ? 'animate' : ''}"><div class="eyebrow">Panggung juara</div>${podium(ranks)}${ranks.length > 3 ? `<div class="rank-list rank-extra">${ranks.slice(3).map(p => `<div class="rank-row ${p.playerId === loser ? 'lose' : ''}"><span>${p.rank}. ${esc(p.playerName)}</span><b>${p.totalScore}</b></div>`).join('')}</div>` : ''}<div class="loser"><span class="loser-icon" aria-hidden="true">😞</span><div style="flex:1"><span>POSISI TERAKHIR</span><br><strong>${esc((ranks.find(p => p.playerId === loser) || {}).playerName || '—')}</strong></div><b>${(ranks.find(p => p.playerId === loser) || {}).totalScore || 0} poin</b></div><div class="rank-list rank-extra">${ranks.map(p => `<div class="rank-row ${p.rank === 1 ? 'win' : ''} ${p.playerId === loser ? 'lose' : ''}"><span>${p.rank === 1 ? '🏆 ' : ''}${p.rank}. ${esc(p.playerName)}${p.playerId === loser ? ' · Kalah' : ''}</span><b>${p.totalScore}</b></div>`).join('')}</div></section>${historyMode ? renderRoundLog(g) : `<button class="primary full" onclick="newGame()">Main lagi <span style="float:right">→</span></button><button class="secondary full" onclick="go('home')">Kembali ke beranda</button>`}`
    }
    function renderRoundLog(g) {
        const all = g.roundHistory || [];
        const pages = Math.max(1, Math.ceil(all.length / 2));
        const page = Math.min(state.roundPage || 0, pages - 1);
        const rounds = all.slice(page * 2, page * 2 + 2);
        return `<section class="panel glass"><div class="panel-title">Rincian tiap putaran</div>${rounds.map(round => `<div style="margin-top:17px"><div class="eyebrow">Putaran ${round.roundNumber}</div><div class="table-wrap"><table class="round-table"><thead><tr><th>Pemain</th><th>Perubahan</th><th>Total akhir</th></tr></thead><tbody>${round.players.map(p => {const changes = (p.pointChanges && p.pointChanges.length ? p.pointChanges : [p.pointsDelta || 0]).map(v => v > 0 ? '+' + v : String(v)).join('; ');return `<tr class="${p.playerId === g.winnerPlayerId ? 'win' : ''} ${p.playerId === g.loserPlayerId ? 'lose' : ''}"><td>${esc(p.playerName)}${p.resetApplied ? ' · kembali ke 0' : ''}</td><td>${esc(changes)}</td><td>${p.scoreAfter}</td></tr>`}).join('')}</tbody></table></div></div>`).join('')}${pages > 1 ? `<div class="page-buttons"><button onclick="changeRoundPage(-1)" ${page === 0 ? 'disabled' : ''}>← Sebelumnya</button><span>Halaman ${page + 1} dari ${pages}</span><button onclick="changeRoundPage(1)" ${page >= pages - 1 ? 'disabled' : ''}>Berikutnya →</button></div>` : ''}</section>`
    }
    function renderHistory() {
        const pages = Math.max(1, Math.ceil(state.history.length / 6));
        const page = Math.min(state.historyPage || 0, pages - 1);
        const items = state.history.slice(page * 6, page * 6 + 6);
        return `${pageHead('Riwayat permainan', 'Buka satu permainan untuk melihat hasil. Ketuk ikon hapus untuk membuang riwayat.')}<div class="history-list ${state.animatePage ? 'history-entrance' : ''} ${state.historyPageAnimate ? 'history-page-in' : ''}">${items.length ? items.map(historyItem).join('') : `<div class="empty glass">Belum ada riwayat permainan.</div>`}</div>${pages > 1 ? `<div class="page-buttons"><button onclick="changeHistoryPage(-1)" ${page === 0 ? 'disabled' : ''}>← Sebelumnya</button><span>Halaman ${page + 1} dari ${pages}</span><button onclick="changeHistoryPage(1)" ${page >= pages - 1 ? 'disabled' : ''}>Berikutnya →</button></div>` : ''}`
    }
    function render() {
        let content = '';
        if (state.page === 'home')
            content = renderHome();
        if (state.page === 'setup')
            content = renderSetup();
        if (state.page === 'game')
            content = renderGame();
        if (state.page === 'result')
            content = renderResult(state.game, false);
        if (state.page === 'history')
            content = renderHistory();
        if (state.page === 'detail')
            content = renderResult(state.detail, true);
        app.innerHTML = shell(`<main class="screen ${state.page === 'home' ? 'screen-home' : ''} ${state.animatePage ? 'screen-in' : ''}">${content}</main>`) + (state.modal ? scoreModal() : '') + (state.renamePlayerId ? renameModal() : '') + (state.confirm ? confirmDialog() : '') + (state.roundTransition ? roundTransitionOverlay() : '') + (state.roundNotice ? roundNoticeModal() : '') + (state.loading && !window.remiStorage ? loadingOverlay() : '');
        if (state.page === 'setup')
            fillNameFields();
        if (state.animatePage)
            state.animatePage = false
    }
    function loadingOverlay() {
        return '<div class="loading-overlay" role="status" aria-live="polite"><div class="loading-card"><div class="spinner"></div><strong>Sedang memproses…</strong><span>Tunggu sebentar ya</span></div></div>'
    }
    function scoreModal() {
        const p = state.game && state.game.players.find(x => x.playerId === state.modal);
        if (!p)
            return '';
        return `<div class="scrim" onclick="if(event.target===this)closeScore()"><section class="sheet score-sheet"><div class="sheet-head"><div><div class="eyebrow">Putaran ${state.game.roundNumber} · Input poin</div><h2>${esc(p.playerName)}</h2></div><button class="icon-button" onclick="closeScore()">×</button></div><label class="field-label" for="point-input">Poin baru</label><div class="score-input-wrap"><input id="point-input" class="input" type="text" inputmode="numeric" value="" placeholder="Masukkan poin, mis. 80" onkeydown="if(event.key==='Enter'){event.preventDefault();saveScore('${esc(p.playerId)}')}"><button class="score-sign-key" onpointerdown="event.preventDefault()" onclick="toggleScoreSign()" aria-label="Masukkan tanda minus">−</button></div><div class="panel-copy score-copy">Sudah tercatat di putaran ini: <b>${p.pointsDelta == null ? 0 : p.pointsDelta}</b> poin. Input baru akan ditambahkan ke jumlah tersebut.</div><div class="presets">${[-50, -100, -150, 250, 300, 500].map(v => `<button class="preset" onclick="setPreset(${v})">${v > 0 ? '+' : ''}${v}</button>`).join('')}</div><div class="modal-actions"><button class="secondary" onclick="closeScore()">Batal</button><button class="primary" onclick="saveScore('${esc(p.playerId)}')">Simpan poin</button></div></section></div>`
    }
    function renameModal() {
        const player = state.game && state.game.players.find(p => p.playerId === state.renamePlayerId);
        if (!player) return '';
        return `<div class="scrim" onclick="if(event.target===this)closeRename()"><section class="sheet rename-sheet"><div class="sheet-head"><div><div class="eyebrow">Ubah nama pemain</div><h2>${esc(player.playerName)}</h2></div><button class="icon-button" onclick="closeRename()">×</button></div><label class="field-label" for="rename-input">Nama baru</label><input id="rename-input" class="input" maxlength="24" value="${esc(player.playerName)}" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();saveRename()}"><div class="modal-actions"><button class="secondary" onclick="closeRename()">Batal</button><button class="primary" onclick="saveRename()">Simpan nama</button></div></section></div>`
    }
    function confirmDialog() {
        const abandon = state.confirm === 'abandon',
            round = state.confirm === 'round',
            deleteHistory = state.confirm === 'delete-history';
        const title = deleteHistory ? 'Hapus riwayat?' : abandon ? 'Kembali ke beranda?' : round ? 'Akhiri putaran ini?' : 'Akhiri permainan?';
        const copy = deleteHistory ? 'Seluruh skor dan rincian permainan ini akan dihapus dari iPhone. Tindakan ini tidak bisa dibatalkan.' : abandon ? 'Permainan yang sedang berlangsung akan dihapus, termasuk skor yang sudah dicatat. Yakin ingin kembali?' : round ? 'Skor putaran ini akan dihitung, pemain tanpa input dianggap 0, lalu meja lanjut ke putaran berikutnya.' : 'Permainan akan ditutup dan hasil skor saat ini disimpan ke riwayat. Pemain tanpa input di putaran ini dihitung 0.';
        const action = deleteHistory ? 'deleteHistory()' : abandon ? 'abandonGame()' : round ? 'finishRound()' : 'finishGame()';
        const label = deleteHistory ? 'Hapus riwayat' : abandon ? 'Hapus & kembali' : round ? 'Akhiri & lanjut' : 'Akhiri permainan';
        return `<div class="scrim" onclick="if(event.target===this)closeConfirm()"><section class="sheet confirm-sheet"><div class="confirm-icon">${deleteHistory ? '⌫' : abandon ? '⌂' : round ? '→' : '✓'}</div><h2>${title}</h2><p>${copy}</p><div class="modal-actions"><button class="secondary" onclick="closeConfirm()">Batal</button><button class="primary ${deleteHistory || abandon ? 'danger' : ''}" onclick="${action}">${label}</button></div></section></div>`
    }
    function usersIcon() {
        return '<svg viewBox="0 0 32 24" aria-hidden="true"><circle cx="11" cy="7" r="3"></circle><circle cx="22" cy="8" r="2.5"></circle><path d="M4 21c.4-4 2.7-6.2 7-6.2s6.6 2.2 7 6.2M18 15.3c4.8-.7 8 1.2 8.5 4.8"></path></svg>'
    }
    function roundTransitionOverlay() {
        return `<div class="round-transition-overlay"><section class="round-transition-card"><span class="transition-mark">✦</span><div class="eyebrow">${esc(state.roundTransitionTitle)}</div><h2>${state.roundTransitionTitle === 'Permainan dimulai' ? 'Putaran 1' : `Putaran ${state.game.roundNumber}`}</h2><p>${state.roundTransitionTitle === 'Permainan dimulai' ? 'Meja siap. Selamat bermain!' : 'Meja siap. Lanjut kumpulkan poin!'}</p><div class="transition-dots"><i></i><i></i><i></i></div></section></div>`
    }
    function roundNoticeModal() {
        const cards = state.roundNotice.map((p, i) => `<article class="reset-card" style="--reset-order:${i}"><div class="reset-card-main"><span class="reset-users">${usersIcon()}</span><div class="reset-target"><small>SKOR TERPOTONG</small><strong>${esc(p.playerName)}</strong><span>Skor kembali ke 0</span></div><span class="sword-swipe" aria-hidden="true">⚔️</span></div><div class="reset-chaser"><span>Disusul oleh</span><strong>${esc(p.resetByPlayerName)}</strong></div></article>`).join('');
        return `<div class="scrim reset-scrim" onclick="if(event.target===this)closeRoundNotice()"><section class="sheet reset-sheet"><div class="confirm-icon">↘</div><h2>Skor terpotong</h2><p>Skor pemain yang tersalip kembali ke nol.</p><div class="reset-list">${cards}</div><button class="primary full" onclick="closeRoundNotice()">Lanjut</button></section></div>`
    }
    function go(page) {
        if (page !== 'game') {
            if (document.activeElement && document.activeElement.matches('input, textarea')) document.activeElement.blur();
            document.body.classList.remove('keyboard-open')
        }
        state.modal = false;
        state.animatePage = true;
        state.page = page;
        if (page === 'setup') {
            state.setupStep = 'rule';
            state.ruleMode = 'with-cut';
            window.playerCount = null;
            state.nameDraft = []
        }
        if (page === 'home') {
            state.loading = true;
            render();
            server('apiGetHome').then(v => {
                state.home = v;
                state.loading = false;
                state.animatePage = true;
                render()
            }).catch(fail);
            return
        }
        render()
    }
    function brandClick() {
        if (state.page === 'game' && state.game && state.game.status === 'active') {
            state.confirm = 'abandon';
            render()
        } else
            go('home')
    }
    function closeConfirm() {
        state.confirm = null;
        state.deleteGameId = null;
        render()
    }
    function requestDeleteHistory(id) {
        if (!state.history.some(item => item.gameId === id) && !(state.home && state.home.recent || []).some(item => item.gameId === id))
            return;
        state.deleteGameId = id;
        state.confirm = 'delete-history';
        render()
    }
    async function deleteHistory() {
        const id = state.deleteGameId;
        if (!id)
            return;
        state.confirm = null;
        try {
            await server('apiDeleteGame', id);
            state.history = state.history.filter(item => item.gameId !== id);
            if (state.home) {
                state.home.recent = (state.home.recent || []).filter(item => item.gameId !== id);
                state.home.totalGames = Math.max(0, Number(state.home.totalGames || 0) - 1)
            }
            const pages = Math.max(1, Math.ceil(state.history.length / 6));
            state.historyPage = Math.min(state.historyPage, pages - 1);
            state.deleteGameId = null;
            state.animatePage = true;
            render();
            toast('Riwayat dihapus')
        } catch (e) {
            state.deleteGameId = null;
            fail(e)
        }
    }
    function back() {
        if (state.page === 'setup' && state.setupStep === 'names') {
            backToCount()
        } else if (state.page === 'setup' && state.setupStep === 'count') {
            backToRule()
        } else if (state.page === 'detail')
            go('history');
        else if (state.page === 'game')
            render();
        else
            go('home')
    }
    async function openHistory() {
        state.page = 'history';
        state.historyPage = 0;
        state.loading = true;
        render();
        try {
            state.history = await server('apiListHistory');
            state.loading = false;
            state.animatePage = true;
            render()
        } catch (e) {
            fail(e)
        }
    }
    async function openDetail(id) {
        state.loading = true;
        render();
        try {
            state.detail = await server('apiGetGame', id);
            state.loading = false;
            state.page = 'detail';
            state.roundPage = 0;
            state.animateCeremony = true;
            state.animatePage = true;
            render();
            state.animateCeremony = false
        } catch (e) {
            fail(e)
        }
    }
    function changeRoundPage(offset) {
        state.roundPage = Math.max(0, (state.roundPage || 0) + offset);
        state.animateCeremony = false;
        render()
    }
    function changeHistoryPage(offset) {
        const pages = Math.max(1, Math.ceil(state.history.length / 6));
        state.historyPage = Math.max(0, Math.min(pages - 1, (state.historyPage || 0) + offset));
        state.historyPageAnimate = true;
        render();
        state.historyPageAnimate = false
    }
    function chooseRule(mode) { state.ruleMode = mode === 'without-cut' ? 'without-cut' : 'with-cut'; state.setupStep = 'count'; render() }
    function backToRule() { state.setupStep = 'rule'; render() }
    function chooseCount(n) {
        window.playerCount = n;
        state.setupStep = 'names';
        state.nameIndex = 0;
        state.nameDraft = Array(n).fill('');
        render();
        setTimeout(() => {
            const input = document.querySelector('.player-name-input');
            if (input)
                input.focus()
        }, 50)
    }
    function saveNameDraft(index, value) {
        state.nameDraft = state.nameDraft || Array(window.playerCount).fill('');
        state.nameDraft[index] = value
    }
    function nextPlayerName() {
        const input = document.querySelector('.player-name-input');
        if (input) saveNameDraft(state.nameIndex, input.value.trim());
        const name = String((state.nameDraft || [])[state.nameIndex] || '').trim();
        if (!name) { toast('Masukkan nama pemain dulu.'); return }
        if (state.nameIndex + 1 < window.playerCount) {
            state.nameIndex++;
            render();
            const next = document.querySelector('.player-name-input');
            if (next) next.focus()
        } else startGame()
    }
    function previousPlayerName() {
        const input = document.querySelector('.player-name-input');
        if (input) saveNameDraft(state.nameIndex, input.value.trim());
        state.nameIndex = Math.max(0, state.nameIndex - 1);
        render();
        const previous = document.querySelector('.player-name-input');
        if (previous) previous.focus()
    }
    function backToCount() {
        const input = document.querySelector('.player-name-input');
        if (input) saveNameDraft(state.nameIndex, input.value.trim());
        state.setupStep = 'count';
        render()
    }
    async function startGame() {
        const input = document.querySelector('.player-name-input');
        if (input) saveNameDraft(state.nameIndex, input.value.trim());
        const names = (state.nameDraft || []).map(n => String(n || '').trim());
        if (names.some(n => !n)) {
            toast('Isi nama semua pemain dulu.');
            return
        }
        state.nameDraft = names;
        state.loading = true;
        render();
        try {
            const created = await server('apiNewGame', {
                names, ruleMode: state.ruleMode
            });
            if (!created || !created.gameId)
                throw new Error('Apps Script tidak mengembalikan data permainan. Periksa koneksi Google Sheets dan pastikan deployment memakai versi kode terbaru.');
            state.game = created;
            localStorage.setItem('remi-active-game', state.game.gameId);
            state.page = 'game';
            state.loading = false;
            state.animatePage = true;
            render();
            showRoundTransition('Permainan dimulai')
        } catch (e) {
            fail(e)
        }
    }
    function openScore(id, card) {
        state.scoreAnimation = null;
        state.scoreSheetScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        if (card) {
            card.classList.add('player-card-pop');
            setTimeout(() => card.classList.remove('player-card-pop'), 220)
        }
        setTimeout(() => {
            state.modal = id;
            render();
            setTimeout(() => {
                const el = document.getElementById('point-input');
                if (el)
                    el.focus()
            }, 50)
        }, 120)
    }
    function closeScore() {
        const input = document.getElementById('point-input');
        if (input) input.blur();
        state.modal = false;
        render();
        restoreScoreScroll()
    }
    function restoreScoreScroll() {
        const top = state.scoreSheetScrollY || 0;
        requestAnimationFrame(() => window.scrollTo({top, behavior:'auto'}));
        setTimeout(() => window.scrollTo({top, behavior:'auto'}), 180)
    }
    function openRename(playerId) {
        state.modal = false;
        state.renamePlayerId = playerId;
        render();
        setTimeout(() => { const input = document.getElementById('rename-input'); if (input) { input.focus(); input.select() } }, 60)
    }
    function closeRename() { state.renamePlayerId = null; render() }
    async function saveRename() {
        const input = document.getElementById('rename-input');
        const name = input && input.value.trim();
        if (!name) { toast('Nama pemain tidak boleh kosong.'); return }
        const playerId = state.renamePlayerId;
        input.blur();
        state.loading = true;
        try {
            state.game = await server('apiRenamePlayer', {gameId:state.game.gameId, playerId, playerName:name});
            state.renamePlayerId = null;
            state.loading = false;
            render();
            toast('Nama pemain diperbarui')
        } catch (error) { state.loading = false; fail(error) }
    }
    function setPreset(n) {
        const input = document.getElementById('point-input');
        input.value = n;
        document.querySelectorAll('.preset').forEach(b => b.classList.toggle('selected', Number(b.textContent) === n))
    }
    function toggleScoreSign() {
        const input = document.getElementById('point-input');
        if (!input) return;
        const value = input.value.trim();
        input.value = value.startsWith('-') ? value.slice(1) : value ? '-' + value : '-';
        input.focus();
        const pos = input.value.startsWith('-') && input.value.length === 1 ? 1 : input.value.length;
        input.setSelectionRange(pos, pos)
    }
    async function saveScore(playerId) {
        const input = document.getElementById('point-input');
        const delta = Number(input.value);
        if (input.value.trim() === '' || !Number.isInteger(delta)) {
            toast('Masukkan poin bulat.');
            return
        }
        const before = Number((state.game.players.find(p => p.playerId === playerId) || {}).totalScore || 0);
        input.blur();
        state.loading = true;
        render();
        try {
            const response = await server('apiSaveScore', {
                gameId: state.game.gameId,
                playerId,
                pointsDelta: delta
            });
            const patch = Array.isArray(response && response.players) ? response.players.find(p => p.playerId === playerId) : response;
            if (!patch || !Number.isFinite(Number(patch.totalScore)))
                throw new Error('Skor yang diterima tidak valid. Muat ulang permainan lalu coba lagi.');
            const updated = state.game.players.find(p => p.playerId === playerId);
            Object.assign(updated, {
                totalScore: patch.totalScore,
                scoreBefore: patch.scoreBefore,
                scored: patch.scored,
                pointsDelta: patch.pointsDelta
            });
            state.game.results = state.game.players.slice().sort((a, b) => Number(b.totalScore) - Number(a.totalScore) || Number(a.seat) - Number(b.seat)).map((p, index) => ({
                playerId: p.playerId,
                playerName: p.playerName,
                totalScore: Number(p.totalScore),
                rank: index + 1,
                seat: p.seat
            }));
            state.scoreAnimation = {
                [playerId]: before
            };
            state.modal = false;
            state.loading = false;
            render();
            restoreScoreScroll();
            animatePlayerScore(playerId, before, Number(updated.totalScore));
            toast('Poin ditambahkan')
        } catch (e) {
            state.loading = false;
            fail(e)
        }
    }
    function animatePlayerScore(playerId, from, to) {
        const node = document.querySelector('[data-score-player="' + CSS.escape(playerId) + '"]');
        if (!node) {
            state.scoreAnimation = null;
            return
        }
        const start = performance.now(),
            duration = 430;
        const tick = now => {
            const t = Math.min(1, (now - start) / duration);
            node.textContent = Math.round(from + (to - from) * t);
            if (t < 1)
                requestAnimationFrame(tick);
            else
                state.scoreAnimation = null
        };
        requestAnimationFrame(tick)
    }
    function requestFinishRound() {
        state.confirm = 'round';
        render()
    }
    async function finishRound() {
        state.confirm = null;
        state.loading = true;
        const previousOrder = state.game.players.map(player => player.playerId);
        render();
        try {
            const finishedGame = await server('apiFinishRound', state.game.gameId);
            state.loading = false;
            const resets = finishedGame.lastRoundResets && finishedGame.lastRoundResets.length ? finishedGame.lastRoundResets : null;
            if (finishedGame.status !== 'ended') {
                const playersById = new Map(finishedGame.players.map(player => [player.playerId, player]));
                finishedGame.players = previousOrder.map(id => playersById.get(id)).filter(Boolean);
                state.pendingRanking = finishedGame.players.slice().sort((a, b) => safeScore(b.totalScore) - safeScore(a.totalScore)).map(player => player.playerId);
            } else {
                state.pendingRanking = null
            }
            state.game = finishedGame;
            if (state.game.status === 'ended') {
                localStorage.removeItem('remi-active-game');
                state.page = 'result';
                state.animateCeremony = true;
                state.animatePage = true;
                state.roundNotice = resets;
                state.pendingRoundNotice = null;
                render();
                state.animateCeremony = false
            } else {
                state.pendingRoundNotice = resets;
                state.roundNotice = resets;
                if (resets)
                    render();
                else
                    continueRoundSequence()
            }
        } catch (e) {
            state.loading = false;
            fail(e)
        }
    }
    function showRoundTransition(title) {
        state.roundTransitionTitle = title || 'Putaran berikutnya';
        state.roundTransition = true;
        render();
        setTimeout(() => {
            state.roundTransition = false;
            render();
            animateRoundCards();
            state.roundTransitionTitle = 'Putaran berikutnya'
        }, 1250)
    }
    function continueRoundSequence() {
        const order = state.pendingRanking;
        if (!order) {
            showRoundTransition();
            return
        }
        animatePlayerRanking(order, () => {
            state.pendingRanking = null;
            showRoundTransition()
        })
    }
    function animatePlayerRanking(order, onComplete) {
        const grid = document.querySelector('.player-grid');
        if (!grid || !state.game) {
            onComplete();
            return
        }
        const before = new Map([...grid.querySelectorAll('.player-card')].map(card => [card.dataset.playerId, card.getBoundingClientRect().top]));
        const playersById = new Map(state.game.players.map(player => [player.playerId, player]));
        state.game.players = order.map(id => playersById.get(id)).filter(Boolean);
        render();
        const cards = [...document.querySelectorAll('.player-card')];
        let moved = false;
        cards.forEach((card, index) => {
            const oldTop = before.get(card.dataset.playerId);
            if (oldTop == null) return;
            const offset = oldTop - card.getBoundingClientRect().top;
            if (Math.abs(offset) < 1) return;
            moved = true;
            card.classList.add('rank-sort-motion');
            card.style.transition = 'none';
            card.style.transform = `translateY(${offset}px)`;
            card.style.transitionDelay = `${index * 55}ms`;
            card.getBoundingClientRect();
            requestAnimationFrame(() => {
                card.style.transition = '';
                card.style.transform = ''
            });
            setTimeout(() => {
                card.classList.remove('rank-sort-motion');
                card.style.transitionDelay = ''
            }, 760 + index * 55)
        });
        if (!moved) {
            cards.forEach(card => card.classList.add('rank-sort-settled'));
            setTimeout(() => cards.forEach(card => card.classList.remove('rank-sort-settled')), 480)
        }
        setTimeout(onComplete, moved ? 850 + Math.max(0, cards.length - 1) * 55 : 520)
    }
    function animateRoundCards() {
        const cards = [...document.querySelectorAll('.player-card')];
        cards.forEach((card, i) => {
            card.style.animationDelay = (i * 90) + 'ms';
            card.classList.add('round-card-zoom');
            setTimeout(() => {
                card.classList.remove('round-card-zoom');
                card.style.animationDelay = ''
            }, 720)
        })
    }
    function requestEndGame() {
        state.confirm = 'end';
        render()
    }
    async function finishGame() {
        if (!state.game)
            return;
        state.confirm = null;
        state.loading = true;
        render();
        try {
            state.game = await server('apiEndGame', state.game.gameId);
            localStorage.removeItem('remi-active-game');
            state.page = 'result';
            state.animateCeremony = true;
            state.animatePage = true;
            state.loading = false;
            state.roundNotice = state.game.lastRoundResets && state.game.lastRoundResets.length ? state.game.lastRoundResets : null;
            render();
            state.animateCeremony = false
        } catch (e) {
            state.loading = false;
            fail(e)
        }
    }
    function closeRoundNotice() {
        const advance = Boolean(state.pendingRanking) && state.page === 'game';
        state.roundNotice = null;
        state.pendingRoundNotice = null;
        render();
        if (advance)
            continueRoundSequence()
    }
    async function abandonGame() {
        if (!state.game)
            return;
        state.confirm = null;
        state.loading = true;
        render();
        try {
            await server('apiAbandonGame', state.game.gameId);
            localStorage.removeItem('remi-active-game');
            state.game = null;
            state.loading = false;
            go('home')
        } catch (e) {
            state.loading = false;
            fail(e)
        }
    }
    function newGame() {
        state.game = null;
        state.page = 'setup';
        state.setupStep = 'rule';
        state.ruleMode = 'with-cut';
        window.playerCount = null;
        state.nameDraft = [];
        render()
    }
    init();
    
