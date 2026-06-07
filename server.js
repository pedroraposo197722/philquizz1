// ============================================================
//  SERVIDOR DO JOGO — quiz-sala v2
// ============================================================
const express = require("express");
const http    = require("http");
const { WebSocketServer } = require("ws");
const QRCode  = require("qrcode");
const questions = require("./questions");

const PORT = process.env.PORT || 3000;

// No Railway, usa o domínio público; localmente usa o IP
function getPublicURL(req) {
  // Railway injeta RAILWAY_PUBLIC_DOMAIN
  if (process.env.RAILWAY_PUBLIC_DOMAIN)
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  // Fallback: usa o host do request
  const host = req ? req.headers.host : null;
  if (host) return `http://${host}`;
  return `http://localhost:${PORT}`;
}

const app = express();
app.use(express.static(__dirname + "/public"));
app.get("/",     (_, res) => res.sendFile(__dirname + "/public/host.html"));
app.get("/play", (_, res) => res.sendFile(__dirname + "/public/player.html"));
app.get("/qr",   async (req, res) => {
  const base    = getPublicURL(req);
  const joinURL = `${base}/play`;
  const dataUrl = await QRCode.toDataURL(joinURL, { width: 600, margin: 1 });
  res.json({ dataUrl, url: joinURL });
});

const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// ── Heartbeat — mantém ligações vivas ────────────────────────
const HEARTBEAT_INTERVAL = 25000; // 25 segundos
function heartbeat() { this.isAlive = true; }

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// ── Estado do jogo ────────────────────────────────────────────
const game = {
  phase:         "lobby",
  qIndex:        -1,
  players:       new Map(),
  hosts:         new Set(),
  questionStart: 0,
  timer:         null,
};

function broadcast(targets, obj) {
  const msg = JSON.stringify(obj);
  targets.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}
const sendHosts   = obj => broadcast(game.hosts, obj);
const sendPlayers = obj => broadcast([...game.players.keys()], obj);
const send        = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

function playerList() {
  return [...game.players.values()].map(p => ({ name: p.name, score: p.score }));
}

