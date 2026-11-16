import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
try {
  const game = new Game(canvas);
  (window as any).__game = game; // handy for debugging / automated tests
  game.start();
} catch (e) {
  console.error(e);
  document.getElementById('ui')!.innerHTML = `<div class="fatal">Não foi possível iniciar o jogo (WebGL necessário).<br>${String(e)}</div>`;
}
