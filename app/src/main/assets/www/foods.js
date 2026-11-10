// Alimentos iniciais. Valores por 100 g (ou 100 ml para líquidos), APROXIMADOS a partir da
// Tabela Brasileira de Composição de Alimentos (TACO/Unicamp). Confira e edite em
// Configurações > Alimentos se precisar. Pesos de unidades/medidas caseiras são ESTIMATIVAS.
// Formato: [nome, base ('g' ou 'ml'), kcal, proteína, carboidrato, gordura, [[medida, gramas], ...]]
window.SEED_FOODS = [
  ["Pão francês", "g", 300, 8.0, 58.6, 3.1, [["unidade (~50 g)", 50]]],
  ["Ovo frito", "g", 240, 15.6, 1.2, 18.6, [["unidade (~50 g)", 50]]],
  ["Ovo cozido", "g", 146, 13.3, 0.6, 9.5, [["unidade (~50 g)", 50]]],
  ["Leite de vaca integral", "ml", 61, 3.2, 4.7, 3.3, [["copo (200 ml)", 200], ["xícara (~240 ml)", 240]]],
  ["Leite desnatado", "ml", 35, 3.4, 4.9, 0.1, [["copo (200 ml)", 200]]],
  ["Leite em pó integral", "g", 497, 25.4, 39.2, 26.9, [["colher de sopa (~15 g)", 15]]],
  ["Café coado (sem açúcar)", "ml", 9, 0.7, 1.5, 0.1, [["xícara pequena (~50 ml)", 50], ["xícara (~150 ml)", 150]]],
  ["Açúcar refinado", "g", 387, 0.3, 99.5, 0, [["colher de sopa (~12 g)", 12], ["colher de chá (~4 g)", 4]]],
  ["Arroz branco cozido", "g", 128, 2.5, 28.1, 0.2, [["colher de servir (~45 g)", 45], ["colher de sopa (~25 g)", 25]]],
  ["Arroz integral cozido", "g", 124, 2.6, 25.8, 1.0, [["colher de servir (~45 g)", 45]]],
  ["Feijão carioca cozido", "g", 76, 4.8, 13.6, 0.5, [["concha média (~100 g)", 100]]],
  ["Feijão preto cozido", "g", 77, 4.5, 14.0, 0.5, [["concha média (~100 g)", 100]]],
  ["Feijão tropeiro", "g", 152, 10.2, 19.6, 6.8, [["colher de servir (~60 g)", 60]]],
  ["Batata inglesa cozida", "g", 52, 1.2, 11.9, 0, [["unidade média (~130 g)", 130]]],
  ["Batata palha / chips (industrializada)", "g", 543, 5.6, 51.2, 36.6, [["punhado (~15 g)", 15]]],
  ["Mandioca cozida", "g", 125, 0.6, 30.1, 0.3, [["pedaço médio (~100 g)", 100]]],
  ["Cuscuz de milho cozido", "g", 113, 2.2, 25.3, 0.7, [["fatia (~100 g)", 100]]],
  ["Cenoura cozida", "g", 30, 0.8, 6.7, 0.2, [["colher de sopa (~25 g)", 25]]],
  ["Alface", "g", 11, 1.3, 1.7, 0.2, [["prato raso (~30 g)", 30]]],
  ["Tomate", "g", 15, 1.1, 3.1, 0.2, [["unidade média (~100 g)", 100]]],
  ["Carne de porco (lombo) assada", "g", 210, 35.7, 0, 6.4, [["fatia/pedaço (~80 g)", 80]]],
  ["Peito de frango grelhado sem pele", "g", 159, 32.0, 0, 2.5, [["filé médio (~100 g)", 100]]],
  ["Carne bovina patinho grelhado", "g", 219, 35.9, 0, 7.3, [["bife médio (~100 g)", 100]]],
  ["Carne moída (acém) cozida", "g", 212, 26.7, 0, 10.9, [["colher de sopa (~25 g)", 25]]],
  ["Fígado bovino grelhado", "g", 225, 29.9, 4.2, 9.0, [["bife (~100 g)", 100]]],
  ["Sardinha em conserva (óleo)", "g", 285, 15.9, 0, 24.0, [["lata drenada (~85 g)", 85]]],
  ["Atum em conserva (óleo)", "g", 166, 26.2, 0, 6.0, [["lata drenada (~120 g)", 120]]],
  ["Queijo minas frescal", "g", 264, 17.4, 3.2, 20.2, [["fatia (~30 g)", 30]]],
  ["Iogurte natural integral", "g", 51, 4.1, 1.9, 3.0, [["pote (~170 g)", 170]]],
  ["Manteiga com sal", "g", 726, 0.4, 0.1, 82.4, [["ponta de faca (~5 g)", 5]]],
  ["Óleo de soja", "ml", 884, 0, 0, 100, [["colher de sopa (~8 ml)", 8]]],
  ["Aveia em flocos", "g", 394, 13.9, 66.6, 8.5, [["colher de sopa (~15 g)", 15]]],
  ["Banana prata", "g", 98, 1.3, 26.0, 0.1, [["unidade média (~70 g)", 70]]],
  ["Maçã com casca", "g", 56, 0.3, 15.2, 0, [["unidade média (~130 g)", 130]]],
  ["Laranja pera", "g", 37, 1.0, 8.9, 0.1, [["unidade média (~140 g)", 140]]],
  ["Biscoito cream cracker", "g", 432, 10.1, 68.7, 14.4, [["unidade (~6 g)", 6]]],
  ["Amendoim torrado", "g", 606, 22.5, 18.7, 54.0, [["punhado (~20 g)", 20]]]
];

// Planos de treino iniciais (Fase de adaptação, a partir de 09/11/2026)
window.SEED_PLANS = [
  { id: "A", name: "Full Body A", warmup: "5 minutos de caminhada leve",
    notes: "Descanso de 60–90 s entre séries. Não treinar até a falha: termine cada série sentindo que ainda faria 3–4 repetições.",
    exercises: [["Leg press", 2, "12"], ["Supino máquina", 2, "10–12"], ["Puxada frontal", 2, "12"],
                ["Mesa flexora", 2, "12"], ["Remada sentada", 2, "12"], ["Abdominal máquina", 2, "12"]] },
  { id: "B", name: "Full Body B", warmup: "5 minutos",
    notes: "Descanso de 60–90 s entre séries. Não treinar até a falha: termine cada série sentindo que ainda faria 3–4 repetições.",
    exercises: [["Agachamento ao banco ou assistido", 2, "10"], ["Supino inclinado máquina", 2, "10"], ["Remada baixa", 2, "12"],
                ["Elevação lateral", 2, "12"], ["Ponte de glúteos", 2, "12"], ["Prancha", 2, "20–30 s"]] },
  { id: "C", name: "Full Body C", warmup: "5 minutos",
    notes: "Descanso de 60–90 s entre séries. Não treinar até a falha: termine cada série sentindo que ainda faria 3–4 repetições.",
    exercises: [["Leg press", 2, "12"], ["Puxada frontal", 2, "12"], ["Chest press", 2, "10"],
                ["Cadeira flexora", 2, "12"], ["Desenvolvimento máquina", 2, "10"], ["Rosca bíceps", 2, "12"]] }
];
