# Blockcraft — AI Challenge

Jogo voxel independente inspirado na experiência clássica de explorar, coletar recursos, fabricar ferramentas, construir e sobreviver. Feito em TypeScript, Three.js, Vite e WebGL, com texturas procedurais e áudio sintetizado originais.

## Jogar no Windows

Requer Node.js 22.12 ou superior e um navegador com WebGL e mouse/teclado.

1. Abra **JOGAR.bat** com dois cliques.
2. O navegador abre em **http://127.0.0.1:5173**.
3. Clique em **Um Jogador**, crie um mundo e escolha Sobrevivência ou Criativo.
4. Mantenha o terminal aberto enquanto joga. Para encerrar o servidor, use **Ctrl+C**.

`JOGAR.bat` serve os arquivos já compilados da pasta `dist` usando apenas recursos nativos do Node.js. Com `dist` presente, não precisa de `node_modules`, npm, internet, conta, serviço pago ou chave de API. Não abra `dist/index.html` diretamente pelo Explorador de Arquivos.

Para executar pelo terminal, inclusive em outros sistemas:

```sh
node scripts/serve.mjs --open
```

Se a porta 5173 já estiver ocupada, encerre a instância anterior ou acesse o jogo que já está rodando. O servidor não troca de porta automaticamente.

## Desenvolver e compilar

Abra **INICIAR.bat**. Ele instala as dependências apenas quando necessário e inicia o servidor de desenvolvimento com o navegador. A instalação inicial precisa de internet; a execução do jogo não busca assets na rede.

Comandos equivalentes no PowerShell ou Prompt de Comando, dentro desta pasta:

```powershell
npm.cmd install
npm.cmd run dev -- --open --strictPort
```

Para gerar ou atualizar a versão usada por `JOGAR.bat`:

```powershell
npm.cmd run build
```

Para verificar os sistemas automatizados:

```powershell
npm.cmd test
```

Com o jogo servido, `npm.cmd run test:browser`, `npm.cmd run test:controls` e `npm.cmd run test:options` executam os roteiros de integração no navegador. No Windows usam o Microsoft Edge instalado. As capturas e registros ficam em `artifacts`.

Em Linux/macOS, substitua `npm.cmd` por `npm`. O build valida o TypeScript e gera o bundle local em `dist`.

## Controles

| Entrada | Ação |
| --- | --- |
| W, A, S, D | Movimentar |
| Mouse | Olhar ao redor |
| Espaço | Pular ou nadar para cima |
| Ctrl | Correr |
| Shift | Agachar; descer durante o voo |
| Mouse esquerdo segurado | Quebrar um bloco |
| Mouse esquerdo sobre criatura | Atacar |
| Mouse direito | Colocar bloco, abrir bancada/baú/fornalha, usar cama/porta ou comer |
| Shift + mouse direito | Colocar junto de um bloco interativo |
| E | Abrir ou fechar inventário |
| 1–9 ou roda do mouse | Selecionar posição da hotbar |
| Q | Soltar um item selecionado |
| Esc | Pausar ou fechar inventário |
| Duplo Espaço, no Criativo | Ativar/desativar voo |
| Botão do meio, no Criativo | Copiar o bloco apontado |
| F3 | Coordenadas, FPS, seed e informações do mundo |
| F5 | Alternar primeira e terceira pessoa |

Clique na área do jogo para capturar o mouse. **Esc** libera o ponteiro e pausa. O navegador pode pedir uma interação antes de permitir a captura ou o áudio.

No inventário, clique para pegar/colocar uma pilha, use o botão direito para dividir uma pilha ou colocar uma unidade, e **Shift + clique** para transferir. O livro de receitas preenche a grade quando você tem os ingredientes; clique no resultado para fabricar. O inventário pessoal usa uma grade 2 × 2 e a bancada libera 3 × 3. A fornalha possui entrada, combustível e saída separados.

## Primeiro mundo

Na Sobrevivência, segure o botão esquerdo sobre um tronco para coletar madeira. Abra **E**, transforme troncos em tábuas e fabrique uma bancada. Coloque a bancada e abra com o botão direito para criar ferramentas. Uma picareta adequada permite obter os minérios; processe recursos na fornalha, armazene itens em baús e construa um abrigo antes da noite. Comer repõe fome; uma cama define o renascimento e permite avançar a noite.

