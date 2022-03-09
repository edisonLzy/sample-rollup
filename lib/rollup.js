import Bundle from './Bundle';
export default function rollup(entry, filename) {
  const bundle = new Bundle({
    entry,
  });
  bundle.build(filename);
}
