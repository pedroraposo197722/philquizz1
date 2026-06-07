╔══════════════════════════════════════════════════════╗
║            QUIZ AO VIVO — v2  (com vídeo)            ║
╚══════════════════════════════════════════════════════╝

COMO ARRANCAR
─────────────
1. Abre o terminal nesta pasta
2. npm install          (só na primeira vez)
3. npm start
4. Abre http://localhost:3000 no browser do projetor

COMO JOGAR
──────────
• Ecrã do projetor → http://localhost:3000
• Telemóveis dos alunos → scaneiam o QR code (ou vão ao link)
• Clica "Iniciar Jogo" quando toda a gente tiver entrado

FLUXO COM VÍDEO
───────────────
1. O vídeo toca automaticamente no ecrã do projetor
2. Os alunos veem "Aguarda o vídeo no ecrã…" no telemóvel
3. Quando o vídeo termina → temporizador de 30s começa
4. Os botões de resposta aparecem nos telemóveis
5. No fim do tempo (ou quando todos respondem) → revelar resposta

EDITAR PERGUNTAS
────────────────
Abre o ficheiro  questions.js  e edita à vontade.

  opcoes: ["1", "2", "3"]   ← podes ter 2, 3 ou 4 opções
  correta: 1                 ← índice da resposta certa (0 = primeira)
  video: "pergunta.mp4"      ← ficheiro em public/videos/
  tempo: 30                  ← segundos DEPOIS do vídeo acabar

PARA ACESSO EM REDE (Wi-Fi da sala)
────────────────────────────────────
• O link para os alunos aparece no ecrã do projetor
• Todos os dispositivos têm de estar na mesma rede Wi-Fi
• Se a rede bloquear ligações entre dispositivos (Client Isolation),
  usa o hotspot do telemóvel e liga o portátil a ele

ESTRUTURA
─────────
  server.js           servidor Node.js
  questions.js        as tuas perguntas ← edita aqui
  public/
    host.html         ecrã do projetor
    player.html       ecrã dos alunos (telemóvel)
    videos/           coloca aqui os ficheiros de vídeo
    images/           coloca aqui as imagens

