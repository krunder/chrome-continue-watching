import { build, context } from 'esbuild';
import { readFileSync, copyFileSync, mkdirSync, constants } from 'node:fs';
import glob from 'fast-glob';
import { basename } from 'node:path';
import Zip from 'adm-zip';

const manifest = JSON.parse(readFileSync('./manifest.json', { encoding: 'utf8' }));

const copyFiles = (src, dest) => {
  const images = glob.sync(src);
  for (let i = 0; i < images.length; i += 1) {
    mkdirSync(dest, { recursive: true });
    copyFileSync(images[i], `${dest}/${basename(images[i])}`, constants.COPYFILE_FICLONE);
  }
};

copyFileSync('manifest.json', './dist/manifest.json');
copyFiles('./img/icon*.png', './dist/img');

const options = {
  entryPoints: ['src/**/*.ts'],
  bundle: true,
  platform: 'node',
  minify: true,
  outdir: './dist',
};

if (process.argv[2] === '--watch') {
  console.info('Watching for changes...');
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);

  console.info(`Building releases/v${manifest.version}.zip...`);
  mkdirSync('./releases', { recursive: true });
  const zip = new Zip();
  zip.addLocalFolder('./dist');
  zip.writeZip(`./releases/v${manifest.version}.zip`);
}
