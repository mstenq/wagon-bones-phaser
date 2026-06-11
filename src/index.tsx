/* @refresh reload */
import { render } from 'solid-js/web';

import App from './App';
import { initDevModeFromUrl } from './game/DevMode';
import { initScoreAnimLabFromUrl } from './phaser/scenes/dev/scoreAnimLabUrl';

const root = document.getElementById('root');

initDevModeFromUrl();
initScoreAnimLabFromUrl();
render(() => <App />, root!);
