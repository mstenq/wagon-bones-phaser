/* @refresh reload */
import { render } from 'solid-js/web';

import App from './App';
import { initDevModeFromUrl } from './game/DevMode';

const root = document.getElementById('root');

initDevModeFromUrl();
render(() => <App />, root!);