function ranking() {
  return [...game.players.values()]
    .map(p => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function answerCounts() {
  const q = questions[game.qIndex];
  const counts = Array(q.opcoes.length).fill(0);
  for (const p of game.players.values())
    if (p.answered) counts[p.answerIdx]++;
  return counts;
}

function startQuestionTimer() {
  const q   = questions[game.qIndex];
  const sec = q.tempo || 45;
  game.questionStart = Date.now();
  sendHosts({ type: "timerStart", seconds: sec, musica: q.musica || null });
  game.timer = setTimeout(() => revealAnswers(), sec * 1000);
}

function revealAnswers() {
  if (game.timer) { clearTimeout(game.timer); game.timer = null; }
  game.phase = "reveal";
  const q = questions[game.qIndex];
  sendHosts({ type: "reveal", correta: q.correta, counts: answerCounts() });
  sendPlayers({ type: "reveal", correta: q.correta });
}

// ── WebSocket ─────────────────────────────────────────────────
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "hostJoin") {
      game.hosts.add(ws);
      send(ws, { type: "welcome", role: "host", players: playerList() });
      return;
    }

    if (msg.type === "startGame") {
      game.qIndex = 0;
      const q = questions[0];
      game.phase = q.video ? "video" : "question";

      for (const p of game.players.values())
        Object.assign(p, { answered: false, answerIdx: -1, answerTime: 0 });

      sendHosts({
        type: "question", index: 0, total: questions.length,
        texto: q.texto, opcoes: q.opcoes,
        video: q.video || null, imagem: q.imagem || null,
        tempo: q.tempo || 45, hasVideo: !!q.video,
      });
      sendPlayers({ type: "question", opcoes: q.opcoes, texto: q.texto });

      if (!q.video) {
        sendPlayers({ type: "canAnswer", opcoes: q.opcoes });
        startQuestionTimer();
      }
      return;
    }

    if (msg.type === "videoEnded") {
      if (game.phase === "video") {
        game.phase = "question";
        const q = questions[game.qIndex];
        sendPlayers({ type: "canAnswer", opcoes: q.opcoes });
        startQuestionTimer();
      }
      return;
    }

    if (msg.type === "nextQuestion") {
      game.qIndex++;
      if (game.qIndex >= questions.length) {
        game.phase = "end";
        sendHosts({ type: "end", ranking: ranking() });
        sendPlayers({ type: "end", ranking: ranking() });
        return;
      }
      const q = questions[game.qIndex];
      game.phase = q.video ? "video" : "question";

      for (const p of game.players.values())
        Object.assign(p, { answered: false, answerIdx: -1, answerTime: 0 });

      sendHosts({
        type: "question", index: game.qIndex, total: questions.length,
        texto: q.texto, opcoes: q.opcoes,
        video: q.video || null, imagem: q.imagem || null,
        tempo: q.tempo || 45, hasVideo: !!q.video,
      });
      sendPlayers({ type: "question", opcoes: q.opcoes, texto: q.texto });

      if (!q.video) {
        sendPlayers({ type: "canAnswer", opcoes: q.opcoes });
        startQuestionTimer();
      }
      return;
    }

    if (msg.type === "showRanking") {
      sendHosts({ type: "ranking", ranking: ranking() });
      return;
    }

    if (msg.type === "revealNow") {
      revealAnswers();
      return;
    }

    if (msg.type === "resetGame") {
      if (game.timer) { clearTimeout(game.timer); game.timer = null; }
      game.phase  = "lobby";
      game.qIndex = -1;
      game.players.clear();
      game.hosts.forEach(h => {
        if (h.readyState === 1) h.send(JSON.stringify({ type: "reset" }));
      });
      return;
    }

    if (msg.type === "playerJoin") {
      // Permite entrar mesmo depois do lobby — apenas bloqueia se jogo já começou
      if (game.phase !== "lobby") {
        send(ws, { type: "error", msg: "O jogo já começou." });
        return;
      }
      const name = String(msg.name || "").trim().slice(0, 20);
      if (!name) { send(ws, { type: "error", msg: "Nome inválido." }); return; }
      // Verifica nome duplicado
      const names = [...game.players.values()].map(p => p.name.toLowerCase());
      if (names.includes(name.toLowerCase())) {
        send(ws, { type: "error", msg: "Nome já em uso." }); return;
      }
      game.players.set(ws, { name, score: 0, answered: false, answerIdx: -1, answerTime: 0 });
      send(ws, { type: "joined", name });
      sendHosts({ type: "playerList", players: playerList() });
      return;
    }

    if (msg.type === "answer") {
      const p = game.players.get(ws);
      if (!p || p.answered || game.phase !== "question") return;
      const q       = questions[game.qIndex];
      const elapsed = Date.now() - game.questionStart;
      const maxTime = (q.tempo || 45) * 1000;
      const idx     = Number(msg.index);
      if (idx < 0 || idx >= q.opcoes.length) return;

      p.answered   = true;
      p.answerIdx  = idx;
      p.answerTime = elapsed;

      if (idx === q.correta) {
        const speedBonus = Math.round(400 * Math.max(0, 1 - elapsed / maxTime));
        p.score += 600 + speedBonus;
      }

      send(ws, { type: "answerAck", selected: idx });

      const answered = [...game.players.values()].filter(x => x.answered).length;
      sendHosts({ type: "answerCount", answered, total: game.players.size, counts: answerCounts() });

      if (answered === game.players.size) revealAnswers();
      return;
    }
  });

  ws.on("close", () => {
    game.hosts.delete(ws);
    if (game.players.has(ws)) {
      game.players.delete(ws);
      sendHosts({ type: "playerList", players: playerList() });
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Servidor em http://localhost:${PORT}`);
  console.log(`\n    Ctrl+C para parar\n`);
});
