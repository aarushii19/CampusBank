import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function stylesPlugin() {
  return {
    name: 'emit-app-styles',
    async buildStart() {
      const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'styles.css', source: css });
    },
    transform(_source, id) {
      if (id.endsWith('.css')) return { code: 'export default "";', map: { mappings: '' } };
      return null;
    },
    async writeBundle() {
      await mkdir(resolve(root, 'dist'), { recursive: true });
      const html = await readFile(resolve(root, 'index.html'), 'utf8');
      await writeFile(resolve(root, 'dist/index.html'), html);
    }
  };
}

export default {
  input: resolve(root, 'src/main.jsx'),
  output: { file: resolve(root, 'dist/assets/main.js'), format: 'es', sourcemap: true },
  plugins: [
    stylesPlugin(),
    nodeResolve({ browser: true, extensions: ['.mjs', '.js', '.jsx', '.json'] }),
    replace({ preventAssignment: true, 'process.env.NODE_ENV': JSON.stringify('production') }),
    commonjs(),
    babel({ babelHelpers: 'bundled', extensions: ['.js', '.jsx'], exclude: 'node_modules/**', presets: [['@babel/preset-react', { runtime: 'automatic' }]] })
  ]
};
