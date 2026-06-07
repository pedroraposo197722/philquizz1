// ============================================================
//  AS PERGUNTAS  —  edita este ficheiro à vontade
// ============================================================
//
//  Cada pergunta tem:
//   - texto   : o enunciado
//   - video   : nome do ficheiro em public/videos/ (ou "" para nenhum)
//   - imagem  : nome do ficheiro em public/images/ (ou "" para nenhuma)
//   - musica  : ficheiro em public/videos/ para tocar durante o timer (ou "")
//   - opcoes  : 2 a 4 alternativas
//   - correta : índice da resposta certa (0 = primeira)
//   - tempo   : segundos para responder DEPOIS do vídeo acabar
//
//  NOTA: se tiver vídeo, o temporizador só começa quando o vídeo terminar.
//        A música arranca quando o temporizador começa e para quando acaba.
//
// ============================================================

module.exports = [
  {
    texto: "Quantas pessoas estavam dentro da casa?",
    video:  "pergunta.mp4",
    imagem: "",
    musica: "survivor.mp3",  // toca durante os 45s de resposta
    opcoes: ["1", "2", "3"],
    correta: 1,              // 0=1pessoa  1=2pessoas  2=3pessoas
    tempo: 45
  }
];
