# Relatório de entrega — Blockcraft AI Challenge

## Métricas informadas pelo usuário

- Uso da sessão: **70%**.
- Tempo de desenvolvimento: **41 minutos**.

Dados informados pelo usuário para registrar o resultado deste experimento comparativo.

Projeto criado em `D:\video yotubue\Codex - Mine`, com código-fonte, testes e instruções. Usa TypeScript, Three.js, Vite, WebGL, IndexedDB e Web Audio. Texturas, modelos, ícones e sons foram criados em código, sem assets extraídos do Minecraft.

## Funcionalidades implementadas

- Menu com panorama 3D animado, seleção, criação, exclusão e restauração do último mundo excluído. Nome, seed, Sobrevivência/Criativo, quatro dificuldades e terreno padrão/plano.
- Mundo determinístico expansível, chunks de 16 × 96 × 16, faces internas omitidas, carregamento incremental, descarte de chunks distantes e reconstrução seletiva de bordas.
- Planícies, florestas, desertos e montanhas; rios, água translúcida, neve, cavernas com entradas, veios de carvão, ferro, ouro e diamante; árvores de carvalho, bétula e pinheiro formadas por blocos editáveis.
- Movimento FPS com gravidade, colisões, salto, corrida, agachamento com proteção em bordas, natação, dano de queda, afogamento, voo no Criativo e câmera F5 com avatar animado.
- Mineração progressiva, contorno e rachaduras, ferramentas apropriadas e níveis de coleta, durabilidade, partículas, drops, coleta e construção livre.
- Hotbar de nove posições, mochila de 27 posições, mover e arrastar pilhas, dividir, empilhar, transferir com Shift e catálogo Criativo por categorias.
- 37 receitas; grades reais 2 × 2 e 3 × 3 com consumo de ingredientes, livro de receitas, materiais diferentes, ferramentas de madeira/pedra/ferro/ouro/diamante e utilidades.
- Bancada, fornalha com entrada/combustível/saída e processamento temporizado, baú com 27 posições, portas de dois blocos, cama com renascimento e avanço da noite, mudas que crescem e tochas com luz local.
- Vida, fome, alimentos, regeneração, combate, morte, descarte de inventário e renascimento. Um mundo salvo com o jogador morto reabre na tela de morte.
- Vacas, porcos, ovelhas e galinhas; zumbis, esqueletos com projéteis e Creepers com preparação e dano radial. Movimento, fuga/perseguição, colisões, animações, vida, drops, aparecimento noturno e limites de população.
- Dia e noite em ciclo de 20 minutos, sol, lua, estrelas, nuvens, névoa, mão e ferramenta animadas, sons sintetizados e ambiente simples.
- Opções funcionais de distância, resolução, FOV, sombras, sensibilidade, inversão do mouse, dificuldade e volumes, preservadas no navegador.
- Persistência de seed, configuração, alterações dos blocos, jogador, inventário, vida, fome, posição, orientação, horário, baús, fornalhas, portas e renascimento. Salvamento periódico e ao sair; validação de dados e alternativa local quando IndexedDB não está disponível.

## Simplificações

- Água estática; sem propagação de fluidos. Cavernas e biomas usam algoritmos compactos.
- Iluminação aproximada, com até 12 fontes próximas; sem propagação de luz por voxel. Sombras são opcionais.
- Lajes, escadas, camas e portas fechadas usam colisões de uma célula inteira, embora suas malhas tenham formatos menores. Portas abertas liberam passagem.
- IA local com colisões e saltos; sem busca global de caminhos. Explosões de Creepers causam dano a entidades e preservam o terreno.
- Criaturas e itens largados no chão não são persistidos individualmente. Ao morrer, itens podem ser recuperados durante a sessão; prefira recuperar antes de sair do mundo.
- Catálogo e receitas são um subconjunto; alguns materiais extras são acessíveis principalmente pelo Criativo. Não há a progressão completa de todos os itens do Minecraft.
- Efeitos sonoros são sintetizados e compartilhados; não há trilha musical nem vocalizações específicas para todas as criaturas.
- Salvamento pertence ao mesmo navegador, perfil e origem `http://127.0.0.1:5173`, sem sincronização entre dispositivos.
- Geração e reconstrução podem produzir pequenas pausas. A meta de 60 FPS em hardware intermediário não foi medida nem garantida.

## Funcionalidades não concluídas

Multiplayer, armaduras, agricultura completa, redstone, encantamentos, aldeias/aldeões, domesticação, pesca, clima, portais, Nether e outras dimensões. Não há compatibilidade com saves, mods ou servidores oficiais do Minecraft.

## Testes realizados

- **`npm.cmd run build`: aprovado.** Validação TypeScript e build Vite da versão entregue, sem erros ou avisos de tamanho de chunks.
- **`npm.cmd test`: 55 testes aprovados, zero falhas.** Inventário/crafting/fornalha/persistência (11), operações da interface e conservação de itens (9), geração e bordas de chunks (8), jogador e física (9), criaturas/combate/aparecimento noturno (8) e servidor HTTP (10).
- **Roteiro completo no Edge, em desenvolvimento e na versão compilada: aprovado.** Sobrevivência vazia, coleta de madeira, receitas pela interface, bancada, picaretas, minério, fundição em tempo real com a interface aberta, baú, construção, combate, tocha em caverna, noite, salvamento, recarga da página, restauração de 36 modificações e inventários, Criativo/voo e morte/renascimento.
- **Controles reais de mouse e teclado: nove verificações aprovadas.** Movimento, mouse look, quebrar/colocar pelo raio da câmera, tempo de mineração, portas, cama, F5, pausa e recarga após morte.
- **Opções e arrastar itens no Edge: aprovado.** FOV, resolução, câmera de sombras, volumes e sensibilidade mudam o estado real; preferências sobrevivem à recarga; distância de dois chunks gera 25 chunks; arrasto nativo transfere uma pilha entre slots.
- **Recursos de produção: aprovado.** HTML, JavaScript do jogo, Three.js, CSS e favicon carregam localmente. Nenhuma requisição externa, erro de execução, erro de console ou falha de rede nos roteiros finais. O Edge de testes emitiu um aviso de renderização WebGL por software, sem falha do jogo.

Os roteiros automatizados usam preparação determinística de posições e aceleração de mineração/horário em algumas etapas para verificar integração e persistência. O roteiro separado de controles utiliza eventos reais do navegador. Não foi realizada uma sessão manual integral de 20 minutos nem avaliação em vários computadores.

As capturas em `artifacts/` são renderizações reais do jogo. Registros: `browser-acceptance.json`, `browser-controls.json`, `browser-options.json` e `browser-resources.json`. Há imagens do menu, partida, inventário, bancada, fornalha, baú, caverna antes/depois da tocha, noite, Criativo, terceira pessoa, sombras e morte.

## Execução

Abra **JOGAR.bat** no Windows. A versão compilada precisa apenas do Node.js e de um navegador com WebGL, sem npm ou internet. O jogo abre em **http://127.0.0.1:5173**. Mantenha o terminal aberto; Ctrl+C encerra o servidor.

Para desenvolver: **INICIAR.bat**, ou `npm.cmd install` e `npm.cmd run dev`. Para recompilar: `npm.cmd run build`. Para servir a versão pronta: `node scripts/serve.mjs --open`.

Com o servidor ativo, execute os roteiros com `npm.cmd run test:browser`, `npm.cmd run test:controls` e `npm.cmd run test:options`. No Windows usam o Edge instalado; em outros sistemas precisam do Chromium do Playwright. O [README.md](README.md) contém todos os controles e detalhes de uso.
