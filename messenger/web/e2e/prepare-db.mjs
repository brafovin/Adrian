import { execSync } from 'node:child_process';

const [db = 'messenger_e2e', uploads = '/tmp/adrian-e2e-uploads'] = process.argv.slice(2);
if (!/^[a-z0-9_]+$/.test(db)) throw new Error('ungültiger DB-Name');
const run = (sql) => execSync(`psql postgres://messenger:messenger@localhost:5432/postgres -v ON_ERROR_STOP=1 -c "${sql}"`, { stdio: 'pipe' });
run(`drop database if exists ${db} with (force)`);
run(`create database ${db}`);
execSync(`rm -rf ${uploads}`);
