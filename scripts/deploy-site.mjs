import { spawnSync } from 'child_process';

const gitIdentity = {
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'MathMap',
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'mathmap@users.noreply.github.com',
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? 'MathMap',
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? 'mathmap@users.noreply.github.com',
};

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...gitIdentity },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build:pages']);
run('npx', ['gh-pages', '-d', 'dist', '-m', 'Deploy MathMap site']);
console.log('\nPublished. Live site: https://<your-username>.github.io/<repo-name>/');
