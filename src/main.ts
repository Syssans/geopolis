import './styles.css';
import './ui/fonts';
import { TOPOLOGY, WORLD } from './game/world';
import { App } from './ui/app';

new App(document.getElementById('app')!, WORLD, TOPOLOGY);
