(function () {
  "use strict";

  var STORAGE_KEY = "portal-imperatriz-v2";
  var CARGO_LABEL = {
    comum: "Comum",
    transito: "Trânsito",
    guarda: "Guarda",
    todos: "Todos"
  };
  var PRIO_LABEL = {
    maxima: "Máxima",
    alta: "Alta",
    media: "Média",
    complementar: "Complementar"
  };
  var DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  var DAY_KEYS = [
    { id: 0, label: "Dom" },
    { id: 1, label: "Seg" },
    { id: 2, label: "Ter" },
    { id: 3, label: "Qua" },
    { id: 4, label: "Qui" },
    { id: 5, label: "Sex" },
    { id: 6, label: "Sáb" }
  ];

  var state = loadState();
  var activeWeek = 1;
  var charts = { bars: null, donut: null, line: null };
  var pomo = {
    running: false,
    mode: "focus",
    long: false,
    remaining: 25 * 60,
    timer: null
  };
  var flashIndex = 0;
  var flashFlipped = false;

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDays(iso, days) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function startOfWeekSunday(offsetWeeks) {
    var d = new Date();
    var dow = d.getDay();
    d.setDate(d.getDate() - dow + (offsetWeeks || 0) * 7);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function parseScore(text) {
    var m = String(text || "").match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return { acertos: 0, total: 0 };
    return { acertos: Number(m[1]), total: Number(m[2]) };
  }

  function pctClass(p) {
    if (p < 60) return "pct-low";
    if (p < 80) return "pct-mid";
    return "pct-high";
  }

  function badgeCargo(c) {
    return '<span class="badge b-' + c + '">' + (CARGO_LABEL[c] || c) + "</span>";
  }

  function badgePrio(p) {
    return '<span class="badge b-' + p + '">' + (PRIO_LABEL[p] || p) + "</span>";
  }

  function defaultProgress() {
    var map = {};
    PORTAL_DATA.topics.forEach(function (t) {
      map[t.id] = { teoria: false, r24: false, r7: false, r30: false };
    });
    return map;
  }

  function defaultLevels() {
    var discs = uniqueDisciplinas();
    var levels = {};
    discs.forEach(function (d) {
      levels[d] = "intermediario";
    });
    return levels;
  }

  function uniqueDisciplinas() {
    var set = {};
    allTopics().forEach(function (t) {
      set[t.disciplina] = true;
    });
    return Object.keys(set);
  }

  function allTopics() {
    var extra = (typeof state !== "undefined" && state && state.customTopics) || [];
    var topics = (window.PORTAL_DATA && PORTAL_DATA.topics) || [];
    return topics.concat(extra);
  }

  function emptyState() {
    return {
      xp: 0,
      progress: defaultProgress(),
      customTopics: [],
      schedule: [],
      questoes: [],
      erros: [],
      flashcards: [],
      revisoes: [],
      simulados: [],
      treinos: [],
      hours: { comum: 0, transito: 0, guarda: 0, planned: 0 },
      planConfig: {
        cargoFoco: "ambos",
        days: [1, 2, 3, 4, 5, 6],
        hours: 3,
        phase: "1",
        levels: defaultLevels()
      },
      pomoLong: false,
      tafSexo: "masculino"
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("portal-imperatriz-v1");
      if (!raw) return emptyState();
      var parsed = JSON.parse(raw);
      var base = emptyState();
      Object.keys(base).forEach(function (k) {
        if (parsed[k] !== undefined) base[k] = parsed[k];
      });
      PORTAL_DATA.topics.forEach(function (t) {
        if (!base.progress[t.id]) {
          base.progress[t.id] = { teoria: false, r24: false, r7: false, r30: false };
        }
      });
      return base;
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderXP();
  }

  function addXP(pts) {
    state.xp = Math.max(0, (state.xp || 0) + pts);
  }

  function renderXP() {
    var el = document.getElementById("xpValue");
    if (el) el.textContent = (state.xp || 0).toLocaleString("pt-BR") + " XP";
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.style.display = "block";
    setTimeout(function () {
      el.style.display = "none";
    }, 2400);
  }

  function playBeep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(function () {
        osc.stop();
        ctx.close();
      }, 280);
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function topicStatus(p) {
    if (!p) return { label: "Pendente", cls: "b-pend" };
    var n = Number(p.teoria) + Number(p.r24) + Number(p.r7) + Number(p.r30);
    if (n === 4) return { label: "Concluído", cls: "b-ok" };
    if (n > 0) return { label: "Em andamento", cls: "b-warn" };
    return { label: "Pendente", cls: "b-pend" };
  }

  function scheduleReview(topicId, assunto, origem, tipo, days) {
    var due = addDays(todayISO(), days);
    var exists = state.revisoes.some(function (r) {
      return r.topicId === topicId && r.tipo === tipo && !r.done;
    });
    if (exists) return;
    state.revisoes.push({
      id: uid("rev"),
      topicId: topicId,
      assunto: assunto,
      origem: origem,
      tipo: tipo,
      due: due,
      done: false
    });
  }

  /* ---------- NAV ---------- */
  function setTab(id) {
    if (!id) return;
    document.querySelectorAll(".tab").forEach(function (el) {
      el.classList.toggle("active", el.id === "tab-" + id);
    });
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === id);
    });
    var side = document.getElementById("sidebar");
    var overlay = document.getElementById("overlay");
    if (side) side.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
    try {
      if (id === "plano") renderPlano();
      if (id === "dashboard") renderDashboard();
      if (id === "matriz") renderMatriz();
      if (id === "questoes") renderQuestoes();
      if (id === "erros") renderErros();
      if (id === "revisoes") renderRevisoes();
      if (id === "simulados") renderSimulados();
      if (id === "taf") renderTaf();
    } catch (err) {
      if (window.console && console.error) console.error(err);
    }
  }

  /* ---------- PLANO & QUADRO KANBAN ESTILO AGORA VAI ---------- */
  function renderPlano() {
    var cfg = state.planConfig;
    document.getElementById("planCargoFoco").value = cfg.cargoFoco || "ambos";
    var wrap = document.getElementById("planDays");
    wrap.innerHTML = DAY_KEYS.map(function (d) {
      var on = cfg.days.indexOf(d.id) !== -1;
      return (
        '<label><input type="checkbox" data-day="' +
        d.id +
        '"' +
        (on ? " checked" : "") +
        "> " +
        d.label +
        "</label>"
      );
    }).join("");
    document.getElementById("planHours").value = cfg.hours || 3;
    document.getElementById("planPhase").value = cfg.phase || "1";

    var levelsEl = document.getElementById("planLevels");
    levelsEl.innerHTML = uniqueDisciplinas()
      .map(function (d) {
        var v = (cfg.levels && cfg.levels[d]) || "intermediario";
        return (
          '<div class="level-item"><span>' +
          esc(d) +
          '</span><select data-level="' +
          esc(d) +
          '">' +
          opt("iniciante", "Iniciante", v) +
          opt("intermediario", "Intermediário", v) +
          opt("avancado", "Avançado", v) +
          "</select></div>"
        );
      })
      .join("");

    if (!state.schedule || !state.schedule.length) {
      generateSchedule(true);
    } else {
      var weekOne = state.schedule.filter(function (b) {
        return Number(b.semana) === 1;
      });
      var weekTwo = state.schedule.filter(function (b) {
        return Number(b.semana) === 2;
      });
      var weekOneComplete = weekOne.length > 0 && weekOne.every(function (b) {
        return b.done;
      });
      var weekTwoComplete = weekTwo.length > 0 && weekTwo.every(function (b) {
        return b.done;
      });

      if (weekOneComplete && !weekTwoComplete) {
        activeWeek = 2;
      }
      if (weekOneComplete && weekTwoComplete) {
        activeWeek = 1;
        generateSchedule(true);
        return;
      }
      renderKanban();
    }
  }

  function opt(val, label, cur) {
    return '<option value="' + val + '"' + (cur === val ? " selected" : "") + ">" + label + "</option>";
  }

  function levelWeight(lv) {
    if (lv === "iniciante") return 3;
    if (lv === "avancado") return 1;
    return 2;
  }

  function readPlanConfig() {
    state.planConfig.cargoFoco = document.getElementById("planCargoFoco").value;
    state.planConfig.days = Array.prototype.map
      .call(document.querySelectorAll("#planDays input:checked"), function (el) {
        return Number(el.dataset.day);
      });
    state.planConfig.hours = Number(document.getElementById("planHours").value) || 3;
    state.planConfig.phase = document.getElementById("planPhase").value;
    state.planConfig.levels = state.planConfig.levels || {};
    document.querySelectorAll("#planLevels select").forEach(function (sel) {
      state.planConfig.levels[sel.dataset.level] = sel.value;
    });
    save();
  }

  function generateSchedule(silent) {
    readPlanConfig();
    var cfg = state.planConfig;
    var phase = PORTAL_DATA.fases[cfg.phase] || PORTAL_DATA.fases[1];
    var days = cfg.days.slice().sort(function (a, b) { return a - b; });
    if (!days.length) {
      if (!silent) toast("Selecione ao menos um dia da semana.");
      return;
    }

    var cargoFoco = cfg.cargoFoco || "ambos";
    var filteredTopics = allTopics().filter(function (t) {
      if (cargoFoco === "transito") return t.cargo === "comum" || t.cargo === "transito";
      if (cargoFoco === "guarda") return t.cargo === "comum" || t.cargo === "guarda";
      return true;
    });

    var levelMap = cfg.levels || {};
    var topics = filteredTopics.slice().sort(function (a, b) {
      var wa = (PORTAL_DATA.pesosEdital[a.disciplina] || 5) * levelWeight(levelMap[a.disciplina]);
      var wb = (PORTAL_DATA.pesosEdital[b.disciplina] || 5) * levelWeight(levelMap[b.disciplina]);
      var pa = { maxima: 4, alta: 3, media: 2, complementar: 1 }[a.prioridade] || 1;
      var pb = { maxima: 4, alta: 3, media: 2, complementar: 1 }[b.prioridade] || 1;
      return wb + pb * 2 - (wa + pa * 2);
    });

    var types = [];
    var mix = [
      ["estudo", phase.estudo || phase.teoria || 50],
      ["exercicio", phase.exercicio || phase.questoes || 30],
      ["revisao", phase.revisao || 20]
    ];
    mix.forEach(function (pair) {
      var n = Math.max(1, Math.round(pair[1] / 10));
      for (var i = 0; i < n; i++) types.push(pair[0]);
    });

    var blocks = [];
    var hoursDay = Number(cfg.hours) || 3;
    var totalMins = Math.round(hoursDay * 60);
    var nBlocks = Math.max(2, Math.round(totalMins / 60));
    var slotMin = Math.round(totalMins / nBlocks);
    var ti = 0;
    var lastDisc = "";

    for (var w = 1; w <= 2; w++) {
      var sundayISO = startOfWeekSunday(w - 1);
      days.forEach(function (dow) {
        var dateISO = addDays(sundayISO, dow);
        for (var b = 0; b < nBlocks; b++) {
          var topic = pickTopic(topics, lastDisc, ti);
          lastDisc = topic.disciplina;
          ti++;
          var kind = types[(b + dow + w) % types.length];
          var dur = kind === "revisao" ? Math.min(30, slotMin) : slotMin;
          blocks.push({
            id: uid("blk"),
            semana: w,
            dow: dow,
            dateISO: dateISO,
            dia: DAY_NAMES[dow],
            cargo: topic.cargo,
            disciplina: topic.disciplina,
            assunto: topic.assunto,
            kind: kind,
            previsto: dur,
            realizado: 0,
            done: false,
            topicId: topic.id
          });
        }
      });
    }

    state.schedule = blocks;
    state.hours.planned = blocks.reduce(function (s, b) {
      return s + b.previsto / 60;
    }, 0);
    save();
    renderKanban();
    if (!silent) {
      document.getElementById("planConfigDrawer").hidden = true;
      toast("Quadro semanal gerado com " + blocks.length + " metas!");
    }
  }

  function pickTopic(topics, lastDisc, i) {
    var alt = topics.find(function (t, idx) {
      return t.disciplina !== lastDisc && idx >= i % topics.length;
    });
    return alt || topics[i % topics.length];
  }

  function replanDelayed() {
    var today = todayISO();
    var delayed = state.schedule.filter(function (b) {
      return !b.done && b.dateISO && b.dateISO < today;
    });
    if (!delayed.length) {
      toast("Nenhuma meta atrasada para replanejar!");
      return;
    }
    var cfgDays = (state.planConfig && state.planConfig.days) || [1, 2, 3, 4, 5, 6];
    var cursor = today;
    var moved = 0;
    delayed.forEach(function (b) {
      for (var step = 0; step < 14; step++) {
        var cand = addDays(cursor, step);
        var dow = new Date(cand + "T12:00:00").getDay();
        if (cfgDays.indexOf(dow) !== -1) {
          b.dateISO = cand;
          b.dow = dow;
          b.dia = DAY_NAMES[dow];
          var w1Start = startOfWeekSunday(0);
          var w2Start = startOfWeekSunday(1);
          b.semana = cand >= w2Start ? 2 : 1;
          cursor = addDays(cand, 1);
          moved++;
          break;
        }
      }
    });
    save();
    renderKanban();
    toast(moved + " metas atrasadas redistribuídas nos próximos dias!");
  }

  function renderKanban() {
    var board = document.getElementById("kanbanBoard");
    var sundayISO = startOfWeekSunday(activeWeek - 1);
    var today = todayISO();
    var weekBlocks = (state.schedule || []).filter(function (b) {
      return Number(b.semana) === Number(activeWeek);
    });

    var doneCount = weekBlocks.filter(function (b) { return b.done; }).length;
    document.getElementById("weekStats").textContent =
      doneCount + " de " + weekBlocks.length + " metas concluídas nesta semana";

    var pendingReviews = (state.revisoes || []).filter(function (r) {
      return !r.done;
    });
    var overdueCount = pendingReviews.filter(function (r) { return r.due < today; }).length;
    var count24h = pendingReviews.filter(function (r) { return r.tipo === "24h"; }).length;
    var count7d = pendingReviews.filter(function (r) { return r.tipo === "7d"; }).length;
    var count30d = pendingReviews.filter(function (r) { return r.tipo === "30d"; }).length;

    var summaryEl = document.getElementById("weekReviewSummary");
    if (!summaryEl) {
      summaryEl = document.createElement("div");
      summaryEl.id = "weekReviewSummary";
      summaryEl.className = "week-review-summary";
      board.parentNode.insertBefore(summaryEl, board);
    }
    summaryEl.innerHTML =
      '<div class="review-summary-item due"><span>Revisões atrasadas</span><strong>' + overdueCount + '</strong></div>' +
      '<div class="review-summary-item"><span>24 horas</span><strong>' + count24h + '</strong></div>' +
      '<div class="review-summary-item"><span>7 dias</span><strong>' + count7d + '</strong></div>' +
      '<div class="review-summary-item"><span>30 dias</span><strong>' + count30d + '</strong></div>';

    var kindLabel = {
      estudo: "Estudo",
      exercicio: "Exercício",
      revisao: "Revisão"
    };

    var colsHtml = [];
    for (var dow = 0; dow < 7; dow++) {
      var colDate = addDays(sundayISO, dow);
      var isToday = colDate === today;
      var dayBlocks = weekBlocks.filter(function (b) { return Number(b.dow) === dow; });

      var cardsHtml = dayBlocks
        .map(function (b) {
          var k = b.kind || "estudo";
          return (
            '<div class="study-card type-' + k + (b.done ? " done" : "") + '" data-toggle-blk="' + b.id + '" title="Clique para marcar/desmarcar como concluído">' +
            '<div class="sc-cargo">' + (CARGO_LABEL[b.cargo] || b.cargo) + '</div>' +
            '<div class="sc-disc">' + esc(b.disciplina) + '</div>' +
            '<div class="sc-assunto">' + esc(b.assunto) + '</div>' +
            '<div class="sc-footer">' +
            '<span class="sc-type">' + (kindLabel[k] || "Estudo") + '</span>' +
            '<span class="sc-pill">' + b.previsto + ' mins</span>' +
            '</div>' +
            '</div>'
          );
        })
        .join("");

      colsHtml.push(
        '<div class="day-col">' +
        '<div class="day-col-header' + (isToday ? " today" : "") + '">' +
        '<div><span class="day-name">' + DAY_NAMES[dow] + '</span><span class="day-date">' + fmtDate(colDate) + '</span></div>' +
        '<span class="day-count">' + dayBlocks.length + '</span>' +
        '</div>' +
        '<div class="day-cards">' +
        (cardsHtml || '<div class="day-empty">Dia livre / Descanso</div>') +
        '</div>' +
        '</div>'
      );
    }

    board.innerHTML = colsHtml.join("");
  }

  function toggleBlock(id) {
    var b = state.schedule.find(function (x) { return x.id === id; });
    if (!b) return;
    b.done = !b.done;
    if (b.done) {
      b.realizado = b.previsto;
      state.hours[b.cargo] = (state.hours[b.cargo] || 0) + b.previsto / 60;
      addXP(150);
      if (!state.progress[b.topicId]) {
        state.progress[b.topicId] = { teoria: false, r24: false, r7: false, r30: false };
      }
      state.progress[b.topicId].teoria = true;
      scheduleReview(b.topicId, b.assunto, "Quadro Semanal", "24h", 1);
      scheduleReview(b.topicId, b.assunto, "Quadro Semanal", "7d", 7);
      scheduleReview(b.topicId, b.assunto, "Quadro Semanal", "30d", 30);
      toast("Meta concluída! +150 XP e revisões agendadas.");
    } else {
      b.realizado = 0;
      state.hours[b.cargo] = Math.max(0, (state.hours[b.cargo] || 0) - b.previsto / 60);
      addXP(-150);
      toast("Meta reaberta.");
    }
    save();
    renderKanban();

    if (Number(b.semana) === 1) {
      var weekOneBlocks = state.schedule.filter(function (item) {
        return Number(item.semana) === 1;
      });
      var weekOneComplete = weekOneBlocks.length > 0 && weekOneBlocks.every(function (item) {
        return item.done;
      });
      if (weekOneComplete) {
        activeWeek = 2;
        renderKanban();
        toast("Semana 1 concluída! Abrindo a Semana 2.");
      }
    } else if (Number(b.semana) === 2) {
      var weekTwoBlocks = state.schedule.filter(function (item) {
        return Number(item.semana) === 2;
      });
      var weekTwoComplete = weekTwoBlocks.length > 0 && weekTwoBlocks.every(function (item) {
        return item.done;
      });
      if (weekTwoComplete) {
        activeWeek = 1;
        generateSchedule(false);
        toast("Semana 2 concluída! Um novo ciclo foi gerado automaticamente.");
      }
    }
  }

  /* ---------- DASHBOARD ---------- */
  function renderDashboard() {
    var hoursDone = state.hours.comum + state.hours.transito + state.hours.guarda;
    var planned = state.hours.planned || 0;
    var hoursPct = planned ? Math.min(100, (hoursDone / planned) * 100) : 0;
    document.getElementById("kpiHours").textContent =
      hoursDone.toFixed(1) + "h / " + planned.toFixed(1) + "h";
    document.getElementById("kpiHoursMeta").textContent =
      hoursPct.toFixed(0) + "% da meta semanal cumprida";
    document.getElementById("kpiHoursBar").style.width = hoursPct + "%";

    var totQ = 0;
    var totA = 0;
    state.questoes.forEach(function (q) {
      totQ += Number(q.qtd) || 0;
      totA += Number(q.acertos) || 0;
    });
    var totE = totQ - totA;
    var qPct = totQ ? (totA / totQ) * 100 : 0;
    document.getElementById("kpiQuestions").textContent = totQ;
    document.getElementById("kpiQuestionsMeta").textContent =
      totA + " acertos · " + totE + " erros · " + qPct.toFixed(1) + "% aproveitamento";
    document.getElementById("kpiQuestionsBar").style.width = qPct + "%";

    var topics = allTopics();
    var done = topics.filter(function (t) {
      var p = state.progress[t.id];
      return p && p.teoria && p.r24 && p.r7 && p.r30;
    }).length;
    var ePct = topics.length ? (done / topics.length) * 100 : 0;
    document.getElementById("kpiEdital").textContent = ePct.toFixed(0) + "%";
    document.getElementById("kpiEditalMeta").textContent =
      done + " de " + topics.length + " tópicos concluídos";
    document.getElementById("kpiEditalBar").style.width = ePct + "%";

    renderCharts();
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function renderCharts() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#64748b";
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.borderColor = "#e2e8f0";

    var byDisc = {};
    state.questoes.forEach(function (q) {
      if (!byDisc[q.disciplina]) byDisc[q.disciplina] = { a: 0, t: 0 };
      byDisc[q.disciplina].a += Number(q.acertos) || 0;
      byDisc[q.disciplina].t += Number(q.qtd) || 0;
    });
    var labels = Object.keys(byDisc);
    var values = labels.map(function (k) {
      return byDisc[k].t ? Math.round((byDisc[k].a / byDisc[k].t) * 100) : 0;
    });
    destroyChart("bars");
    charts.bars = new Chart(document.getElementById("chartBars"), {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["Sem registros"],
        datasets: [
          {
            label: "% acertos",
            data: labels.length ? values : [0],
            backgroundColor: "#0f2c7a",
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + "%"; } } }
        },
        plugins: { legend: { display: false } }
      }
    });

    destroyChart("donut");
    charts.donut = new Chart(document.getElementById("chartDonut"), {
      type: "doughnut",
      data: {
        labels: ["Comum", "Agente de Trânsito", "Guarda Municipal"],
        datasets: [
          {
            data: [state.hours.comum, state.hours.transito, state.hours.guarda],
            backgroundColor: ["#1d4ed8", "#d97706", "#15803d"],
            borderWidth: 2,
            borderColor: "#ffffff"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } }
      }
    });

    var sims = state.simulados.slice().sort(function (a, b) {
      return a.data.localeCompare(b.data);
    });
    destroyChart("line");
    charts.line = new Chart(document.getElementById("chartLine"), {
      type: "line",
      data: {
        labels: sims.length ? sims.map(function (s) { return fmtDate(s.data); }) : ["—"],
        datasets: [
          {
            label: "% aproveitamento",
            data: sims.length ? sims.map(function (s) { return s.pct; }) : [0],
            borderColor: "#b91c1c",
            backgroundColor: "rgba(185, 28, 28, 0.08)",
            fill: true,
            tension: 0.3,
            pointBackgroundColor: "#b91c1c"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: function (v) { return v + "%"; } } }
        }
      }
    });
  }

  /* ---------- MATRIZ & EDITAL ---------- */
  function renderMatriz() {
    var cargoSel = document.getElementById("filterCargo");
    var prioSel = document.getElementById("filterPrioridade");
    var discSel = document.getElementById("filterDisciplina");

    if (!cargoSel.options.length) {
      PORTAL_DATA.cargos.forEach(function (c) {
        cargoSel.appendChild(new Option(c.label, c.id));
      });
      PORTAL_DATA.prioridades.forEach(function (p) {
        prioSel.appendChild(new Option(p.label, p.id));
      });
    }
    var prevDisc = discSel.value || "todas";
    discSel.innerHTML = '<option value="todas">Todas as Disciplinas</option>';
    uniqueDisciplinas().forEach(function (d) {
      discSel.appendChild(new Option(d, d));
    });
    discSel.value = prevDisc;

    var cargo = cargoSel.value || "todos";
    var prio = prioSel.value || "todas";
    var disc = discSel.value || "todas";
    var busca = (document.getElementById("filterBusca").value || "").toLowerCase();

    var rows = allTopics().filter(function (t) {
      if (cargo !== "todos" && t.cargo !== cargo) return false;
      if (prio !== "todas" && t.prioridade !== prio) return false;
      if (disc !== "todas" && t.disciplina !== disc) return false;
      if (busca && (t.disciplina + " " + t.assunto).toLowerCase().indexOf(busca) === -1) return false;
      return true;
    });

    var html = rows
      .map(function (t) {
        var p = state.progress[t.id] || { teoria: false, r24: false, r7: false, r30: false };
        var st = topicStatus(p);
        return (
          "<tr>" +
          "<td>" + badgeCargo(t.cargo) + "</td>" +
          "<td><strong>" + esc(t.disciplina) + "</strong></td>" +
          "<td>" + esc(t.assunto) + "</td>" +
          "<td>" + badgePrio(t.prioridade) + "</td>" +
          checkCell(t.id, "teoria", p.teoria) +
          checkCell(t.id, "r24", p.r24) +
          checkCell(t.id, "r7", p.r7) +
          checkCell(t.id, "r30", p.r30) +
          '<td><span class="badge ' + st.cls + '">' + st.label + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
    document.getElementById("topicsBody").innerHTML =
      html || '<tr><td colspan="9" class="empty">Nenhum tópico encontrado com esses filtros.</td></tr>';
    fillDiscList();
  }

  function checkCell(id, key, val) {
    return (
      '<td><input type="checkbox" style="width:auto;accent-color:var(--primary)" data-topic="' +
      esc(id) +
      '" data-key="' +
      key +
      '"' +
      (val ? " checked" : "") +
      "></td>"
    );
  }

  function fillDiscList() {
    var list = document.getElementById("discList");
    list.innerHTML = uniqueDisciplinas()
      .map(function (d) {
        return '<option value="' + esc(d) + '">';
      })
      .join("");
  }

  function onTopicCheck(e) {
    var t = e.target;
    if (!t.matches("input[data-topic]")) return;
    var id = t.dataset.topic;
    var key = t.dataset.key;
    if (!state.progress[id]) state.progress[id] = { teoria: false, r24: false, r7: false, r30: false };
    state.progress[id][key] = t.checked;
    var topic = allTopics().find(function (x) { return x.id === id; });
    if (t.checked) {
      addXP(50);
      if (topic && key === "teoria") {
        scheduleReview(id, topic.assunto, "Edital Vertical", "24h", 1);
        scheduleReview(id, topic.assunto, "Edital Vertical", "7d", 7);
        scheduleReview(id, topic.assunto, "Edital Vertical", "30d", 30);
      }
    }
    save();
    renderMatriz();
  }

  /* ---------- QUESTOES ---------- */
  function renderQuestoes() {
    if (!document.getElementById("qDate").value) document.getElementById("qDate").value = todayISO();
    var rows = state.questoes.slice().reverse();
    document.getElementById("questoesBody").innerHTML =
      rows
        .map(function (q) {
          var erros = q.qtd - q.acertos;
          var p = q.qtd ? (q.acertos / q.qtd) * 100 : 0;
          return (
            "<tr>" +
            "<td>" + fmtDate(q.data) + "</td>" +
            "<td>" + badgeCargo(q.cargo) + "</td>" +
            "<td>" + esc(q.disciplina) + "</td>" +
            "<td>" + esc(q.assunto) + "</td>" +
            "<td>" + esc(q.banca) + "</td>" +
            "<td>" + esc(q.nivel) + "</td>" +
            "<td>" + q.qtd + "</td>" +
            "<td>" + q.acertos + "</td>" +
            "<td>" + erros + "</td>" +
            '<td class="' + pctClass(p) + '">' + p.toFixed(1) + "%</td>" +
            '<td><button class="btn btn-danger" data-del-q="' + q.id + '">Excluir</button></td>' +
            "</tr>"
          );
        })
        .join("") || '<tr><td colspan="11" class="empty">Nenhuma bateria de questões registrada ainda.</td></tr>';
  }

  /* ---------- ERROS / FLASHCARDS ---------- */
  function renderErros() {
    if (!document.getElementById("eProx").value) document.getElementById("eProx").value = addDays(todayISO(), 1);
    var f = (document.getElementById("erroFiltro").value || "").toLowerCase();
    var rows = state.erros.filter(function (e) {
      if (!f) return true;
      return (e.disciplina + " " + e.assunto + " " + e.motivo).toLowerCase().indexOf(f) !== -1;
    });
    document.getElementById("errosBody").innerHTML =
      rows
        .map(function (e) {
          return (
            "<tr>" +
            "<td>" + esc(e.resumo) + "</td>" +
            "<td>" + esc(e.disciplina) + "</td>" +
            "<td>" + esc(e.assunto) + "</td>" +
            "<td>" + esc(e.motivo) + "</td>" +
            "<td>" + esc(e.explicacao) + "</td>" +
            "<td>" + fmtDate(e.proxima) + "</td>" +
            '<td><button class="btn btn-danger" data-del-e="' + e.id + '">Excluir</button></td>' +
            "</tr>"
          );
        })
        .join("") || '<tr><td colspan="7" class="empty">Caderno de erros vazio.</td></tr>';
    renderFlash();
  }

  function dueFlashcards() {
    var today = todayISO();
    var due = state.flashcards.filter(function (f) {
      return !f.next || f.next <= today;
    });
    return due.length ? due : state.flashcards;
  }

  function renderFlash() {
    var list = dueFlashcards();
    var stage = document.getElementById("flashStage");
    if (!state.flashcards.length) {
      stage.innerHTML = '<div class="empty">Nenhum flashcard criado ainda.</div>';
      return;
    }
    if (flashIndex >= list.length) flashIndex = 0;
    var card = list[flashIndex];
    flashFlipped = false;
    stage.innerHTML =
      '<div class="flashcard" id="flashCard">' +
      '<div class="flash-face flash-front"><div><div class="flash-kicker">' +
      esc(card.disciplina || "Flashcard") +
      " · " +
      (flashIndex + 1) +
      "/" +
      list.length +
      '</div><div style="font-size:15px;font-weight:600">' +
      esc(card.front) +
      "</div></div></div>" +
      '<div class="flash-face flash-back"><div><div class="flash-kicker">Resposta</div><div style="font-size:15px;font-weight:600">' +
      esc(card.back) +
      "</div></div></div></div>";
  }

  function flipFlash() {
    var el = document.getElementById("flashCard");
    if (!el) return;
    flashFlipped = !flashFlipped;
    el.classList.toggle("flipped", flashFlipped);
  }

  function gradeFlash(ok) {
    var list = dueFlashcards();
    if (!list.length) return;
    var card = list[flashIndex];
    card.next = addDays(todayISO(), ok ? 7 : 1);
    if (ok) addXP(25);
    save();
    flashIndex++;
    renderFlash();
    toast(ok ? "Ótimo! Revisar em 7 dias (+25 XP)." : "Revisar novamente amanhã.");
  }

  /* ---------- REVISOES ---------- */
  function renderRevisoes() {
    var today = todayISO();
    var week = addDays(today, 7);
    var items = state.revisoes.slice().sort(function (a, b) {
      return a.due.localeCompare(b.due);
    });
    var hoje = items.filter(function (r) { return !r.done && r.due === today; }).length;
    var atraso = items.filter(function (r) { return !r.done && r.due < today; }).length;
    var sem = items.filter(function (r) { return !r.done && r.due > today && r.due <= week; }).length;
    document.getElementById("revHoje").textContent = hoje;
    document.getElementById("revAtraso").textContent = atraso;
    document.getElementById("revSemana").textContent = sem;
    document.getElementById("revisoesBody").innerHTML =
      items
        .map(function (r) {
          var st, cls;
          if (r.done) {
            st = "Concluída";
            cls = "b-ok";
          } else if (r.due < today) {
            st = "Atrasada";
            cls = "b-late";
          } else if (r.due === today) {
            st = "Hoje";
            cls = "b-ok";
          } else {
            st = "Agendada";
            cls = "b-pend";
          }
          return (
            "<tr>" +
            "<td>" + esc(r.assunto) + "</td>" +
            "<td>" + esc(r.origem) + "</td>" +
            "<td>" + esc(r.tipo) + "</td>" +
            "<td>" + fmtDate(r.due) + "</td>" +
            '<td><span class="badge ' + cls + '">' + st + "</span></td>" +
            "<td>" +
            (r.done
              ? "—"
              : '<button class="btn btn-primary" data-rev="' + r.id + '">Concluir</button>') +
            "</td>" +
            "</tr>"
          );
        })
        .join("") || '<tr><td colspan="6" class="empty">Nenhuma revisão agendada ainda.</td></tr>';
  }

  function completeReview(id) {
    var r = state.revisoes.find(function (x) { return x.id === id; });
    if (!r) return;
    r.done = true;
    addXP(80);
    if (r.topicId && state.progress[r.topicId]) {
      if (r.tipo === "24h") state.progress[r.topicId].r24 = true;
      if (r.tipo === "7d") state.progress[r.topicId].r7 = true;
      if (r.tipo === "30d") state.progress[r.topicId].r30 = true;
    }
    save();
    renderRevisoes();
    toast("Revisão concluída! +80 XP");
  }

  /* ---------- SIMULADOS ---------- */
  function renderSimulados() {
    if (!document.getElementById("sDate").value) document.getElementById("sDate").value = todayISO();
    document.getElementById("simuladosBody").innerHTML =
      state.simulados
        .slice()
        .reverse()
        .map(function (s) {
          var corte = s.cargo === "guarda" ? 50 : 40;
          var ok = s.pct >= corte;
          return (
            "<tr>" +
            "<td>" + fmtDate(s.data) + "</td>" +
            "<td>" + badgeCargo(s.cargo) + "</td>" +
            "<td>" + esc(s.port) + "</td>" +
            "<td>" + esc(s.inf) + "</td>" +
            "<td>" + esc(s.rlm) + "</td>" +
            "<td>" + esc(s.esp) + "</td>" +
            "<td>" + s.acertos + "/" + s.total + "</td>" +
            '<td class="' + pctClass(s.pct) + '">' + s.pct.toFixed(1) + "%</td>" +
            "<td>" +
            (ok
              ? '<span class="badge b-ok">Atingiu (' + corte + "%)</span>"
              : '<span class="badge b-late">Abaixo (' + corte + "%)</span>") +
            "</td>" +
            '<td><button class="btn btn-danger" data-del-s="' + s.id + '">Excluir</button></td>' +
            "</tr>"
          );
        })
        .join("") || '<tr><td colspan="10" class="empty">Nenhum simulado registrado ainda.</td></tr>';
  }

  /* ---------- TAF ---------- */
  function currentTaf() {
    return PORTAL_DATA.taf[state.tafSexo || "masculino"];
  }

  function bestMarks() {
    var keys = Object.keys(currentTaf());
    var best = {};
    keys.forEach(function (k) { best[k] = null; });
    state.treinos
      .filter(function (t) { return t.sexo === state.tafSexo; })
      .forEach(function (t) {
        keys.forEach(function (k) {
          var v = Number(t.marcas[k]);
          if (isNaN(v)) return;
          var spec = currentTaf()[k];
          if (best[k] == null) best[k] = v;
          else if (spec.minBetter) best[k] = Math.min(best[k], v);
          else best[k] = Math.max(best[k], v);
        });
      });
    return best;
  }

  function aptoText(spec, value) {
    if (value == null || isNaN(value)) return { ok: false, text: "Sem registro" };
    var ok = spec.minBetter ? value <= spec.meta : value >= spec.meta;
    if (ok) return { ok: true, text: "APTO" };
    var gap = spec.minBetter ? (value - spec.meta).toFixed(1) : (spec.meta - value).toFixed(0);
    return {
      ok: false,
      text: spec.minBetter ? "Faltam " + gap + spec.unidade : "Faltam " + gap + " " + spec.unidade
    };
  }

  function renderTaf() {
    document.getElementById("tafSexo").value = state.tafSexo || "masculino";
    var specs = currentTaf();
    var best = bestMarks();
    document.getElementById("tafMetasBody").innerHTML = Object.keys(specs)
      .map(function (k) {
        var s = specs[k];
        var a = aptoText(s, best[k]);
        var meta = s.minBetter ? "< " + s.meta + s.unidade : s.meta + " " + s.unidade;
        return (
          "<tr><td>" + esc(s.label) + "</td><td>" + meta + "</td><td>" +
          (best[k] == null ? "—" : best[k] + " " + s.unidade) +
          '</td><td class="' + (a.ok ? "apto" : "n-apto") + '">' + a.text + "</td></tr>"
        );
      })
      .join("");
    var fields = document.getElementById("tafFields");
    fields.style.flex = "3";
    fields.innerHTML =
      '<div class="form-grid" style="margin:0">' +
      Object.keys(specs)
        .map(function (k) {
          return (
            '<div class="field"><label>' + esc(specs[k].label) + " (" + specs[k].unidade + ')</label><input type="number" step="0.01" data-taf="' + k + '"></div>'
          );
        })
        .join("") +
      "</div>";
    if (!document.getElementById("tDate").value) document.getElementById("tDate").value = todayISO();
    document.getElementById("tafBody").innerHTML =
      state.treinos
        .slice()
        .reverse()
        .map(function (t) {
          var spec = PORTAL_DATA.taf[t.sexo];
          var marks = Object.keys(t.marcas)
            .map(function (k) {
              if (t.marcas[k] === "" || t.marcas[k] == null) return "";
              return spec[k].label + ": " + t.marcas[k] + spec[k].unidade;
            })
            .filter(Boolean)
            .join(" · ");
          var allOk = Object.keys(spec).every(function (k) {
            if (t.marcas[k] === "" || t.marcas[k] == null) return true;
            return aptoText(spec[k], Number(t.marcas[k])).ok;
          });
          return (
            "<tr><td>" + fmtDate(t.data) + "</td><td>" +
            (t.sexo === "feminino" ? "Feminino" : "Masculino") +
            "</td><td>" + esc(marks) + '</td><td class="' + (allOk ? "apto" : "n-apto") + '">' +
            (allOk ? "APTO" : "Em evolução") +
            '</td><td><button class="btn btn-danger" data-del-t="' + t.id + '">Excluir</button></td></tr>'
          );
        })
        .join("") || '<tr><td colspan="5" class="empty">Nenhum treino registrado.</td></tr>';
  }

  /* ---------- POMODORO ---------- */
  function pomoDuration() {
    if (pomo.mode === "focus") return (pomo.long ? 50 : 25) * 60;
    return (pomo.long ? 10 : 5) * 60;
  }

  function renderPomo() {
    var m = Math.floor(pomo.remaining / 60);
    var s = pomo.remaining % 60;
    document.getElementById("pomoTime").textContent =
      String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    document.getElementById("pomoMode").textContent = pomo.mode === "focus" ? "FOCO" : "PAUSA";
    document.getElementById("pomoStart").textContent = pomo.running ? "❚❚" : "▶";
    document.getElementById("pomoModeBtn").textContent = pomo.long ? "50m" : "25m";
  }

  function tickPomo() {
    if (!pomo.running) return;
    pomo.remaining -= 1;
    if (pomo.remaining <= 0) {
      playBeep();
      if (pomo.mode === "focus") {
        var mins = pomo.long ? 50 : 25;
        state.hours.comum += mins / 60;
        addXP(100);
        save();
        toast(mins + " min de foco concluídos! +100 XP.");
        pomo.mode = "break";
      } else {
        pomo.mode = "focus";
        toast("Pausa encerrada. Vamos estudar!");
      }
      pomo.remaining = pomoDuration();
    }
    renderPomo();
  }

  function startPomo() {
    pomo.running = !pomo.running;
    if (pomo.running) {
      if (pomo.timer) clearInterval(pomo.timer);
      pomo.timer = setInterval(tickPomo, 1000);
    } else if (pomo.timer) {
      clearInterval(pomo.timer);
      pomo.timer = null;
    }
    renderPomo();
  }

  function resetPomo() {
    pomo.running = false;
    if (pomo.timer) {
      clearInterval(pomo.timer);
      pomo.timer = null;
    }
    pomo.mode = "focus";
    pomo.remaining = pomoDuration();
    renderPomo();
  }

  function togglePomoLen() {
    pomo.long = !pomo.long;
    state.pomoLong = pomo.long;
    save();
    if (!pomo.running) pomo.remaining = pomoDuration();
    renderPomo();
  }

  /* ---------- BACKUP ---------- */
  function exportBackup() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "backup-imperatriz-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup JSON exportado.");
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var base = emptyState();
        Object.keys(base).forEach(function (k) {
          if (parsed[k] !== undefined) base[k] = parsed[k];
        });
        state = base;
        save();
        setTab("plano");
        toast("Backup importado com sucesso!");
      } catch (e) {
        toast("Arquivo JSON inválido.");
      }
    };
    reader.readAsText(file);
  }

  function on(id, event, handler) {
    var el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) return;
    el.addEventListener(event, handler);
  }

  /* ---------- EVENTS ---------- */
  function bind() {
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        setTab(btn.getAttribute("data-tab"));
      });
    });
    on("menuToggle", "click", function () {
      document.getElementById("sidebar").classList.toggle("open");
      document.getElementById("overlay").classList.toggle("open");
    });
    on("overlay", "click", function () {
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("overlay").classList.remove("open");
    });
    on("btnExport", "click", exportBackup);
    on("btnImport", "click", function () {
      document.getElementById("importFile").click();
    });
    on("importFile", "change", function (e) {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = "";
    });
    on("pomoStart", "click", startPomo);
    on("pomoReset", "click", resetPomo);
    on("pomoModeBtn", "click", togglePomoLen);

    on("btnToggleConfig", "click", function () {
      var drawer = document.getElementById("planConfigDrawer");
      drawer.hidden = !drawer.hidden;
    });
    on("btnReplan", "click", replanDelayed);
    on("btnGenerate", "click", function (e) {
      e.preventDefault();
      generateSchedule(false);
    });
    on("btnClearSchedule", "click", function () {
      state.schedule = [];
      save();
      renderKanban();
      toast("Quadro semanal limpo.");
    });
    on("planDays", "change", readPlanConfig);
    ["planCargoFoco", "planHours", "planPhase"].forEach(function (id) {
      on(id, "change", readPlanConfig);
    });
    on("planLevels", "change", readPlanConfig);
    on("kanbanBoard", "click", function (e) {
      var card = e.target.closest("[data-toggle-blk]");
      var id = card && card.getAttribute("data-toggle-blk");
      if (id) toggleBlock(id);
    });
    document.querySelectorAll(".week-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".week-tab").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        activeWeek = Number(btn.getAttribute("data-week")) || 1;
        renderKanban();
      });
    });

    ["filterCargo", "filterDisciplina", "filterPrioridade", "filterBusca"].forEach(function (id) {
      on(id, "input", renderMatriz);
      on(id, "change", renderMatriz);
    });
    on("topicsBody", "change", onTopicCheck);
    on("formTopic", "submit", function (e) {
      e.preventDefault();
      var t = {
        id: uid("c"),
        cargo: document.getElementById("newTopicCargo").value,
        disciplina: document.getElementById("newTopicDisc").value.trim(),
        assunto: document.getElementById("newTopicAssunto").value.trim(),
        prioridade: document.getElementById("newTopicPrio").value
      };
      state.customTopics.push(t);
      state.progress[t.id] = { teoria: false, r24: false, r7: false, r30: false };
      save();
      e.target.reset();
      renderMatriz();
      toast("Tópico adicionado ao edital.");
    });

    on("formQuestoes", "submit", function (e) {
      e.preventDefault();
      var qtd = Number(document.getElementById("qQtd").value);
      var acertos = Number(document.getElementById("qAcertos").value);
      if (acertos > qtd) {
        toast("Acertos não podem superar a quantidade.");
        return;
      }
      state.questoes.push({
        id: uid("q"),
        data: document.getElementById("qDate").value,
        cargo: document.getElementById("qCargo").value,
        disciplina: document.getElementById("qDisc").value.trim(),
        assunto: document.getElementById("qAssunto").value.trim(),
        banca: document.getElementById("qBanca").value,
        nivel: document.getElementById("qNivel").value,
        qtd: qtd,
        acertos: acertos
      });
      addXP(acertos * 10);
      save();
      e.target.reset();
      document.getElementById("qDate").value = todayISO();
      renderQuestoes();
      toast("Bateria registrada! +" + acertos * 10 + " XP");
    });
    on("questoesBody", "click", function (e) {
      var btn = e.target.closest("[data-del-q]");
      var id = btn && btn.getAttribute("data-del-q");
      if (!id) return;
      state.questoes = state.questoes.filter(function (q) { return q.id !== id; });
      save();
      renderQuestoes();
    });

    document.querySelectorAll(".subtab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".subtab").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        document.getElementById("sub-caderno").hidden = btn.getAttribute("data-sub") !== "caderno";
        document.getElementById("sub-flash").hidden = btn.getAttribute("data-sub") !== "flash";
        if (btn.getAttribute("data-sub") === "flash") renderFlash();
      });
    });
    on("formErro", "submit", function (e) {
      e.preventDefault();
      state.erros.push({
        id: uid("e"),
        resumo: document.getElementById("eResumo").value.trim(),
        disciplina: document.getElementById("eDisc").value.trim(),
        assunto: document.getElementById("eAssunto").value.trim(),
        motivo: document.getElementById("eMotivo").value,
        explicacao: document.getElementById("eExplicacao").value.trim(),
        proxima: document.getElementById("eProx").value
      });
      save();
      e.target.reset();
      document.getElementById("eProx").value = addDays(todayISO(), 1);
      renderErros();
      toast("Erro salvo no caderno.");
    });
    on("erroFiltro", "input", renderErros);
    on("errosBody", "click", function (e) {
      var btn = e.target.closest("[data-del-e]");
      var id = btn && btn.getAttribute("data-del-e");
      if (!id) return;
      state.erros = state.erros.filter(function (x) { return x.id !== id; });
      save();
      renderErros();
    });
    on("formFlash", "submit", function (e) {
      e.preventDefault();
      state.flashcards.push({
        id: uid("f"),
        front: document.getElementById("fFront").value.trim(),
        back: document.getElementById("fBack").value.trim(),
        disciplina: document.getElementById("fDisc").value.trim(),
        next: todayISO()
      });
      save();
      e.target.reset();
      flashIndex = 0;
      renderFlash();
      toast("Flashcard criado.");
    });
    on("flashFlip", "click", flipFlash);
    on("flashStage", "click", function (e) {
      if (e.target.closest(".flashcard")) flipFlash();
    });
    on("flashFail", "click", function () { gradeFlash(false); });
    on("flashOk", "click", function () { gradeFlash(true); });

    on("revisoesBody", "click", function (e) {
      var btn = e.target.closest("[data-rev]");
      var id = btn && btn.getAttribute("data-rev");
      if (id) completeReview(id);
    });

    on("formSimulado", "submit", function (e) {
      e.preventDefault();
      var port = parseScore(document.getElementById("sPort").value);
      var inf = parseScore(document.getElementById("sInf").value);
      var rlm = parseScore(document.getElementById("sRlm").value);
      var esp = parseScore(document.getElementById("sEsp").value);
      var acertos = port.acertos + inf.acertos + rlm.acertos + esp.acertos;
      var total = port.total + inf.total + rlm.total + esp.total;
      if (!total) {
        toast("Use o formato acertos/total, ex.: 12/15.");
        return;
      }
      state.simulados.push({
        id: uid("s"),
        data: document.getElementById("sDate").value,
        cargo: document.getElementById("sCargo").value,
        port: document.getElementById("sPort").value,
        inf: document.getElementById("sInf").value,
        rlm: document.getElementById("sRlm").value,
        esp: document.getElementById("sEsp").value,
        acertos: acertos,
        total: total,
        pct: (acertos / total) * 100
      });
      addXP(300);
      save();
      e.target.reset();
      document.getElementById("sDate").value = todayISO();
      renderSimulados();
      toast("Simulado registrado! +300 XP");
    });
    on("simuladosBody", "click", function (e) {
      var btn = e.target.closest("[data-del-s]");
      var id = btn && btn.getAttribute("data-del-s");
      if (!id) return;
      state.simulados = state.simulados.filter(function (x) { return x.id !== id; });
      save();
      renderSimulados();
    });

    on("tafSexo", "change", function (e) {
      state.tafSexo = e.target.value;
      save();
      renderTaf();
    });
    on("formTaf", "submit", function (e) {
      e.preventDefault();
      var marcas = {};
      document.querySelectorAll("[data-taf]").forEach(function (inp) {
        marcas[inp.dataset.taf] = inp.value === "" ? "" : Number(inp.value);
      });
      state.treinos.push({
        id: uid("t"),
        data: document.getElementById("tDate").value,
        sexo: state.tafSexo,
        marcas: marcas
      });
      addXP(120);
      save();
      e.target.reset();
      renderTaf();
      toast("Treino TAF salvo! +120 XP");
    });
    on("tafBody", "click", function (e) {
      var btn = e.target.closest("[data-del-t]");
      var id = btn && btn.getAttribute("data-del-t");
      if (!id) return;
      state.treinos = state.treinos.filter(function (x) { return x.id !== id; });
      save();
      renderTaf();
    });
  }

  function init() {
    if (!state) state = emptyState();
    pomo.long = !!state.pomoLong;
    pomo.remaining = pomoDuration();
    bind();
    renderXP();
    try { renderPomo(); } catch (err) {}
    try { fillDiscList(); } catch (err) {}
    try { setTab("plano"); } catch (err) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
