// Renderiza las fórmulas de pymdownx.arithmatex (modo generic) con KaTeX.
// KaTeX se carga por CDN: sin internet las fórmulas quedan en LaTeX crudo.
document$.subscribe(({ body }) => {
  renderMathInElement(body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
      { left: "\\[", right: "\\]", display: true },
    ],
  });
});
