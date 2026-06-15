/* @refresh reload */
import { render } from 'solid-js/web';

import App from './App';
import { initDevModeFromUrl } from './game/DevMode';
import { initScoreAnimLabFromUrl } from './phaser/scenes/dev/scoreAnimLabUrl';
import { initViewportInsets } from './viewportInsets';

const root = document.getElementById('root');

initViewportInsets();
initDevModeFromUrl();
initScoreAnimLabFromUrl();
render(() => <App />, root!);
