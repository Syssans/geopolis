import './styles.css';
import topo from 'world-atlas/countries-110m.json';
import type { Topology } from 'topojson-specification';
import { buildWorld, countryFeatures } from './game/world';
import { App } from './ui/app';

const t = topo as unknown as Topology;
new App(document.getElementById('app')!, buildWorld(t), countryFeatures(t));
