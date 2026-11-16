import './style.css';
import { Game } from './game';
try { const game=new Game(document.querySelector<HTMLCanvasElement>('#game')!);(window as unknown as {blockcraft:Game}).blockcraft=game; }
catch(error){document.querySelector('#ui')!.innerHTML=`<div class="fatal"><h1>Não foi possível iniciar o WebGL</h1><p>Use um navegador com aceleração de hardware ativada.</p><pre></pre></div>`;document.querySelector('pre')!.textContent=String(error);console.error(error)}
