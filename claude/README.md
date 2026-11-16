# Minecraft AI Recreation — BlockCraft

Uma recriação simplificada, jogável e original inspirada no **Minecraft Java Edition**, feita em
**TypeScript + Three.js (WebGL) + Vite**. Todas as texturas, modelos, sons e músicas são **gerados
proceduralmente em tempo de execução**: nenhum arquivo do jogo original é usado, e o jogo não
depende de serviços externos nem de chaves de API.

## Como executar (Windows)

Requisito: [Node.js](https://nodejs.org/) 18 ou superior.

**Opção 1:** dê dois cliques em `start.bat`. Ele instala as dependências (só na primeira vez), sobe o
servidor e abre o navegador.

**Opção 2 (terminal):**

```bash
npm install
npm run dev
```

Depois abra `http://localhost:5173` (o navegador abre sozinho). Use Chrome ou Edge com aceleração
de hardware ativada.

Build de produção: `npm run build`, depois `npm run preview`.

Acelerar o tempo (teste de desenvolvimento): `http://localhost:5173/?timeScale=60` faz o ciclo de
dia/noite passar 60x mais rápido. Sem o parâmetro, o jogo normal não é afetado.

## Controles

| Tecla | Ação |
|---|---|
| W A S D | Movimentar |
| Mouse | Olhar |
| Espaço | Pular / nadar / subir (voo) |
| Shift | Agachar (não cai de beiradas) / descer (voo) |
| **W duas vezes** ou **R** (segurar) | Correr |
| Espaço duas vezes | Liga/desliga voo (Criativo) |
| Botão esquerdo | Quebrar bloco / atacar |
| Botão direito | Colocar bloco / usar (bancada, fornalha, baú, porta, cama) / comer (segurar) |
| Botão do meio | Pegar bloco mirado (Criativo) |
| E | Inventário |
| 1–9 / Scroll | Hotbar |
| Q | Soltar item (Ctrl+Q solta o stack) |
| Esc | Pausar / fechar janela |
| F2 | Esconder HUD (modo screenshot) |
| F3 | Tela de depuração (FPS, XYZ, bioma, seed, chunks…) |
| F5 | Primeira/terceira pessoa |

No inventário: clique esquerdo pega/coloca/troca, clique direito divide o stack ou coloca 1 item,
**Shift+clique** move rapidamente, e clicar fora da janela solta o item no mundo.

> **Por que Ctrl não corre?** No navegador, `Ctrl+W` fecha a aba e não pode ser bloqueado. Para não
> perder o progresso por acidente, correr fica em "W duas vezes" (igual ao Minecraft) ou na tecla R.

## Funcionalidades implementadas

**Menus e mundos**
- Menu principal com título em pixel art 3D, frase amarela animada e panorama 3D real (mundo
  gerado, câmera girando, luz de fim de tarde, nuvens).
- Um Jogador / Multijogador (desativado) / Opções / Sair.
- Tela de mundos: miniatura (capturada ao salvar), nome, data de criação, último acesso, modo,
  dificuldade, tipo e seed. Jogar, Excluir (com confirmação) e Criar Novo Mundo.
- Criação: nome, Sobrevivência/Criativo, Pacífico/Fácil/Normal/Difícil, seed (número ou texto),
  tipo Padrão ou Plano.

**Mundo**
- Chunks de 16×16×128, carregamento e descarregamento por distância (configurável de 2 a 12), com
  geração e meshing limitados por tempo a cada quadro.
- Geração determinística por seed (testada: a mesma seed gera terreno idêntico).
- Ruído Simplex 2D/3D + FBM: continentalidade, detalhe, montanhas em cristas, temperatura e
  umidade.
- Biomas: Planícies, Floresta, Floresta de Bétulas, Deserto, Montanhas (pedra exposta e picos
  nevados), Taiga Nevada, Praias, Rios e Lagos, com transições suaves e cor de grama/folhas por
  bioma.
- Cavernas (túneis "espaguete" + câmaras 3D) com entradas ocasionais na superfície.
- Minérios em veios: carvão, ferro, cobre, ouro, redstone e diamante, em faixas de altura
  realistas. Também há bolsões de cascalho e terra.
- Árvores feitas de blocos (carvalho, bétula, pinheiro), cactos, grama alta, flores, cogumelos e
  arbustos secos.
- Água translúcida e animada, separada da malha sólida. Escoamento simples quando um bloco
  vizinho é removido.
- Areia e cascalho caem quando perdem apoio.

**Renderização**
- Malha por chunk com face culling, frustum culling (nativo do Three.js) e atlas de texturas
  procedural 16×16 com filtro nearest.
- Iluminação voxel real: luz do céu e luz de blocos (tochas, pedra luminosa) propagada por BFS.
  Cavernas são escuras e tochas iluminam com luz quente.
- Iluminação suave + oclusão de ambiente por vértice (sombras estilizadas nos cantos).
- Céu com gradiente, sol, lua, estrelas, pôr do sol alaranjado, nuvens quadradas em movimento e
  neblina de distância. Visão subaquática.
- Mão em primeira pessoa com animações de balanço, ataque, mineração, colocação e comida. Item ou
  bloco segurado aparece na mão. Terceira pessoa com modelo animado (F5).
- Partículas: fragmentos de blocos, golpes, críticos, explosões, fumaça da fornalha, chamas de
  tochas, zumbis pegando fogo e respingos de água.

**Jogabilidade**
- Física AABB: gravidade, pulo, colisão com paredes, subida automática de lajes e degraus, agachar
  sem cair, natação, dano de queda e afogamento.
- Mineração com progresso, rachaduras em 10 estágios, ferramenta certa (picareta/machado/pá),
  nível mínimo para drops (pedra exige picareta; ferro exige pedra; ouro, diamante e redstone exigem
  ferro) e penalidade embaixo d'água e no ar.
- Colocação livre de blocos em qualquer face, sem prender o jogador ou mobs. Orientação para
  escadas, fornalha, baú e bancada; portas de 2 blocos (abrem e fecham); camas de 2 blocos; tochas no
  chão e na parede.
- Inventário completo (27 + hotbar 9), stacks de 64, ferramentas não empilham, tooltips com dano,
  durabilidade, comida e combustível.
- Crafting 2×2 e 3×3 baseado em receitas como dados (com e sem forma, aceita espelhamento): tábuas,
  gravetos, bancada, baú, fornalha, tocha, porta, cama, lajes, escadas, tijolos, arenito, lã,
  estante, tigela, ensopado, blocos de minério, flechas e todas as ferramentas (madeira, pedra,
  ferro, ouro e diamante: picareta, machado, pá e espada).
- Durabilidade com barra colorida; a ferramenta quebra com som e partículas.
- Fornalha funcional: entrada, combustível e saída, chama e seta de progresso, frente acesa,
  fumaça. Continua funcionando com a janela fechada e salva o conteúdo. Funde minério de ferro, ouro
  e cobre, carnes, areia → vidro, pedregulho → pedra, tronco → carvão vegetal e argila → tijolo.
- Baú com 27 slots, persistente por posição. Ao ser quebrado, deixa o conteúdo cair.
- Cama: dormir à noite pula para a manhã e define o ponto de renascimento. Há mensagens quando há
  monstros perto ou ainda é dia.
- Vida (10 corações), fome (10 coxinhas), saturação, exaustão por correr, pular, atacar e minerar.
  A vida regenera com a fome alta, e a fome zerada causa dano conforme a dificuldade. Bolhas de ar
  embaixo d'água.
- Comer segurando o botão direito (animação, partículas e som). O ensopado devolve a tigela.
- Morte com tela "Você morreu!", causa e dias sobrevividos, itens caem no chão. Renascer na cama ou
  no spawn.
- Ciclo de dia e noite de 20 minutos reais.

**Criaturas**
- Passivas: vaca, porco, ovelha e galinha (asas batendo), com modelos cúbicos e skins originais,
  andar animado, estados parado/vagar/fugir, desvio de penhascos e água, sons e drops (carne,
  couro, lã, penas).
- Hostis: zumbi (persegue e ataca), esqueleto (mantém distância e atira flechas com arco
  balístico), creeper (pavio piscando e inchando, explosão com dano radial que destrói blocos,
  exceto no Pacífico) e aranha (rápida, pula e escala paredes).
- Aparecem à noite e em lugares escuros (nível de luz ≤ 7), nunca perto do jogador nem dentro de
  blocos. Somem quando ficam longe. Zumbis e esqueletos pegam fogo sob o sol.
- Dificuldade: Pacífico não tem hostis e a vida regenera; Fácil, Normal e Difícil mudam a
  quantidade de mobs, o dano e a cadência dos tiros.
- Combate com cooldown, dano por arma, crítico ao cair, knockback, flash vermelho e morte animada
  com drops coletáveis. Itens no chão giram, flutuam, são atraídos e coletados.

**Modo Criativo**
- Voo (Espaço duplo), quebra instantânea, recursos infinitos, sem fome e sem dano.
- Inventário criativo com abas (Construção, Natureza, Madeira, Minérios, Decoração, Utilidades,
  Ferramentas, Comida, Materiais, Buscar e Inventário) e botão do meio para pegar blocos.

**Som (100% sintetizado com Web Audio)**
- Quebrar e colocar blocos por material, passos, pulo, queda, dano, comer, coletar, portas, baús,
  crafting, cliques e hover dos menus.
- Sons de animais, zumbi, esqueleto, aranha, pavio do creeper, explosão, arco e flechas.
- Ambiente: vento, água próxima, grilos à noite, zumbido de caverna e música generativa suave
  (pentatônica).

**Salvamento (IndexedDB)**
- Salva só o que o jogador mudou (modificações por chunk). O terreno original é regenerado pela
  seed.
- Também salva posição, rotação, inventário, vida, fome, horário, dia, baús, fornalhas, mudas
  crescendo, ponto de renascimento, animais próximos e miniatura.
- Autosave a cada 60 s, ao sair para o menu e ao fechar ou ocultar a aba. Dados corrompidos são
  tratados.
- Configurações salvas em localStorage: distância de renderização, FOV, gráficos
  rápidos/detalhados, iluminação suave, brilho, nuvens, balanço da visão, tela cheia,
  sensibilidade, inverter mouse, volumes (geral, efeitos, ambiente e música) e dificuldade do mundo
  atual.

## Arquitetura

```
src/
  core/noise.ts          Simplex 2D/3D, FBM, hashes, seed
  world/blocks.ts        BlockRegistry (dados de cada bloco)
  world/items.ts         ItemRegistry, ferramentas, comida, combustível, fundição
  world/recipes.ts       RecipeRegistry + CraftingManager (matcher)
  world/generator.ts     WorldGenerator / BiomeGenerator / cavernas / minérios / árvores
  world/world.ts         ChunkManager, modificações, raycast, gravidade, fluidos
  render/mesher.ts       ChunkMesher + LightingManager (BFS de luz, AO)
  render/textures.ts     TextureAtlas procedural + ícones de itens
  render/materials.ts    shaders de blocos e água
  render/sky.ts          DayNightCycle visual (céu, sol, lua, estrelas, nuvens)
  render/models.ts       modelos voxel de mobs e jogador
  render/particles.ts    ParticleSystem
  game/game.ts           GameManager (loop, mineração, construção, combate, salvamento)
  game/player.ts         PlayerController + sobrevivência
  game/physics.ts        PlayerPhysics/colisão AABB
  game/mobs.ts           MobManager + MobAI
  game/entities.ts       itens caídos e flechas
  game/blockentities.ts  FurnaceSystem / ChestSystem
  game/inventory.ts      InventoryManager
  game/input.ts          InputManager
  game/save.ts           SaveManager (IndexedDB) + SettingsManager
  ui/                    UIManager: menus, HUD, inventário e janelas
  audio/audio.ts         AudioManager (sintetizado)
```

## Simplificações (transparência)

- Iluminação: a luz é propagada até 8 blocos além da borda do chunk. Fontes de luz mais distantes do
  que isso não chegam ao chunk vizinho, o que é imperceptível na prática.
- Água estática com escoamento simplificado (preenche buracos vizinhos, sem níveis de fluxo nem
  correnteza). Não há lava.
- Mobs andam em linha reta até o alvo e pulam obstáculos, sem pathfinding A*.
- As tochas na parede ficam em pé, encostadas na parede, sem inclinação.
- O ícone da porta é desenhado em 2D. As escadas aparecem como cubo no ícone e na mão.
- Não há XP, armaduras, arco para o jogador, agricultura, vilas, aldeões ou Nether.
- O pão existe só no inventário criativo, porque não há trigo.
- O botão "Sair" tenta fechar a aba. Como navegadores normalmente bloqueiam isso, ele mostra uma
  mensagem.
- Os controles são fixos (há uma tela que lista todos). Não há remapeamento de teclas.
- Multijogador não foi implementado (o botão aparece desativado, como pedido).

## Testes realizados

Todos foram feitos em Chromium headless com renderização por software (SwiftShader), usando
cliques e teclas reais via Playwright e verificação do estado do jogo:

- Menu, lista de mundos, criação de mundo, carregamento (cerca de 1 s) e spawn válido no chão.
- Seed determinística (hash de 25 chunks idêntico para a mesma seed e diferente para outra) e
  distribuição dos 9 tipos de bioma.
- Quebrar tronco com a mão, pedra com picareta de madeira (drop de pedregulho, durabilidade
  reduzida) e drops coletados.
- Crafting pela interface: tronco → tábuas (Shift+clique) e 4 tábuas → bancada (clique direito
  distribuindo). Colocar a bancada e abrir a interface 3×3.
- Fornalha: combustível consumido, progresso, frente acesa. Comer (fome 10 → 18). Morte e
  renascimento.
- Combate contra zumbi (dano, knockback, morte e drops). Mobs atacando o jogador. Explosão de
  creeper causando dano e destruindo blocos.
- Gravidade da areia, escoamento da água, cama pulando a noite e definindo o spawn, muda virando
  árvore.
- Salvar e sair → recarregar a página → inventário e bloco colocado preservados, com miniatura na
  lista.
- Capturas de tela de menu, jogo, inventário, bancada, fornalha, criativo, todos os mobs,
  terceira pessoa, pôr do sol, noite e opções.
- `npm run build` (TypeScript estrito + Vite) sem erros.

Não testado com hardware de GPU real neste ambiente: no modo software a taxa foi de 20 a 50 FPS. Em
GPU intermediária, o esperado é 60 FPS com distância 6 a 8. Se precisar, reduza a distância ou use
"Gráficos: Rápidos".
