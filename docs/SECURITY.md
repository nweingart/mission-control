# Security Model

## Claude Code Permission Bypass

Mission Control invokes the Claude Code CLI with `--dangerously-skip-permissions`. This flag bypasses Claude Code's interactive permission prompts.

### Why this is necessary

Mission Control orchestrates Claude as a sub-agent in an automated build pipeline. Every invocation is programmatic — there is no interactive terminal session where Claude could ask the user for permission. The build pipeline needs Claude to read files, write code, and run commands without manual approval at each step.

### Trust model

- **The user grants trust at the Mission Control app level.** When a user starts a build, they are implicitly authorizing Claude to modify files within the project directory.
- **Claude operates within project scope.** All Claude invocations are scoped to the project's working directory (`projectPath`).
- **The flag is documented.** Each usage of `--dangerously-skip-permissions` in the codebase includes a comment explaining why it's required.

### Where it's used

- `electron/services/claude-code.ts` — `spawn()` (PTY-based), `chat()`, `chatStreaming()`, `chatWithResume()`
- All methods pass the flag via args array with `shell: false` (no shell injection vector)

### First-use consent

On first launch, the onboarding flow explains that Mission Control will use Claude Code to build software on the user's behalf. By completing onboarding and starting a build, the user acknowledges this trust model.

### Mitigations

- All Claude processes run with `shell: false` to prevent command injection
- Temp file paths are validated with a safe-character regex before any shell interpolation
- The PTY spawn method validates paths and cleans up temp files on failure
- Build output is bounded (MAX_TERMINAL_LINES, MAX_DIFF_SIZE) to prevent memory exhaustion

## Data at Rest

Project data (chat history, tasks, backlog, etc.) is stored as plain JSON in `~/.mission-control/`. No encryption is applied to local files. This matches the security model of similar developer tools (VS Code settings, git config, etc.).

Sensitive tokens (GitHub auth) are managed by the respective CLI tools (`gh`, `claude`) and are not stored by Mission Control.

## IPC Security

- All IPC messages from the main process are validated with `validateIPC()` before being processed by the renderer
- File system operations validate paths against the project's development root using `fs.realpathSync()` to prevent symlink traversal
- External URLs are validated against an allowlist of protocols (`http:`, `https:`) before opening
- Deep link URLs are validated for the `missioncontrol://` protocol before forwarding
