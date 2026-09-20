#!/usr/bin/env node

/*
 * Repository-local auto-sync watcher.
 * Stages changed files, commits them after a short quiet period, then pushes
 * the current branch to origin. Stop with Ctrl+C or terminate the task.
 */
const { execFile } = require('child_process');
const { watch, readdirSync, statSync } = require('fs');
const { join, relative } = require('path');

const root = join(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', '.DS_Store']);
const delayMs = 2500;
let timer;
let syncing = false;
let pending = false;
const watchers = [];

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: root }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(sync, delayMs);
}

async function sync() {
  if (syncing) {
    pending = true;
    return;
  }

  syncing = true;
  try {
    await run('git', ['add', '-A']);
    try {
      await run('git', ['diff', '--cached', '--quiet']);
      return;
    } catch {
      const branch = await run('git', ['branch', '--show-current']);
      const timestamp = new Date().toISOString().replace('T', ' ').replace(/:\d\d\.\d{3}Z$/, ' UTC');
      await run('git', ['commit', '-m', `chore: auto-sync ${timestamp}`]);
      await run('git', ['push', 'origin', branch]);
      console.log(`[auto-sync] committed and pushed ${branch} at ${timestamp}`);
    }
  } catch (error) {
    console.error(`[auto-sync] ${error.stderr || error.message}`);
  } finally {
    syncing = false;
    if (pending) {
      pending = false;
      schedule();
    }
  }
}

function watchDirectory(directory) {
  const watcher = watch(directory, (_event, filename) => {
    if (!filename || ignored.has(String(filename).split(/[\\/]/)[0])) return;
    schedule();
  });
  watchers.push(watcher);

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || ignored.has(entry.name)) continue;
    watchDirectory(join(directory, entry.name));
  }
}

watchDirectory(root);
console.log('[auto-sync] watching for changes (2.5 second debounce)');
sync();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
