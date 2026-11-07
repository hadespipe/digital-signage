import { parse } from 'acorn';
import { readdir, readFile } from 'node:fs/promises';
for (const file of await readdir('tv')) if (file.endsWith('.js')) {
  parse(await readFile('tv/' + file, 'utf8'), { ecmaVersion: 2019 });
  console.log('ES2019:', file);
}
