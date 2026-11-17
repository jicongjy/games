// 게임 규칙. 화면과 무관하게 돌아가서, 난이도 맞추는 도구(tools/sim.js)에서도 그대로 쓴다.
(function (root) {
  var ST = (root.ST = root.ST || {});
  var N = 5;
  var DWELL = { house: 1, inn: 1, tower: 1 };

  function nb(i) {
    var r = Math.floor(i / N), c = i % N, o = [];
    if (r > 0) o.push(i - N);
    if (r < N - 1) o.push(i + N);
    if (c > 0) o.push(i - 1);
    if (c < N - 1) o.push(i + 1);
    return o;
  }
  function isB(x) { return !!x && x.k === 'b'; }
  function has(s, r) { return s.relics.indexOf(r) >= 0; }
  function corner(i) { return i === 0 || i === 4 || i === 20 || i === 24; }
  function zero() { return { grain: 0, bread: 0, people: 0, gold: 0 }; }

  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    var r = rng(seed), a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mult(s, cell) { return has(s, 'compass') && corner(cell) ? 2 : 1; }

  // 건물 하나가 지금 이 자리에서 발동하면 무엇을 내는가
  function own(s, cell, id) {
    var b = s.board, ns = nb(cell), g = zero();
    function adj(t) {
      var n = 0;
      for (var k = 0; k < ns.length; k++) if (isB(b[ns[k]]) && b[ns[k]].id === t) n++;
      return n;
    }
    var adjDwell = 0, k;
    for (k = 0; k < ns.length; k++) if (isB(b[ns[k]]) && DWELL[b[ns[k]].id]) adjDwell++;
    var plaza = adj('plaza') > 0 ? 1 : 0;

    if (id === 'field') {
      g.grain = adj('well') > 0 ? 2 : (s.rule === 'winter' ? 0 : 1);
    } else if (id === 'orchard') {
      for (k = 0; k < ns.length; k++) if (!b[ns[k]]) g.gold++;
    } else if (id === 'fishing') {
      var wet = false;
      for (k = 0; k < ns.length; k++) {
        var x = b[ns[k]];
        if (x && ((x.k === 't' && x.t === 'water') || (isB(x) && x.id === 'well'))) wet = true;
      }
      g.gold = wet ? 3 : 0;
    } else if (id === 'bakery') {
      g.bread = 2 * adj('field');
    } else if (id === 'mill') {
      var r = Math.floor(cell / N);
      for (k = 0; k < N; k++) {
        var y = b[r * N + k];
        if (r * N + k !== cell && isB(y) && y.id === 'field') g.grain++;
      }
    } else if (id === 'brewery') {
      g.gold = adjDwell > 0 ? 3 * adj('orchard') : 0;
    } else if (id === 'house') {
      g.people = 1 + adj('house') + plaza;
    } else if (id === 'inn') {
      var seen = {}, cnt = 0;
      for (k = 0; k < ns.length; k++) {
        var z = b[ns[k]];
        if (isB(z) && !seen[z.id]) { seen[z.id] = 1; cnt++; }
      }
      g.people = cnt + plaza;
    } else if (id === 'tower') {
      g.people = (adjDwell > 0 ? 1 : 3) + plaza;
    }
    var m = mult(s, cell);
    if (m > 1) { g.grain *= m; g.bread *= m; g.people *= m; g.gold *= m; }
    return g;
  }

  function legal(s, id, cell) {
    if (s.board[cell]) return false;
    if (s.rule === 'quiet') {
      var ns = nb(cell), k;
      for (k = 0; k < ns.length; k++) {
        var x = s.board[ns[k]];
        if (!isB(x)) continue;
        if (id === 'house' && x.id === 'fishing') return false;
        if (id === 'fishing' && x.id === 'house') return false;
      }
    }
    return true;
  }

  function draw(s) {
    while (s.hand.length < s.handSize && s.bag.length) s.hand.push(s.bag.shift());
  }

  ST.newGame = function (quest, bag, relics, seed) {
    var s = {
      q: quest.id, rule: quest.rule || null, seed: seed,
      board: [], hand: [], bag: shuffle(bag, seed),
      res: zero(), pL: 0, pR: 0, n: 0,
      relics: relics.slice(), pencilUsed: false, over: false,
      handSize: relics.indexOf('magnifier') >= 0 ? 4 : 3
    };
    for (var i = 0; i < 25; i++) s.board.push(null);
    var t = quest.terrain || {};
    for (var key in t) s.board[+key] = { k: 't', t: t[key] };
    draw(s);
    return s;
  };

  // 조각을 놓는다. 무엇이 얼마나 났는지를 칸별 목록으로 돌려준다. 놓을 수 없으면 null.
  ST.place = function (s, hi, cell) {
    var id = s.hand[hi];
    if (!id || s.over || !legal(s, id, cell)) return null;
    var b = s.board, ns = nb(cell), parts = [], k, j;
    b[cell] = { k: 'b', id: id };

    if (id === 'bell') {
      for (k = 0; k < ns.length; k++) {
        j = ns[k];
        if (isB(b[j]) && b[j].id !== 'bell') parts.push({ cell: j, g: own(s, j, b[j].id) });
      }
    } else {
      var g = own(s, cell, id);
      if (s.n === 0 && has(s, 'dawnbell')) { g.grain *= 2; g.bread *= 2; g.people *= 2; g.gold *= 2; }
      parts.push({ cell: cell, g: g });
    }

    // 우물과 광장은 놓인 뒤에도 옆 칸에 힘을 준다
    if (id === 'field') {
      for (k = 0; k < ns.length; k++) if (isB(b[ns[k]]) && b[ns[k]].id === 'well') b[cell].w = true;
    }
    if (DWELL[id]) {
      for (k = 0; k < ns.length; k++) if (isB(b[ns[k]]) && b[ns[k]].id === 'plaza') b[cell].pz = true;
    }
    if (id === 'well') {
      for (k = 0; k < ns.length; k++) {
        j = ns[k];
        if (isB(b[j]) && b[j].id === 'field' && !b[j].w) {
          b[j].w = true;
          var dg = zero();
          dg.grain = (2 - (s.rule === 'winter' ? 0 : 1)) * mult(s, j);
          parts.push({ cell: j, g: dg });
        }
      }
    }
    if (id === 'plaza') {
      for (k = 0; k < ns.length; k++) {
        j = ns[k];
        if (isB(b[j]) && DWELL[b[j].id] && !b[j].pz) {
          b[j].pz = true;
          var dp = zero();
          dp.people = mult(s, j);
          parts.push({ cell: j, g: dp });
        }
      }
    }

    for (k = 0; k < parts.length; k++) {
      var p = parts[k];
      s.res.grain += p.g.grain; s.res.bread += p.g.bread;
      s.res.people += p.g.people; s.res.gold += p.g.gold;
      var col = p.cell % N;
      if (col < 2) s.pL += p.g.people;
      else if (col > 2) s.pR += p.g.people;
    }
    s.n++;
    s.hand.splice(hi, 1);
    draw(s);
    if (!s.hand.length) s.over = true;
    return parts;
  };

  ST.sum = function (parts) {
    var t = zero();
    for (var k = 0; k < parts.length; k++) {
      t.grain += parts[k].g.grain; t.bread += parts[k].g.bread;
      t.people += parts[k].g.people; t.gold += parts[k].g.gold;
    }
    return t;
  };

  // 놓기 전에 결과를 미리 본다
  ST.preview = function (s, hi, cell) {
    if (!legal(s, s.hand[hi], cell)) return null;
    var c = JSON.parse(JSON.stringify(s));
    var parts = ST.place(c, hi, cell);
    return parts ? ST.sum(parts) : null;
  };

  ST.legal = legal;

  ST.canMove = function (s) {
    for (var h = 0; h < s.hand.length; h++)
      for (var c = 0; c < 25; c++) if (legal(s, s.hand[h], c)) return true;
    return false;
  };

  // 몽당연필: 손에 든 조각을 짐에 넣고 다시 뽑는다
  ST.redraw = function (s) {
    if (!has(s, 'pencil') || s.pencilUsed || s.over || !s.bag.length) return false;
    s.bag = shuffle(s.bag.concat(s.hand), s.seed + 101 + s.n);
    s.hand = [];
    s.pencilUsed = true;
    draw(s);
    return true;
  };

  function meets(s, goal) {
    if (goal.r) return s.res[goal.r] >= goal.n;
    if (goal.t === 'balance') return Math.abs(s.pL - s.pR) <= 1;
    if (goal.t === 'adj') {
      for (var i = 0; i < 25; i++) {
        if (!isB(s.board[i]) || s.board[i].id !== goal.a) continue;
        var ns = nb(i);
        for (var k = 0; k < ns.length; k++)
          if (isB(s.board[ns[k]]) && s.board[ns[k]].id === goal.b) return true;
      }
      return false;
    }
    return false;
  }
  ST.meets = meets;

  ST.evaluate = function (s, quest) {
    var base = true, k, stars = 0;
    for (k = 0; k < quest.goals.length; k++) if (!meets(s, quest.goals[k])) base = false;
    if (base) {
      stars = 1;
      for (k = 0; k < quest.bonus.length; k++) if (meets(s, quest.bonus[k])) stars++;
    }
    return { base: base, stars: stars };
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ───────────────────────────────────────────────────────────────────────────
// 새 규칙(날짜 규칙). 의뢰에 days가 있으면 이 규칙으로 돈다. 없으면 위의 옛 규칙.
//  - 하루에 조각 하나를 놓는다. 손에 든 나머지는 버림 더미로 가고, 덱이 비면 버림 더미를 섞어 다시 쓴다.
//    (조각은 설계도라서 놓아도 없어지지 않고 계속 돈다.)
//  - 건물은 놓는 순간 한 번이 아니라, 매일 밤 지금 옆 칸을 보고 일한다. 그래서 놓는 순서는 상관없다.
//  - 한 주의 마지막 날은 장날이다. 의뢰인이 빵을 가져간다. 모자라면 곡식과 금화가 빵으로 바뀐다.
//  - 장날을 넘기면 조각 셋 중 하나를 덱에 넣는다. 금화를 내고 다시 뽑을 수 있다.
//  - 주 중간에 이벤트가 하나 생긴다.
(function (root) {
  var ST = root.ST, N = 5, D = {};
  var DWELL = { house: 1, inn: 1, tower: 1 };
  D.GRAIN_PER_BREAD = 2;   // 곡식 2개 = 빵 1개
  D.GOLD_PER_BREAD = 3;    // 금화 3개 = 빵 1개
  D.REROLL_COST = 2;       // 보상 다시 뽑기 값(금화)
  D.REROLL_MAX = 3;

  function nb(i) {
    var r = Math.floor(i / N), c = i % N, o = [];
    if (r > 0) o.push(i - N);
    if (r < N - 1) o.push(i + N);
    if (c > 0) o.push(i - 1);
    if (c < N - 1) o.push(i + 1);
    return o;
  }
  function isB(x) { return !!x && x.k === 'b'; }
  function next(s) { s.rs = (Math.imul(s.rs, 1103515245) + 12345) & 0x7fffffff; return s.rs; }
  function rnd(s, n) { return next(s) % n; }
  function shuffle(s, a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(s, i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // 건물 하나가 하룻밤에 내는 것. 종탑과 나침반은 여기서 치지 않는다.
  function own(s, cell) {
    var b = s.board, id = b[cell].id, ns = nb(cell), g = { grain: 0, bread: 0, gold: 0, people: 0 }, k;
    function adj(t) { var n = 0; for (var k = 0; k < ns.length; k++) if (isB(b[ns[k]]) && b[ns[k]].id === t) n++; return n; }
    var dw = 0, empty = 0;
    for (k = 0; k < ns.length; k++) { if (isB(b[ns[k]]) && DWELL[b[ns[k]].id]) dw++; if (!b[ns[k]]) empty++; }
    var plaza = adj('plaza') > 0 ? 1 : 0;
    if (id === 'field') g.grain = adj('well') > 0 ? 2 : (s.rule === 'winter' ? 0 : 1);
    else if (id === 'orchard') g.gold = empty >= 2 ? 2 : 1;
    else if (id === 'fishing') {
      var wet = false;
      for (k = 0; k < ns.length; k++) { var x = b[ns[k]]; if (x && ((x.k === 't' && x.t === 'water') || (isB(x) && x.id === 'well'))) wet = true; }
      g.gold = wet ? 2 : 0;
    } else if (id === 'bakery') g.bread = adj('field');
    else if (id === 'mill') { var r = Math.floor(cell / N); for (k = 0; k < N; k++) { var y = b[r * N + k]; if (r * N + k !== cell && isB(y) && y.id === 'field') g.grain++; } }
    else if (id === 'brewery') g.gold = dw > 0 ? 2 * adj('orchard') : 0;
    else if (id === 'house') g.people = 1 + adj('house') + plaza;
    else if (id === 'inn') { var seen = {}, cnt = 0; for (k = 0; k < ns.length; k++) { var z = b[ns[k]]; if (isB(z) && !seen[z.id]) { seen[z.id] = 1; cnt++; } } g.people = cnt + plaza; }
    else if (id === 'tower') g.people = (dw > 0 ? 1 : 3) + plaza;
    return g;
  }

  // 지금 마을이 하룻밤에 내는 것 전부. cells는 칸별 내역, tax는 주민이 내는 금화.
  D.produce = function (s) {
    var t = { grain: 0, bread: 0, gold: 0, people: 0, cells: {}, tax: 0 }, i, k;
    var corner = { 0: 1, 4: 1, 20: 1, 24: 1 }, compass = s.relics.indexOf('compass') >= 0;
    for (i = 0; i < 25; i++) {
      if (!isB(s.board[i]) || s.board[i].id === 'bell') continue;
      var g = own(s, i), times = 1, ns = nb(i);
      for (k = 0; k < ns.length; k++) if (isB(s.board[ns[k]]) && s.board[ns[k]].id === 'bell') { times = 2; break; }
      if (compass && corner[i]) times *= 2;
      g.grain *= times; g.bread *= times; g.gold *= times;
      t.cells[i] = g;
      t.grain += g.grain; t.bread += g.bread; t.gold += g.gold; t.people += g.people;
    }
    t.tax = t.people;   // 주민 한 명이 하룻밤에 금화 1개를 낸다
    t.gold += t.tax;
    return t;
  };
  // 빵으로 치면 몇 개인가
  D.worth = function (r) { return r.bread + Math.floor(r.grain / D.GRAIN_PER_BREAD) + Math.floor(r.gold / D.GOLD_PER_BREAD); };
  D.rate = function (p) { return p.bread + p.grain / D.GRAIN_PER_BREAD + p.gold / D.GOLD_PER_BREAD; };

  function draw(s) {
    s.hand = [];
    while (s.hand.length < s.handSize) {
      if (!s.deck.length) { if (!s.discard.length) break; s.deck = shuffle(s, s.discard); s.discard = []; }
      s.hand.push(s.deck.shift());
    }
  }

  D.newGame = function (quest, cards, relics, seed) {
    var cfg = quest.days, s = {
      q: quest.id, rule: quest.rule || null, rs: (seed | 0) || 1, day: 1, week: 0,
      perWeek: cfg.perWeek, quota: cfg.quota.slice(), board: [], deck: [], discard: [], hand: [],
      res: { grain: 0, bread: 0, gold: 0 }, people: 0, relics: relics.slice(),
      handSize: relics.indexOf('magnifier') >= 0 ? 4 : 3,
      phase: 'play', offer: [], rerolls: 0, event: null, won: false, failed: false,
      eventsLeft: [], last: null, market: null, placed: 0, pencil: false
    };
    for (var i = 0; i < 25; i++) s.board.push(null);
    var t = quest.terrain || {};
    for (var key in t) s.board[+key] = { k: 't', t: t[key] };
    s.deck = shuffle(s, cards.slice());
    s.eventsLeft = shuffle(s, (cfg.events || []).slice());
    draw(s);
    return s;
  };

  D.legal = function (s, id, cell) {
    var c = s.board[cell];
    if (c && c.k === 't') return false;
    if (s.rule === 'quiet') {
      var ns = nb(cell);
      for (var k = 0; k < ns.length; k++) {
        var x = s.board[ns[k]];
        if (!isB(x)) continue;
        if (id === 'house' && x.id === 'fishing') return false;
        if (id === 'fishing' && x.id === 'house') return false;
      }
    }
    return true;
  };

  // 여기 놓으면 하룻밤 생산이 얼마나 달라지나(빵으로 친 값과 자원별 차이)
  D.preview = function (s, hi, cell) {
    var id = s.hand[hi];
    if (!id || !D.legal(s, id, cell)) return null;
    var before = D.produce(s), old = s.board[cell];
    s.board[cell] = { k: 'b', id: id };
    var after = D.produce(s);
    s.board[cell] = old;
    return { grain: after.grain - before.grain, bread: after.bread - before.bread, gold: after.gold - before.gold,
      people: after.people - before.people, rate: D.rate(after) - D.rate(before), replace: old ? old.id : null };
  };

  // 하루를 끝낸다. 밤사이 생산하고, 장날이면 납품한다.
  function endDay(s) {
    s.discard = s.discard.concat(s.hand); s.hand = [];
    var p = D.produce(s), dawn = s.relics.indexOf('dawnbell') >= 0 && (s.day - 1) % s.perWeek === 0, m = dawn ? 2 : 1;
    s.res.grain += p.grain * m; s.res.bread += p.bread * m; s.res.gold += p.gold * m; s.people = p.people;
    s.last = { p: p, mult: m };
    s.market = null;
    if (s.day % s.perWeek === 0) {
      var need = s.quota[s.week], pay = { bread: 0, grain: 0, gold: 0 }, left = need;
      pay.bread = Math.min(left, s.res.bread); left -= pay.bread;
      var gb = Math.min(left, Math.floor(s.res.grain / D.GRAIN_PER_BREAD)); pay.grain = gb * D.GRAIN_PER_BREAD; left -= gb;
      var cb = Math.min(left, Math.floor(s.res.gold / D.GOLD_PER_BREAD)); pay.gold = cb * D.GOLD_PER_BREAD; left -= cb;
      s.market = { week: s.week, need: need, pay: pay, short: left };
      if (left > 0) { s.failed = true; s.phase = 'over'; return; }
      s.res.bread -= pay.bread; s.res.grain -= pay.grain; s.res.gold -= pay.gold;
      s.week++;
      if (s.week >= s.quota.length) { s.won = true; s.phase = 'over'; return; }
      s.phase = 'market';
    }
    s.day++;
    if (s.phase === 'play') startDay(s);
  }
  function startDay(s) {
    s.pencil = false;
    var dw = (s.day - 1) % s.perWeek;
    if (dw === Math.floor(s.perWeek / 2) && s.eventsLeft.length) { s.event = s.eventsLeft.shift(); s.phase = 'event'; }
    draw(s);
  }

  D.place = function (s, hi, cell) {
    if (s.phase !== 'play') return false;
    var id = s.hand[hi];
    if (!id || !D.legal(s, id, cell)) return false;
    s.board[cell] = { k: 'b', id: id };
    s.placed++;
    endDay(s);
    return true;
  };
  D.rest = function (s) { if (s.phase !== 'play') return false; endDay(s); return true; };

  // 장날을 넘긴 뒤: 조각 셋 중 하나
  function makeOffer(s, pool) { s.offer = shuffle(s, pool.slice()).slice(0, 3); }
  D.toReward = function (s, pool) { if (s.phase !== 'market') return; s.phase = 'reward'; s.rerolls = 0; s.pool = pool.slice(); makeOffer(s, s.pool); };
  D.reroll = function (s) {
    if (s.phase !== 'reward' || s.rerolls >= D.REROLL_MAX || s.res.gold < D.REROLL_COST) return false;
    s.res.gold -= D.REROLL_COST; s.rerolls++; makeOffer(s, s.pool); return true;
  };
  D.take = function (s, i) {
    if (s.phase !== 'reward') return false;
    if (i >= 0 && s.offer[i]) s.discard.push(s.offer[i]);
    s.offer = []; s.phase = 'play'; startDay(s); return true;
  };

  // 이벤트. 선택지의 give는 받는 것, cost는 내는 것, card는 덱에 들어오는 조각.
  D.canChoose = function (s, ch) {
    for (var k in (ch.cost || {})) if ((s.res[k] || 0) < ch.cost[k]) return false;
    return true;
  };
  D.choose = function (s, ch) {
    if (s.phase !== 'event') return false;
    var k;
    if (!ch || !D.canChoose(s, ch)) return false;
    for (k in (ch.cost || {})) s.res[k] -= ch.cost[k];
    for (k in (ch.give || {})) s.res[k] += ch.give[k];
    for (k in (ch.lose || {})) s.res[k] = Math.max(0, s.res[k] - ch.lose[k]);
    if (ch.card) s.hand.push(ch.card);
    s.event = null; s.phase = 'play'; return true;
  };

  D.daysLeft = function (s) { return s.perWeek - ((s.day - 1) % s.perWeek); };
  D.evaluate = function (s, quest) {
    var stars = 0;
    if (s.won) {
      stars = 1;
      (quest.days.bonus || []).forEach(function (g) { if (D.meets(s, g)) stars++; });
    }
    return { base: s.won, stars: stars };
  };
  D.meets = function (s, g) {
    if (g.t === 'left') return D.worth(s.res) >= g.n;
    if (g.t === 'people') return s.people >= g.n;
    return false;
  };
  ST.days = D;
})(typeof window !== 'undefined' ? window : globalThis);

// ───────────────────────────────────────────────────────────────────────────
// 일꾼 규칙. 의뢰에 work가 있으면 이 규칙으로 돈다(날짜 규칙보다 먼저 본다).
//  - 건물은 혼자 일하지 않는다. 일꾼을 보내야 일한다. 일꾼 한 명은 하루에 한 번 일한다.
//  - 밭에 보내면 곡식이 밭 위에 쌓인다. 빵집에 보내면 옆 밭에 쌓인 곡식을 밭마다 1개씩 가져와 빵으로 굽는다.
//  - 집을 지으면 주민이 이사 와서 다음 날부터 일한다. 주민은 저녁마다 빵 1개를 먹고, 못 먹으면 다음 날 쉰다.
//  - 조각은 상인의 꾸러미를 금화로 사서 얻는다. 조각을 놓는 데는 일꾼이 들지 않는다.
//  - 한 주의 마지막 날은 장날이다. 의뢰인이 빵을 가져간다. 모자라면 실패다.
//  - 옆에 붙여 지으면 생기는 조합(ST.PAGES)은 처음 효과가 났을 때 found에 적힌다.
(function (root) {
  var ST = root.ST, N = 5, W = {};
  W.CAP = 4;     // 밭 하나에 쌓이는 곡식
  W.SELL = 2;    // 빵 1개를 팔면 받는 금화
  W.ERRAND = 1;  // 일꾼 한 명이 상인 심부름을 하면 받는 금화
  W.PAY = 1;     // 장날에 낸 빵 1개마다 의뢰인이 주는 금화
  W.WORKABLE = { field: 1, bakery: 1, orchard: 1 };

  function nb(i) {
    var r = Math.floor(i / N), c = i % N, o = [];
    if (r > 0) o.push(i - N);
    if (r < N - 1) o.push(i + N);
    if (c > 0) o.push(i - 1);
    if (c < N - 1) o.push(i + 1);
    return o;
  }
  function isB(x) { return !!x && x.k === 'b'; }
  function rnd(s, n) { s.rs = (Math.imul(s.rs, 1103515245) + 12345) & 0x7fffffff; return (s.rs >> 8) % n; }
  function adj(s, cell, id) {
    var ns = nb(cell), n = 0;
    for (var k = 0; k < ns.length; k++) if (isB(s.board[ns[k]]) && s.board[ns[k]].id === id) n++;
    return n;
  }
  function find(s, id) { if (s.found.indexOf(id) < 0) { s.found.push(id); s.news.push(id); } }
  W.nb = nb;
  W.adj = adj;

  W.newGame = function (quest, seed) {
    var c = quest.work, s = {
      q: quest.id, rs: (seed | 0) || 1, day: 1, week: 0, perWeek: c.perWeek, quota: c.quota.slice(),
      board: [], inv: {}, gold: c.gold || 0, bread: 0,
      workers: [{ t: 'hero', used: false }, { t: 'donkey', used: false }],
      phase: 'play', found: [], news: [], fx: [], at: {},
      todo: {}, todoNew: [], todoList: (c.todo || []).map(function (t) { return { id: t.id, gold: t.gold }; }),
      stat: { grain: 0, baked: 0, bought: 0, dayBread: 0 },
      market: null, night: null, won: false, failed: false, event: null, eventsLeft: []
    };
    for (var i = 0; i < 25; i++) s.board.push(null);
    var t = quest.terrain || {};
    for (var key in t) s.board[+key] = { k: 't', t: t[key] };
    var ev = (c.events || []).slice();
    for (var e = ev.length - 1; e > 0; e--) { var j = rnd(s, e + 1), tmp = ev[e]; ev[e] = ev[j]; ev[j] = tmp; }
    s.eventsLeft = ev;
    for (var id in c.start) s.inv[id] = c.start[id];
    return s;
  };

  W.idle = function (s) { var n = 0; s.workers.forEach(function (w) { if (!w.used) n++; }); return n; };
  W.residents = function (s) { var n = 0; s.workers.forEach(function (w) { if (w.t === 'res') n++; }); return n; };

  var CHECK = {
    grain: function (s) { return s.stat.grain > 0; },
    bake: function (s) { return s.stat.baked > 0; },
    buy: function (s) { return s.stat.bought > 0; },
    house: function (s) { return W.residents(s) > 0; },
    page1: function (s) { return s.found.length >= 1; },
    bake4: function (s) { return s.stat.dayBread >= 4; },
    page3: function (s) { return s.found.length >= 3; }
  };
  function todos(s) {
    s.todoList.forEach(function (t) {
      if (s.todo[t.id] || !CHECK[t.id] || !CHECK[t.id](s)) return;
      s.todo[t.id] = true; s.gold += t.gold; s.todoNew.push(t.id);
    });
  }
  function begin(s) { s.fx = []; s.news = []; s.todoNew = []; }

  W.canBuild = function (s, id, cell) { return s.phase === 'play' && (s.inv[id] || 0) > 0 && !s.board[cell]; };
  W.build = function (s, id, cell) {
    if (!W.canBuild(s, id, cell)) return false;
    begin(s);
    s.inv[id]--;
    s.board[cell] = { k: 'b', id: id, w: 0 };
    if (id === 'house') s.workers.push({ t: 'res', home: cell, used: true, fresh: true });
    todos(s);
    return true;
  };

  // 빵집이 지금 구울 수 있는 곡식(옆 밭마다 1개)
  W.takeable = function (s, cell) {
    var ns = nb(cell), n = 0;
    for (var k = 0; k < ns.length; k++) { var x = s.board[ns[k]]; if (isB(x) && x.id === 'field' && x.w > 0) n++; }
    return n;
  };
  // 일꾼을 보낼 수 있으면 빈 글, 아니면 까닭
  W.canWork = function (s, cell) {
    var b = s.board[cell];
    if (s.phase !== 'play' || !isB(b)) return '거기는 일할 데가 아니에요.';
    if (!W.WORKABLE[b.id]) return (ST.PIECES[b.id].work && ST.PIECES[b.id].work.idle) || ST.PIECES[b.id].name + '에는 일꾼을 보내지 않아요.';
    if (!W.idle(s)) return '오늘 일할 일꾼이 없어요. "하루 마치기"를 눌러요.';
    if (b.id === 'field' && b.w >= W.CAP) return '이 밭은 곡식이 가득 쌓였어요. 빵집에서 먼저 구워요.';
    if (b.id === 'bakery' && !W.takeable(s, cell)) return '옆 밭에 쌓인 곡식이 없어요. 밭에 먼저 일꾼을 보내요.';
    return '';
  };
  // 지금 빵집에 일꾼을 보내면 나오는 빵(덤 포함)
  W.bakeOut = function (s, cell) {
    var n = W.takeable(s, cell);
    if (!n) return 0;
    return n + (n >= 3 ? 1 : 0) + (adj(s, cell, 'mill') > 0 ? 1 : 0);
  };
  // 일꾼이 필요 없는 건물이 지금 옆 칸을 돕고 있는가
  W.helping = function (s, cell) {
    var b = s.board[cell];
    if (!isB(b)) return false;
    if (b.id === 'well') return adj(s, cell, 'field') > 0;
    if (b.id === 'mill') return adj(s, cell, 'bakery') > 0;
    return false;
  };
  W.work = function (s, cell) {
    if (W.canWork(s, cell)) return false;
    begin(s);
    var b = s.board[cell], who = null, k;
    for (k = 0; k < s.workers.length; k++) if (!s.workers[k].used) { who = s.workers[k]; break; }
    who.used = true;
    s.at[cell] = who.t;
    if (b.id === 'field') {
      var wet = adj(s, cell, 'well') > 0, g = Math.min(wet ? 2 : 1, W.CAP - b.w);
      b.w += g; s.stat.grain += g;
      if (wet) find(s, 'wet');
      s.fx.push({ cell: cell, r: 'grain', n: g });
    } else if (b.id === 'bakery') {
      var ns = nb(cell), n = 0;
      for (k = 0; k < ns.length; k++) { var x = s.board[ns[k]]; if (isB(x) && x.id === 'field' && x.w > 0) { x.w--; n++; } }
      var out = n;
      if (n >= 3) { out++; find(s, 'oven'); }
      if (adj(s, cell, 'mill') > 0) { out++; find(s, 'flour'); }
      s.bread += out; s.stat.baked += out; s.stat.dayBread += out;
      s.fx.push({ cell: cell, r: 'bread', n: out });
    } else if (b.id === 'orchard') {
      s.gold += 2;
      s.fx.push({ cell: cell, r: 'gold', n: 2 });
    }
    todos(s);
    return true;
  };

  // 꾸러미: sure는 꼭 들어 있는 조각, or는 그중 하나가 들어 있다
  W.buy = function (s, pack) {
    if (s.phase !== 'play' || s.gold < pack.cost) return null;
    begin(s);
    s.gold -= pack.cost;
    var got = pack.sure.slice();
    if (pack.or && pack.or.length) {
      // 둘 중 하나는 번갈아 나온다. 같은 꾸러미를 두 번 사면 둘 다 얻는다
      s.lastOr = s.lastOr || {};
      var pick = pack.or[rnd(s, pack.or.length)], prev = s.lastOr[pack.id];
      if (prev && pack.or.length > 1 && pick === prev) pick = pack.or[(pack.or.indexOf(prev) + 1) % pack.or.length];
      s.lastOr[pack.id] = pick;
      got.push(pick);
    }
    got.forEach(function (id) { s.inv[id] = (s.inv[id] || 0) + 1; });
    s.stat.bought++;
    todos(s);
    return got;
  };
  W.sell = function (s) {
    if (s.phase !== 'play' || s.bread < 1) return false;
    begin(s);
    s.bread--; s.gold += W.SELL;
    return true;
  };

  // 심부름: 쉬는 일꾼 한 명이 상인의 짐을 날라 주고 금화를 받는다. 금화가 떨어졌을 때의 마지막 길이다
  W.errand = function (s) {
    if (s.phase !== 'play' || !W.idle(s)) return false;
    begin(s);
    for (var k = 0; k < s.workers.length; k++) if (!s.workers[k].used) { s.workers[k].used = true; break; }
    s.gold += W.ERRAND;
    return true;
  };

  // 하루를 마친다. 저녁에 주민이 먹고, 장날이면 납품한다.
  W.endDay = function (s) {
    if (s.phase !== 'play') return false;
    begin(s);
    var night = { ate: 0, hungry: 0, snack: 0 };
    s.workers.forEach(function (w) {
      if (w.t !== 'res' || w.fresh) return;
      if (adj(s, w.home, 'orchard') > 0) { night.snack++; w.hungry = false; find(s, 'snack'); }
      else if (s.bread > 0) { s.bread--; night.ate++; w.hungry = false; }
      else { w.hungry = true; night.hungry++; }
    });
    s.night = night;
    s.market = null;
    if (s.day % s.perWeek === 0) {
      var need = s.quota[s.week];
      if (s.bread < need) {
        s.market = { week: s.week, need: need, short: need - s.bread };
        s.failed = true; s.phase = 'over'; return true;
      }
      s.bread -= need;
      s.gold += need * W.PAY;
      s.market = { week: s.week, need: need, short: 0, pay: need * W.PAY };
      s.week++;
      if (s.week >= s.quota.length) { s.won = true; s.phase = 'over'; todos(s); return true; }
      s.phase = 'market';
    }
    s.day++;
    s.at = {};
    s.stat.dayBread = 0;
    s.workers = s.workers.filter(function (w) { return !w.guest; });
    s.workers.forEach(function (w) { w.used = !!w.hungry; w.fresh = false; });
    todos(s);
    if (s.phase === 'play') morning(s);
    return true;
  };
  // 주마다 사흘째 아침에 깜짝 이벤트가 하나 생긴다
  function morning(s) {
    if ((s.day - 1) % s.perWeek === 2 && s.eventsLeft.length) { s.event = s.eventsLeft.shift(); s.phase = 'event'; }
  }
  W.next = function (s) { if (s.phase === 'market') { s.phase = 'play'; morning(s); } };
  function fields(s) { var o = []; for (var i = 0; i < 25; i++) if (isB(s.board[i]) && s.board[i].id === 'field') o.push(s.board[i]); return o; }
  // 이벤트 선택지: cost 내는 것(모자라면 못 고름), give 받는 것, loseGrain 밭에서 사라지는 곡식,
  // rain 모든 밭에 곡식 1개, card 받는 조각, guest 오늘만 일하는 일꾼
  W.canChoose = function (s, ch) {
    for (var k in (ch.cost || {})) if ((s[k] || 0) < ch.cost[k]) return false;
    return true;
  };
  W.choose = function (s, ch) {
    if (s.phase !== 'event' || !ch || !W.canChoose(s, ch)) return false;
    begin(s);
    var k;
    for (k in (ch.cost || {})) s[k] -= ch.cost[k];
    for (k in (ch.give || {})) s[k] += ch.give[k];
    if (ch.loseGrain) { var n = ch.loseGrain; fields(s).sort(function (a, b) { return b.w - a.w; }).forEach(function (f) { var d = Math.min(n, f.w); f.w -= d; n -= d; }); }
    if (ch.rain) fields(s).forEach(function (f) { f.w = Math.min(W.CAP, f.w + 1); });
    if (ch.card) s.inv[ch.card] = (s.inv[ch.card] || 0) + 1;
    if (ch.guest) s.workers.push({ t: 'guest', used: false, guest: true });
    s.event = null; s.phase = 'play';
    return true;
  };

  W.daysLeft = function (s) { return s.perWeek - ((s.day - 1) % s.perWeek); };
  W.meets = function (s, g) {
    if (g.t === 'pages') return s.found.length >= g.n;
    if (g.t === 'res') return W.residents(s) >= g.n;
    return false;
  };
  W.evaluate = function (s, quest) {
    var stars = 0;
    if (s.won) { stars = 1; (quest.work.bonus || []).forEach(function (g) { if (W.meets(s, g)) stars++; }); }
    return { base: s.won, stars: stars };
  };
  ST.work = W;
})(typeof window !== 'undefined' ? window : globalThis);
