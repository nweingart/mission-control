import { spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

type OutputCallback = (data: { type: 'stdout' | 'stderr'; content: string }) => void;

interface GitStatus {
  hasGitRepo: boolean;
  hasRemote: boolean;
  remoteUrl: string;
  isDirty: boolean;
}

interface CommitResult {
  commitHash: string;
  isNewCommit: boolean;
}

interface RepoResult {
  repoUrl: string;
  githubUsername: string;
}

// Default timeout for git/gh operations (2 minutes)
const GIT_TIMEOUT = 2 * 60 * 1000;

function getEnv(): Record<string, string> {
  const homedir = process.env.HOME || require('os').homedir();
  const extraPaths = [
    `${homedir}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const currentPath = process.env.PATH || '';
  const fullPath = [...extraPaths, ...currentPath.split(':')].join(':');

  return {
    ...process.env as Record<string, string>,
    HOME: homedir,
    PATH: fullPath,
    GIT_TERMINAL_PROMPT: '0',
  };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  onOutput?: OutputCallback,
  timeout = GIT_TIMEOUT
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    let isResolved = false;

    const child = spawn(command, args, {
      cwd,
      env: getEnv(),
      shell: false,
    });

    const timeoutHandle = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        try {
          child.kill('SIGTERM');
        } catch (err) {
          console.error(`Error killing ${command} process on timeout:`, err);
        }
        reject(new Error(`${command} ${args[0]} timed out`));
      }
    }, timeout);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const content = data.toString();
      stdout += content;
      onOutput?.({ type: 'stdout', content });
    });

    child.stderr.on('data', (data) => {
      const content = data.toString();
      stderr += content;
      onOutput?.({ type: 'stderr', content });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      if (!isResolved) {
        isResolved = true;
        if (error.message.includes('ENOENT')) {
          const tool = command === 'gh' ? 'GitHub CLI (gh)' : command;
          reject(new Error(`${tool} not found. Please install it and try again.`));
        } else {
          reject(new Error(`Failed to run ${command}: ${error.message}`));
        }
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (isResolved) return;
      isResolved = true;
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

const GITIGNORE_CONTENT = `# dependencies
node_modules/

# next.js
.next/
out/

# build output
dist/
build/

# caches
.turbo/
.swc/

# env files
.env
.env.*
.env.local
.env.development.local
.env.test.local
.env.production.local

# vercel
.vercel/

# test coverage
coverage/

# misc
.DS_Store
*.tsbuildinfo
*.log
next-env.d.ts
`;

export class GitHubService {
  async checkGitStatus(projectPath: string): Promise<GitStatus> {
    const result: GitStatus = {
      hasGitRepo: false,
      hasRemote: false,
      remoteUrl: '',
      isDirty: false,
    };

    // Check if .git exists
    try {
      const { code } = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], projectPath);
      result.hasGitRepo = code === 0;
    } catch {
      result.hasGitRepo = false;
    }

    if (!result.hasGitRepo) return result;

    // Check remote
    try {
      const { stdout, code } = await runCommand('git', ['remote', 'get-url', 'origin'], projectPath);
      if (code === 0 && stdout.trim()) {
        result.hasRemote = true;
        result.remoteUrl = stdout.trim();
      }
    } catch {
      // No remote
    }

    // Check dirty state
    try {
      const { stdout } = await runCommand('git', ['status', '--porcelain'], projectPath);
      result.isDirty = stdout.trim().length > 0;
    } catch {
      // Assume clean on error
    }

    return result;
  }

  async gitInit(projectPath: string, onOutput?: OutputCallback): Promise<void> {
    const { code, stderr } = await runCommand('git', ['init'], projectPath, onOutput);
    if (code !== 0) {
      if (stderr.includes('Permission denied') || stderr.includes('permission denied')) {
        throw new Error('Permission denied: cannot initialize git repository. Check folder permissions.');
      }
      throw new Error(`git init failed: ${stderr.slice(0, 300)}`);
    }
  }

  async ensureGitignore(projectPath: string): Promise<void> {
    const gitignorePath = join(projectPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
    } else {
      // Ensure key entries exist
      const existing = readFileSync(gitignorePath, 'utf-8');
      const entriesToAdd: string[] = [];
      const requiredEntries = ['node_modules', '.next', '.env', '.vercel', '.DS_Store'];

      for (const entry of requiredEntries) {
        if (!existing.includes(entry)) {
          entriesToAdd.push(entry === '.env' ? '.env\n.env.*' : entry === 'node_modules' ? 'node_modules/' : entry === '.next' ? '.next/' : entry === '.vercel' ? '.vercel/' : entry);
        }
      }

      if (entriesToAdd.length > 0) {
        const appendContent = '\n# Added by Mission Control\n' + entriesToAdd.join('\n') + '\n';
        writeFileSync(gitignorePath, existing + appendContent, 'utf-8');
      }
    }
  }

  async ensureGitConfig(projectPath: string, username: string): Promise<void> {
    // Check if user.name is set locally or globally
    try {
      const { code } = await runCommand('git', ['config', 'user.name'], projectPath);
      if (code === 0) return; // Already set
    } catch {
      // Not set, continue
    }

    // Set local git config
    await runCommand('git', ['config', 'user.name', username], projectPath);
    await runCommand('git', ['config', 'user.email', `${username}@users.noreply.github.com`], projectPath);
  }

  async gitAddAndCommit(
    projectPath: string,
    message: string,
    onOutput?: OutputCallback
  ): Promise<CommitResult> {
    // Stage all changes
    const addResult = await runCommand('git', ['add', '.'], projectPath, onOutput);
    if (addResult.code !== 0) {
      if (addResult.stderr.includes('.lock')) {
        throw new Error('Git lock file exists — another git process may be running. Wait a moment and retry.');
      }
      throw new Error(`git add failed: ${addResult.stderr.slice(0, 300)}`);
    }

    // Check if there's anything to commit
    const statusResult = await runCommand('git', ['status', '--porcelain'], projectPath);
    if (statusResult.stdout.trim().length === 0) {
      // Nothing to commit - get current HEAD hash
      let hash = '';
      try {
        const headResult = await runCommand('git', ['rev-parse', '--short', 'HEAD'], projectPath);
        hash = headResult.stdout.trim();
      } catch {
        // No commits yet
      }
      onOutput?.({ type: 'stdout', content: 'Nothing to commit, working tree clean\n' });
      return { commitHash: hash, isNewCommit: false };
    }

    // Commit
    const commitResult = await runCommand('git', ['commit', '-m', message], projectPath, onOutput);
    if (commitResult.code !== 0) {
      if (commitResult.stderr.includes('.lock')) {
        throw new Error('Git lock file exists — another git process may be running. Wait a moment and retry.');
      }
      throw new Error(`git commit failed: ${commitResult.stderr.slice(0, 300)}`);
    }

    // Get commit hash
    const hashResult = await runCommand('git', ['rev-parse', '--short', 'HEAD'], projectPath);
    return { commitHash: hashResult.stdout.trim(), isNewCommit: true };
  }

  async createGitHubRepoAndPush(
    projectPath: string,
    name: string,
    onOutput?: OutputCallback
  ): Promise<RepoResult> {
    // Sanitize repo name: only allow alphanumeric, hyphens, underscores
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
    if (!sanitizedName) {
      throw new Error('Invalid repository name');
    }

    const { stdout, stderr, code } = await runCommand(
      'gh',
      ['repo', 'create', sanitizedName, '--public', '--source=.', '--push'],
      projectPath,
      onOutput
    );

    if (code !== 0) {
      if (stderr.includes('not logged') || stderr.includes('auth login')) {
        throw new Error('GitHub CLI is not authenticated. Please run "gh auth login" in your terminal and try again.');
      } else if (stderr.includes('Permission denied') || stderr.includes('publickey')) {
        throw new Error('SSH key authentication failed. Please check your SSH keys or try "gh auth login" to switch to HTTPS.');
      } else if (stderr.includes('Name already exists') || stderr.includes('already exists on this account')) {
        throw new Error(`Name already exists: ${sanitizedName}`);
      } else {
        throw new Error(`GitHub repo creation failed: ${stderr.slice(0, 500)}`);
      }
    }

    // Extract repo URL from output
    // gh repo create outputs something like: https://github.com/user/repo
    const urlMatch = (stdout + stderr).match(/https:\/\/github\.com\/[^\s]+/);
    let repoUrl = urlMatch ? urlMatch[0] : '';
    let githubUsername = '';

    if (repoUrl) {
      // Extract username from URL: https://github.com/username/repo
      const parts = repoUrl.replace('https://github.com/', '').split('/');
      githubUsername = parts[0] || '';
    }

    // If we didn't get the URL from output, construct it
    if (!repoUrl) {
      try {
        githubUsername = await this.getGitHubUsername();
        repoUrl = `https://github.com/${githubUsername}/${sanitizedName}`;
      } catch {
        // Fall back to getting remote URL
        const remoteResult = await runCommand('git', ['remote', 'get-url', 'origin'], projectPath);
        repoUrl = remoteResult.stdout.trim();
        const parts = repoUrl.replace('https://github.com/', '').split('/');
        githubUsername = parts[0] || '';
      }
    }

    return { repoUrl, githubUsername };
  }

  async gitPush(projectPath: string, onOutput?: OutputCallback): Promise<void> {
    const { code, stderr } = await runCommand('git', ['push'], projectPath, onOutput);
    if (code !== 0) {
      if (stderr.includes('Permission denied') || stderr.includes('publickey')) {
        throw new Error('SSH key authentication failed during push. Please check your SSH keys or run "gh auth login" to configure HTTPS.');
      } else if (stderr.includes('Could not resolve host') || stderr.includes('unable to access')) {
        throw new Error('Network error during git push. Please check your internet connection and try again.');
      } else {
        throw new Error(`git push failed: ${stderr.slice(0, 500)}`);
      }
    }
  }

  async resetWorkingTree(projectPath: string): Promise<void> {
    // Remove any stale lock file before reset
    const lockPath = join(projectPath, '.git', 'index.lock');
    try {
      if (existsSync(lockPath)) {
        const { unlinkSync } = require('fs');
        unlinkSync(lockPath);
      }
    } catch {
      // Non-fatal — lock may be held by a running process
    }

    // Abort any in-progress merge
    await runCommand('git', ['merge', '--abort'], projectPath).catch(() => {});

    // Discard all uncommitted changes (tracked and untracked)
    await runCommand('git', ['checkout', '--', '.'], projectPath).catch(() => {});
    await runCommand('git', ['clean', '-fd'], projectPath).catch(() => {});
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    const { stdout, code, stderr } = await runCommand(
      'git', ['rev-parse', '--abbrev-ref', 'HEAD'], projectPath
    );
    if (code !== 0) {
      if (stderr.includes('not a git repository')) {
        throw new Error('Not a git repository. The project directory may have been moved or deleted.');
      }
      if (stderr.includes('unknown revision') || stderr.includes('bad default revision')) {
        // No commits yet — return default branch name
        return 'main';
      }
      throw new Error(`Could not determine current branch: ${stderr.slice(0, 300)}`);
    }
    return stdout.trim();
  }

  async createAndCheckoutBranch(projectPath: string, name: string): Promise<void> {
    const { code, stderr } = await runCommand(
      'git', ['checkout', '-b', name], projectPath
    );
    if (code !== 0) {
      if (stderr.includes('already exists')) {
        throw new Error(`Branch "${name}" already exists. A previous build attempt may not have cleaned up.`);
      }
      if (stderr.includes('not a git repository')) {
        throw new Error('Not a git repository. The project directory may have been moved or deleted.');
      }
      if (stderr.includes('Your local changes') || stderr.includes('would be overwritten')) {
        throw new Error('Uncommitted changes would be overwritten. Commit or discard them first.');
      }
      throw new Error(`Failed to create branch "${name}": ${stderr.slice(0, 300)}`);
    }
  }

  async checkoutBranch(projectPath: string, name: string): Promise<void> {
    const { code, stderr } = await runCommand(
      'git', ['checkout', name], projectPath
    );
    if (code !== 0) {
      if (stderr.includes('did not match') || stderr.includes('pathspec')) {
        throw new Error(`Branch "${name}" does not exist.`);
      }
      if (stderr.includes('Your local changes') || stderr.includes('would be overwritten')) {
        throw new Error('Uncommitted changes would be overwritten by checkout. Commit or discard them first.');
      }
      if (stderr.includes('.lock')) {
        throw new Error('Git lock file exists — another git process may be running. Wait a moment and retry.');
      }
      throw new Error(`Failed to checkout branch "${name}": ${stderr.slice(0, 300)}`);
    }
  }

  async mergeBranch(projectPath: string, name: string, onOutput?: OutputCallback): Promise<void> {
    const { code, stderr } = await runCommand(
      'git', ['merge', name, '--no-ff', '-m', `Merge ${name}`], projectPath, onOutput
    );
    if (code !== 0) {
      if (stderr.includes('CONFLICT') || stderr.includes('merge conflict') || stderr.includes('Merge conflict')) {
        // Abort the failed merge so git state is clean
        await runCommand('git', ['merge', '--abort'], projectPath).catch(() => {});
        throw new Error(`Merge conflict on branch "${name}". The changes conflict with main. Skipping this task may help.`);
      }
      if (stderr.includes('not something we can merge')) {
        throw new Error(`Branch "${name}" cannot be merged — it may not exist or has no commits.`);
      }
      throw new Error(`Failed to merge branch "${name}": ${stderr.slice(0, 300)}`);
    }
  }

  async renameBranch(projectPath: string, newName: string): Promise<void> {
    const { code, stderr } = await runCommand(
      'git', ['branch', '-m', newName], projectPath
    );
    if (code !== 0) {
      if (stderr.includes('already exists')) {
        throw new Error(`Branch "${newName}" already exists. Cannot rename current branch.`);
      }
      throw new Error(`Failed to rename branch to "${newName}": ${stderr.slice(0, 300)}`);
    }
  }

  async deleteBranch(projectPath: string, name: string): Promise<void> {
    try {
      await runCommand('git', ['branch', '-D', name], projectPath);
    } catch {
      // Non-fatal — branch may already be deleted
    }
  }

  async branchExists(projectPath: string, branchName: string): Promise<boolean> {
    try {
      const { code } = await runCommand(
        'git', ['rev-parse', '--verify', `refs/heads/${branchName}`], projectPath
      );
      return code === 0;
    } catch {
      return false;
    }
  }

  async getDiff(projectPath: string, base?: string): Promise<string> {
    const args = base
      ? ['diff', `${base}...HEAD`]
      : ['diff', 'HEAD'];
    const { stdout, code, stderr } = await runCommand('git', args, projectPath);
    if (code !== 0) {
      throw new Error(`git diff failed: ${stderr}`);
    }
    return stdout;
  }

  async getDiffStat(projectPath: string, base: string): Promise<string> {
    const { stdout, code, stderr } = await runCommand(
      'git', ['diff', '--stat', `${base}...HEAD`], projectPath
    );
    if (code !== 0) {
      throw new Error(`git diff --stat failed: ${stderr}`);
    }
    return stdout.trim();
  }

  async getCommitDiff(projectPath: string, commitHash: string): Promise<string> {
    const { stdout, code, stderr } = await runCommand(
      'git', ['show', '--stat', '--patch', commitHash], projectPath
    );
    if (code !== 0) {
      throw new Error(`git show failed: ${stderr}`);
    }
    return stdout;
  }

  async getTaskDiff(projectPath: string, commitHashes: string[]): Promise<string> {
    if (commitHashes.length === 0) return '';

    if (commitHashes.length === 1) {
      const { stdout, code, stderr } = await runCommand(
        'git', ['show', '--patch', commitHashes[0]], projectPath
      );
      if (code !== 0) {
        throw new Error(`git show failed: ${stderr}`);
      }
      return stdout;
    }

    // Multiple hashes: diff from first^ to last
    const first = commitHashes[0];
    const last = commitHashes[commitHashes.length - 1];

    // Try first^..last (parent of first commit to last commit)
    const { stdout, code, stderr } = await runCommand(
      'git', ['diff', `${first}^..${last}`], projectPath
    );

    if (code === 0) return stdout;

    // Fallback: first commit may be the root commit (no parent)
    const fallback = await runCommand(
      'git', ['diff', '--root', last], projectPath
    );
    if (fallback.code !== 0) {
      throw new Error(`git diff failed: ${stderr || fallback.stderr}`);
    }
    return fallback.stdout;
  }

  async getGitHubUsername(): Promise<string> {
    const { stdout, code, stderr } = await runCommand(
      'gh',
      ['api', 'user', '-q', '.login'],
      process.env.HOME || require('os').homedir()
    );

    if (code !== 0) {
      if (stderr.includes('not logged') || stderr.includes('auth login')) {
        throw new Error('GitHub CLI is not authenticated. Please run "gh auth login" in your terminal and try again.');
      }
      throw new Error(`Failed to get GitHub username: ${stderr.slice(0, 500)}`);
    }

    return stdout.trim();
  }

  async setSecret(repoFullName: string, name: string, value: string): Promise<void> {
    const homePath = process.env.HOME || require('os').homedir();
    const { code, stderr } = await runCommand(
      'gh',
      ['secret', 'set', name, '--repo', repoFullName, '--body', value],
      homePath
    );
    if (code !== 0) {
      throw new Error(`Failed to set GitHub secret ${name}: ${stderr.slice(0, 500)}`);
    }
  }

  async getWorkflowRuns(projectPath: string, limit = 5): Promise<string> {
    const { stdout, code, stderr } = await runCommand(
      'gh',
      ['run', 'list', '--json', 'databaseId,status,conclusion,headSha,createdAt,event', '--limit', String(limit)],
      projectPath
    );
    if (code !== 0) {
      throw new Error(`Failed to get workflow runs: ${stderr.slice(0, 500)}`);
    }
    return stdout;
  }

  writeWorkflowFile(projectPath: string, content: string): void {
    const workflowDir = join(projectPath, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, 'deploy.yml'), content, 'utf-8');
  }

  async runShellCommand(cwd: string, command: string, args: string[] = []): Promise<string> {
    let cmd: string;
    let cmdArgs: string[];
    if (args.length > 0) {
      // New safe path: command + pre-split args
      cmd = command;
      cmdArgs = args;
    } else {
      // Legacy fallback: split on spaces (only used if no args provided)
      const parts = command.split(' ');
      cmd = parts.shift()!;
      cmdArgs = parts;
    }
    const { stdout, stderr, code } = await runCommand(cmd, cmdArgs, cwd, undefined, 5 * 60 * 1000);
    if (code !== 0) {
      throw new Error(stderr || `Command failed with code ${code}`);
    }
    return stdout;
  }

  async createWorktree(repoPath: string, worktreePath: string, branchName: string, startPoint = 'main'): Promise<void> {
    mkdirSync(join(worktreePath, '..'), { recursive: true });
    const { stderr, code } = await runCommand('git', ['worktree', 'add', worktreePath, '-b', branchName, startPoint], repoPath);
    if (code !== 0) throw new Error(stderr || 'Failed to create worktree');
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    try {
      await runCommand('git', ['worktree', 'remove', worktreePath, '--force'], repoPath);
    } catch {
      // Fallback: manual delete + prune
      const fs = require('fs');
      fs.rmSync(worktreePath, { recursive: true, force: true });
      await runCommand('git', ['worktree', 'prune'], repoPath);
    }
  }

  async deleteRepo(repoUrl: string): Promise<void> {
    const fullName = repoUrl.replace('https://github.com/', '').replace(/\.git$/, '').replace(/\/$/, '');
    if (!fullName || !fullName.includes('/')) {
      throw new Error(`Invalid GitHub repo URL: ${repoUrl}`);
    }
    const { code, stderr } = await runCommand('gh', ['repo', 'delete', fullName, '--yes'], process.cwd());
    if (code !== 0) {
      throw new Error(`Failed to delete GitHub repo: ${stderr.slice(0, 500)}`);
    }
  }
}
