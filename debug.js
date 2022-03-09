import path from 'path';
import rollup from './lib/rollup';
const entry = path.resolve(__dirname, 'src/index.js');
rollup(entry, 'dest/bundle.js');
