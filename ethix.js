console.log('✅ Server Started...');

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cluster from 'cluster';
import fs from 'fs';
import cfonts from 'cfonts';
import readline from 'readline';
import yargs from 'yargs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { say } = cfonts;
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

say('Sarkar-MD', {
  font: 'pallet',
  align: 'center',
  gradient: ['red', 'magenta'],
});

say('PAIR SYSTEM', {
  font: 'console',
  align: 'center',
  gradient: ['cyan', 'magenta'],
});

let isRunning = false;

/**
 * Start the bot process
 * @param {String} file 
 */
function start(file) {
  if (isRunning) return;
  isRunning = true;

  let args = [join(__dirname, file), ...process.argv.slice(2)];

  say(`Starting: ${args.join(' ')}`, {
    font: 'console',
    align: 'center',
    gradient: ['red', 'magenta'],
  });

  if (cluster.isPrimary) {
    let worker = cluster.fork();

    worker.on('message', (data) => {
      console.log('[MESSAGE RECEIVED]:', data);
      if (data === 'reset') {
        console.log('♻️ Restarting bot...');
        worker.kill();
        isRunning = false;
        start(file);
      }
    });

    worker.on('exit', (code) => {
      isRunning = false;
      console.error(`❌ Process exited with code: ${code}`);
      if (code !== 0) {
        console.log('🔄 Restarting process...');
        start(file);
      }
    });

    fs.watchFile(args[0], () => {
      fs.unwatchFile(args[0]);
      console.log('📂 File updated, restarting bot...');
      worker.kill();
      isRunning = false;
      start(file);
    });
  }

  let opts = yargs(process.argv.slice(2)).exitProcess(false).parse();
  if (!opts['test']) {
    rl.on('line', (line) => {
      worker.emit('message', line.trim());
    });
  }
}

start('index.js');
