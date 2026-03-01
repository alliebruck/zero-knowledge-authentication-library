import { chromeExtension } from 'rollup-plugin-chrome-extension';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'manifest.json', // Manifest V3 entry point
  output: {
    dir: 'dist',
    format: 'esm'
  },
  plugins: [
    chromeExtension(),
    resolve(),
    commonjs()
  ]
};