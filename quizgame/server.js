// ============================================================
//  SERVIDOR DO JOGO — quiz-sala v2
// ============================================================
const express = require("express");
const http    = require("http");
const { WebSocketServer } = require("ws");
const QRCode  = require("qrcode");
const os      = require("os");
const questions = require("./questions");

const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === "IPv4" && !net.internal) return net.address;
  return "localhost";
}
const LOCAL_IP = getLocalIP();
const JOIN_URL = `http://${LOCAL_IP}:${PORT}/play`;

const app = express();
app.use(express.static(__dirname + "/public"));
app.get("/",     (_, res) => res.sendFile(__dirname + "/public/host.html"));
app.get("/play", (_, res) => res.sendFile(__dirname + "/public/player.html"));
app.get("/qr",   async (_, res) => {
  const dataUrl = await QRCode.toDataURL(JOIN_URL, { width: 600, margin: 1 });
  res.json({ dataUrl, url: JOIN_URL });
});

const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

// ── Estado do jogo ────────────────────────────────────────────
const game = {
  phase:         "lobby",   // lobby | video | question | reveal | ranking | end
  qIndex:        -1,
  players:       new Map(), // ws → {name, score, answered, answerIdx, answerTime}
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
  const sec = q.tempo || 30;
  game.questionStart = Date.now();

  // Avisa hosts e players que o timer arrancou
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
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── HOST ──────────────────────────────────────────────────
    if (msg.type === "hostJoin") {
      game.hosts.add(ws);
      send(ws, { type: "welcome", role: "host", url: JOIN_URL, players: playerList() });
      return;
    }

    if (msg.type === "startGame") {
      game.qIndex = 0;
      const q = questions[0];
      game.phase = q.video ? "video" : "question";

      for (const p of game.players.values())
        Object.assign(p, { answered: false, answerIdx: -1, answerTime: 0 });

      sendHosts({
        type:    "question",
        index:   0,
        total:   questions.length,
        texto:   q.texto,
        opcoes:  q.opcoes,
        video:   q.video  || null,
        imagem:  q.imagem || null,
        tempo:   q.tempo  || 30,
        hasVideo: !!q.video,
      });
      sendPlayers({ type: "question", opcoes: q.opcoes, texto: q.texto });

      // Se não tem vídeo, arranca o timer já
      if (!q.video) {
        sendPlayers({ type: "canAnswer", opcoes: q.opcoes });
        startQuestionTimer();
      }
      return;
    }

    // Host informa que o vídeo terminou → arranca timer
    if (msg.type === "videoEnded") {
      if (game.phase === "video") {
        game.phase = "question";
        const q = questions[game.qIndex];
        sendPlayers({ type: "canAnswer", opcoes: q.opcoes }); // players podem ver os botões
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
        type:    "question",
        index:   game.qIndex,
        total:   questions.length,
        texto:   q.texto,
        opcoes:  q.opcoes,
        video:   q.video  || null,
        imagem:  q.imagem || null,
        tempo:   q.tempo  || 30,
        hasVideo: !!q.video,
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

    // ── PLAYER ────────────────────────────────────────────────
    if (msg.type === "playerJoin") {
      if (game.phase !== "lobby") {
        send(ws, { type: "error", msg: "O jogo já começou." });
        return;
      }
      const name = String(msg.name || "").trim().slice(0, 20);
      if (!name) { send(ws, { type: "error", msg: "Nome inválido." }); return; }
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
      const maxTime = (q.tempo || 30) * 1000;
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

      // Contagem ao vivo para o host
      const answered = [...game.players.values()].filter(x => x.answered).length;
      sendHosts({ type: "answerCount", answered, total: game.players.size, counts: answerCounts() });

      // Se todos responderam, revelar automaticamente
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
  console.log(`📱  Link para jogadores: ${JOIN_URL}`);
  console.log(`\n    Ctrl+C para parar\n`);
});