No Criativo, o catálogo do inventário oferece os blocos e itens, a mineração é rápida e o voo pode ser ativado com duplo Espaço. Os mundos também podem ser criados no tipo plano e nas dificuldades Pacífico, Fácil, Normal e Difícil.

Uma seed para explorar é **`blockcraft-valley`**. Há uma entrada de caverna perto de **X 16, Y 41, Z -18**: siga para leste ao longo de Z -20, descendo com cuidado ou escavando degraus. Ferro aparece próximo de X 18, Y 40, Z -17. Use F3 para ver suas coordenadas e leve tochas.

## Salvamento

Os mundos ficam no **IndexedDB do navegador**, com armazenamento local como alternativa quando disponível. São gravados a seed, as alterações nos blocos, o jogador, o inventário, o horário, os baús, as fornalhas e as portas. Há salvamento periódico durante o jogo e ações **Salvar mundo** e **Salvar e Sair** no menu de pausa.

Use sempre **http://127.0.0.1:5173**, no mesmo navegador e perfil. `localhost`, outra porta, outro perfil e uma janela anônima usam armazenamentos diferentes. `INICIAR.bat` e `JOGAR.bat` usam a mesma origem para compartilhar os mundos. Limpar os dados do site remove os mundos salvos. Para terminar uma sessão, prefira **Salvar e Sair** antes de fechar o navegador.

## Organização

| Arquivo | Responsabilidade |
| --- | --- |
| `src/main.ts`, `src/game.ts` | Inicialização, ciclo do jogo e integração dos sistemas |
| `src/world.ts` | Terreno determinístico, biomas, cavernas, chunks e malhas de faces expostas |
| `src/atlas.ts` | Atlas de texturas pixeladas geradas localmente |
| `src/registry.ts` | Blocos, itens, ferramentas e propriedades |
| `src/player.ts` | Movimento, colisões, câmera, necessidades e seleção de blocos por raio |
| `src/inventory.ts` | Pilhas, receitas, ferramentas e processamento da fornalha |
| `src/ui.ts`, `src/style.css` | Menus, inventários, catálogo, opções e HUD |
| `src/mobs.ts` | Animais, monstros, combate, projéteis e drops |
| `src/effects.ts` | Partículas e áudio original sintetizado |
| `src/storage.ts` | Persistência e validação dos mundos |
| `scripts/serve.mjs` | Servidor local da versão compilada, sem dependências externas |
| `tests/` | Testes automatizados dos sistemas e roteiro do navegador |
| `artifacts/` | Registros e capturas reais da validação |

## Escopo e limites

Esta é uma recriação simplificada, sem associação com a Mojang ou a Microsoft. Inclui quatro biomas, árvores, rios, montanhas, cavernas, minérios, construção, fabricação, fornalhas, animais, hostis e modos Sobrevivência/Criativo. Não reproduz todos os comportamentos, blocos, receitas ou sistemas do Minecraft Java.

A água é estática. A IA usa deslocamento e colisões locais, sem busca de caminho complexa. Cavernas, iluminação e propagação de luz são simplificadas; tochas não usam a simulação de luz por voxel do jogo original. As criaturas são recriadas ao carregar um mundo, e não têm estado persistido individualmente. Não há multiplayer, armaduras, agricultura avançada, redstone, encantamentos, Nether ou outras dimensões. F5 oferece uma visão em terceira pessoa com avatar cúbico animado.

Itens largados no chão também não são persistidos entre sessões. Lajes, escadas, camas e portas fechadas usam colisões de uma célula inteira. As explosões causam dano às criaturas e ao jogador sem destruir o terreno.

Chunks próximos são montados com apenas as faces expostas, carregados e descartados conforme a posição do jogador. Ainda pode haver pequenas pausas ao explorar e ao reconstruir terreno. Ajuste distância, resolução e sombras em **Opções** conforme seu computador. Não foi estabelecida uma garantia de 60 FPS em hardware intermediário.

Veja [RELATORIO.md](RELATORIO.md) para os sistemas implementados, limites e validações executadas.
