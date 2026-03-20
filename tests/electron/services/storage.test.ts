import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs at the module level before importing StorageService
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 100 })),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

import { StorageService } from '../../../electron/services/storage';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { homedir } from 'os';
import { shell } from 'electron';

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedRmSync = vi.mocked(rmSync);
const mockedRenameSync = vi.mocked(renameSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedHomedir = vi.mocked(homedir);

// Helper to create a StorageService instance. The constructor calls ensureDirectories,
// which uses existsSync and mkdirSync. We allow those calls to proceed with the
// default mock behavior (existsSync returns false, mkdirSync does nothing).
function createService(): StorageService {
  return new StorageService();
}

// Helper to create a mock Dirent object
function mockDirent(name: string, isDir = true) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  } as unknown as ReturnType<typeof readdirSync>[number];
}

describe('StorageService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: existsSync returns false so ensureDirectories creates dirs
    mockedExistsSync.mockReturnValue(false);
    mockedHomedir.mockReturnValue('/mock-home');
    // Freeze Date.now for atomic write temp file naming
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  // -----------------------------------------------------------------------
  // 1. Constructor creates directories
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('creates .mission-control and projects directories when they do not exist', () => {
      mockedExistsSync.mockReturnValue(false);
      createService();

      expect(mockedMkdirSync).toHaveBeenCalledWith('/mock-home/.mission-control', { recursive: true });
      expect(mockedMkdirSync).toHaveBeenCalledWith('/mock-home/.mission-control/projects', { recursive: true });
    });

    it('does not create directories when they already exist', () => {
      mockedExistsSync.mockReturnValue(true);
      createService();

      expect(mockedMkdirSync).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2-6. getConfig
  // -----------------------------------------------------------------------
  describe('getConfig', () => {
    it('returns defaults and saves config when no file exists', () => {
      // existsSync: false for mission-control dirs (constructor), false for configPath
      mockedExistsSync.mockReturnValue(false);
      const service = createService();

      const config = service.getConfig();

      expect(config).toEqual({
        developmentPath: '/mock-home/development',
        theme: 'light',
      });
      // saveConfig should have been called (atomicWriteFile writes + renames)
      expect(mockedWriteFileSync).toHaveBeenCalled();
      expect(mockedRenameSync).toHaveBeenCalled();
    });

    it('reads existing config from file', () => {
      const existingConfig = {
        developmentPath: '/custom/path',
        theme: 'dark' as const,
        hasCompletedOnboarding: true,
      };
      const service = createService();

      // After construction, existsSync should return true for config path
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(existingConfig));

      const config = service.getConfig();

      expect(config).toEqual(existingConfig);
    });

    it('handles corrupt JSON by returning defaults', () => {
      const service = createService();

      // configPath exists
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return true;
        if (path.endsWith('config.json.bak')) return false;
        // For atomicWriteFile directory check
        return true;
      });
      mockedReadFileSync.mockReturnValue('NOT VALID JSON{{{');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const config = service.getConfig();

      expect(config).toEqual({
        developmentPath: '/mock-home/development',
        theme: 'light',
      });
      consoleSpy.mockRestore();
    });

    it('recovers from .bak backup when main file is corrupt', () => {
      const backupConfig = {
        developmentPath: '/recovered/path',
        theme: 'dark' as const,
      };
      const service = createService();

      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json.bak')) return true;
        if (path.endsWith('config.json')) return true;
        return true;
      });
      mockedReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.bak')) return JSON.stringify(backupConfig);
        return 'CORRUPT JSON!!!';
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config = service.getConfig();

      expect(config).toEqual(backupConfig);
      consoleSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('expands ~ in developmentPath', () => {
      const configWithTilde = {
        developmentPath: '~/my-projects',
        theme: 'light' as const,
      };
      const service = createService();

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(configWithTilde));

      const config = service.getConfig();

      expect(config.developmentPath).toBe('/mock-home/my-projects');
    });
  });

  // -----------------------------------------------------------------------
  // 7. saveConfig
  // -----------------------------------------------------------------------
  describe('saveConfig', () => {
    it('writes config atomically via temp file and rename', () => {
      const service = createService();

      // For atomicWriteFile: directory exists check
      mockedExistsSync.mockReturnValue(true);

      const config = {
        developmentPath: '/some/path',
        theme: 'dark' as const,
      };
      service.saveConfig(config);

      // Should write to a .tmp file first
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp.'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );
      // Then rename the temp file to the config path
      expect(mockedRenameSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp.'),
        '/mock-home/.mission-control/config.json',
      );
    });
  });

  // -----------------------------------------------------------------------
  // 8-9. listProjects
  // -----------------------------------------------------------------------
  describe('listProjects', () => {
    it('returns empty array when projectsDir does not exist', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(false);

      const projects = service.listProjects();
      expect(projects).toEqual([]);
    });

    it('returns sorted projects (newest first)', () => {
      const service = createService();

      const project1 = {
        slug: 'alpha',
        name: 'Alpha',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/alpha',
      };
      const project2 = {
        slug: 'beta',
        name: 'Beta',
        status: 'idea',
        createdAt: '2024-06-01T00:00:00.000Z',
        projectPath: '/dev/beta',
      };

      // projectsDir exists
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('meta.json')) return true;
        return true;
      });

      mockedReaddirSync.mockReturnValue([
        mockDirent('alpha'),
        mockDirent('beta'),
      ] as any);

      mockedReadFileSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.includes('alpha')) return JSON.stringify(project1);
        if (path.includes('beta')) return JSON.stringify(project2);
        return '{}';
      });

      const projects = service.listProjects();

      expect(projects).toHaveLength(2);
      // Newest first
      expect(projects[0].slug).toBe('beta');
      expect(projects[1].slug).toBe('alpha');
    });
  });

  // -----------------------------------------------------------------------
  // 10-11. getProject
  // -----------------------------------------------------------------------
  describe('getProject', () => {
    it('returns null for missing project', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(false);

      const result = service.getProject('nonexistent');
      expect(result).toBeNull();
    });

    it('reads and returns meta.json for existing project', () => {
      const service = createService();
      const projectData = {
        slug: 'my-project',
        name: 'My Project',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/my-project',
      };

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(projectData));

      const result = service.getProject('my-project');
      expect(result).toEqual(projectData);
    });
  });

  // -----------------------------------------------------------------------
  // 12. createProject
  // -----------------------------------------------------------------------
  describe('createProject', () => {
    it('generates slug, creates directories, writes meta.json and tasks.json', () => {
      const service = createService();

      // For generateSlug: readdirSync returns empty (no existing projects)
      mockedReaddirSync.mockReturnValue([] as any);
      // For getConfig in createProject: config file does not exist (returns defaults)
      // For atomicWriteFile: directory exists
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        // config.json doesn't exist so getConfig returns defaults
        if (path.endsWith('config.json')) return false;
        // tasks backup doesn't exist
        if (path.endsWith('tasks.json')) return false;
        // directories exist for atomicWriteFile
        return true;
      });

      vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-15T12:00:00.000Z');

      const project = service.createProject('My Cool Project', 'An idea');

      expect(project.slug).toBe('my-cool-project');
      expect(project.name).toBe('My Cool Project');
      expect(project.status).toBe('idea');
      expect(project.idea).toBe('An idea');

      // Should create mission-control project dir and development dir
      expect(mockedMkdirSync).toHaveBeenCalledWith(
        '/mock-home/.mission-control/projects/my-cool-project',
        { recursive: true },
      );
      expect(mockedMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('my-cool-project'),
        { recursive: true },
      );

      // Should write meta.json (via atomicWriteFile -> writeFileSync + renameSync)
      const writeFileCalls = mockedWriteFileSync.mock.calls;
      const metaWrite = writeFileCalls.find((call) =>
        String(call[0]).includes('meta.json.tmp'),
      );
      expect(metaWrite).toBeDefined();

      // Should write tasks.json (via saveTasks -> atomicWriteFile)
      const tasksWrite = writeFileCalls.find((call) =>
        String(call[0]).includes('tasks.json.tmp'),
      );
      expect(tasksWrite).toBeDefined();

      vi.restoreAllMocks();
      // Re-mock Date.now since restoreAllMocks cleared it
      vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    });
  });

  // -----------------------------------------------------------------------
  // 13-14. updateProject
  // -----------------------------------------------------------------------
  describe('updateProject', () => {
    it('merges updates and creates backup before writing', () => {
      const service = createService();

      const existingProject = {
        slug: 'my-project',
        name: 'My Project',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/my-project',
      };

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(existingProject));

      const result = service.updateProject('my-project', { status: 'in-progress' });

      expect(result.status).toBe('in-progress');
      expect(result.name).toBe('My Project');

      // createBackup should read + write .bak
      expect(mockedReadFileSync).toHaveBeenCalled();
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('meta.json.bak'),
        expect.any(String),
        'utf-8',
      );
    });

    it('throws for missing project', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(false);

      expect(() => service.updateProject('missing', { status: 'done' })).toThrow(
        'Project not found: missing',
      );
    });
  });

  // -----------------------------------------------------------------------
  // 15-17. deleteProject
  // -----------------------------------------------------------------------
  describe('deleteProject', () => {
    it('removes mission-control metadata directory', () => {
      const service = createService();
      const projectData = {
        slug: 'my-project',
        name: 'My Project',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/my-project',
      };

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(projectData));

      service.deleteProject('my-project', false);

      // Should remove the mission-control metadata dir
      expect(mockedRmSync).toHaveBeenCalledWith(
        '/mock-home/.mission-control/projects/my-project',
        { recursive: true, force: true },
      );
    });

    it('removes generated code when deleteGeneratedCode is true', async () => {
      const service = createService();
      const projectData = {
        slug: 'my-project',
        name: 'My Project',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/my-project',
      };

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(projectData));

      await service.deleteProject('my-project', true);

      // Should trash the generated code directory
      expect(shell.trashItem).toHaveBeenCalledWith('/dev/my-project');
      // Should remove mission-control metadata
      expect(mockedRmSync).toHaveBeenCalledWith(
        '/mock-home/.mission-control/projects/my-project',
        { recursive: true, force: true },
      );
    });

    it('keeps generated code when deleteGeneratedCode is false', () => {
      const service = createService();
      const projectData = {
        slug: 'my-project',
        name: 'My Project',
        status: 'idea',
        createdAt: '2024-01-01T00:00:00.000Z',
        projectPath: '/dev/my-project',
      };

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(projectData));

      service.deleteProject('my-project', false);

      // rmSync should only be called for the metadata directory, not the project path
      const rmCalls = mockedRmSync.mock.calls.map((c) => String(c[0]));
      expect(rmCalls).not.toContain('/dev/my-project');
      expect(rmCalls).toContain('/mock-home/.mission-control/projects/my-project');
    });
  });

  // -----------------------------------------------------------------------
  // 18-20. getTasks / saveTasks
  // -----------------------------------------------------------------------
  describe('getTasks', () => {
    it('returns empty array when no tasks file exists', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(false);

      const tasks = service.getTasks('my-project');
      expect(tasks).toEqual([]);
    });

    it('returns parsed tasks from file', () => {
      const service = createService();
      const taskData = [
        { id: '1', title: 'Task 1', completed: false },
        { id: '2', title: 'Task 2', completed: true },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(taskData));

      const tasks = service.getTasks('my-project');
      expect(tasks).toEqual(taskData);
    });
  });

  describe('saveTasks', () => {
    it('creates backup and writes atomically', () => {
      const service = createService();
      const tasks = [{ id: '1', title: 'Task 1', completed: false }];

      // File exists for backup
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveTasks('my-project', tasks);

      // Backup created: read original + write .bak
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tasks.json.bak'),
        '[]',
        'utf-8',
      );

      // Atomic write: write to .tmp then rename
      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('tasks.json.tmp.'),
        JSON.stringify(tasks, null, 2),
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalledWith(
        expect.stringContaining('tasks.json.tmp.'),
        expect.stringContaining('tasks.json'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 21-23. getPRD / savePRD
  // -----------------------------------------------------------------------
  describe('getPRD', () => {
    it('returns null when no PRD file exists', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(false);

      const result = service.getPRD('my-project');
      expect(result).toBeNull();
    });

    it('reads and returns PRD file content', () => {
      const service = createService();
      const prdContent = '# Product Requirements\n\nThis is the PRD.';

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(prdContent);

      const result = service.getPRD('my-project');
      expect(result).toBe(prdContent);
    });
  });

  describe('savePRD', () => {
    it('writes PRD atomically', () => {
      const service = createService();
      const prdContent = '# My PRD';

      mockedExistsSync.mockReturnValue(true);

      service.savePRD('my-project', prdContent);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('prd.md.tmp.'),
        prdContent,
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalledWith(
        expect.stringContaining('prd.md.tmp.'),
        expect.stringContaining('prd.md'),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 24. getChatHistory / saveChatHistory
  // -----------------------------------------------------------------------
  describe('getChatHistory / saveChatHistory', () => {
    it('returns empty array when no chat file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getChatHistory('my-project')).toEqual([]);
    });

    it('reads and returns chat messages', () => {
      const service = createService();
      const messages = [
        { id: '1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(messages));

      expect(service.getChatHistory('my-project')).toEqual(messages);
    });

    it('saves chat history with backup and atomic write', () => {
      const service = createService();
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', timestamp: new Date() },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveChatHistory('my-project', messages);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('chat.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 25. getBacklog / saveBacklog
  // -----------------------------------------------------------------------
  describe('getBacklog / saveBacklog', () => {
    it('returns empty array when no backlog file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getBacklog('my-project')).toEqual([]);
    });

    it('reads and returns backlog items', () => {
      const service = createService();
      const items = [
        { id: '1', title: 'Item', description: 'Desc', priority: 'high', createdAt: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(items));

      expect(service.getBacklog('my-project')).toEqual(items);
    });

    it('saves backlog with backup and atomic write', () => {
      const service = createService();
      const items = [
        { id: '1', title: 'Item', description: 'Desc', priority: 'high' as const, createdAt: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveBacklog('my-project', items);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('backlog.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 26. getPlanningChats / savePlanningChats
  // -----------------------------------------------------------------------
  describe('getPlanningChats / savePlanningChats', () => {
    it('returns empty array when no planning chats file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getPlanningChats('my-project')).toEqual([]);
    });

    it('reads and returns planning chats', () => {
      const service = createService();
      const chats = [
        { id: '1', title: 'Chat 1', messages: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(chats));

      expect(service.getPlanningChats('my-project')).toEqual(chats);
    });

    it('saves planning chats with backup and atomic write', () => {
      const service = createService();
      const chats = [
        { id: '1', title: 'Chat 1', messages: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.savePlanningChats('my-project', chats);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('planning-chats.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 27. getGitEvents / saveGitEvents
  // -----------------------------------------------------------------------
  describe('getGitEvents / saveGitEvents', () => {
    it('returns empty array when no git events file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getGitEvents('my-project')).toEqual([]);
    });

    it('reads and returns git events', () => {
      const service = createService();
      const events = [
        { id: '1', type: 'commit', timestamp: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(events));

      expect(service.getGitEvents('my-project')).toEqual(events);
    });

    it('saves git events with backup and atomic write', () => {
      const service = createService();
      const events = [
        { id: '1', type: 'commit', timestamp: '2024-01-01' },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveGitEvents('my-project', events as any);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('git-events.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 28. getDeployments / saveDeployments
  // -----------------------------------------------------------------------
  describe('getDeployments / saveDeployments', () => {
    it('returns empty array when no deployments file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getDeployments('my-project')).toEqual([]);
    });

    it('reads and returns deployments', () => {
      const service = createService();
      const deployments = [
        {
          id: '1',
          branch: 'main',
          commitHash: 'abc123',
          status: 'success',
          timestamp: '2024-01-01',
        },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(deployments));

      expect(service.getDeployments('my-project')).toEqual(deployments);
    });

    it('saves deployments with backup and atomic write', () => {
      const service = createService();
      const deployments = [
        {
          id: '1',
          branch: 'main',
          commitHash: 'abc123',
          status: 'success',
          timestamp: '2024-01-01',
        },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveDeployments('my-project', deployments as any);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('deployments.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 29. getGapAnalysis / saveGapAnalysis
  // -----------------------------------------------------------------------
  describe('getGapAnalysis / saveGapAnalysis', () => {
    it('returns empty array when no gap analysis file exists', () => {
      const service = createService();
      mockedExistsSync.mockReturnValue(false);

      expect(service.getGapAnalysis('my-project')).toEqual([]);
    });

    it('reads and returns gap analyses', () => {
      const service = createService();
      const analyses = [
        {
          id: '1',
          pass: 1,
          grade: 80,
          validatedGrade: 75,
          findings: [],
          summary: 'Good',
          fixesApplied: false,
          remainingItems: [],
          timestamp: '2024-01-01',
        },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(JSON.stringify(analyses));

      expect(service.getGapAnalysis('my-project')).toEqual(analyses);
    });

    it('saves gap analyses with backup and atomic write', () => {
      const service = createService();
      const analyses = [
        {
          id: '1',
          pass: 1 as const,
          grade: 80,
          validatedGrade: 75,
          findings: [],
          summary: 'Good',
          fixesApplied: false,
          remainingItems: [],
          timestamp: '2024-01-01',
        },
      ];

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('[]');

      service.saveGapAnalysis('my-project', analyses);

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('gap-analysis.json.bak'),
        '[]',
        'utf-8',
      );
      expect(mockedRenameSync).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 30-33. generateSlug (private, tested via createProject)
  // -----------------------------------------------------------------------
  describe('generateSlug (via createProject)', () => {
    // Helper: set up mocks needed for createProject to run to completion
    function setupCreateProjectMocks() {
      mockedReaddirSync.mockReturnValue([] as any);
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        // config doesn't exist so defaults are used
        if (path.endsWith('config.json')) return false;
        if (path.endsWith('.bak')) return false;
        if (path.endsWith('tasks.json')) return false;
        // directories exist
        return true;
      });
    }

    it('converts name to lowercase kebab-case slug', () => {
      const service = createService();
      setupCreateProjectMocks();

      const project = service.createProject('My Cool Project', 'idea');
      expect(project.slug).toBe('my-cool-project');
    });

    it('handles empty string by using "project" as slug', () => {
      const service = createService();
      setupCreateProjectMocks();

      const project = service.createProject('!!!', 'idea');
      expect(project.slug).toBe('project');
    });

    it('handles Windows reserved names by appending -project', () => {
      const service = createService();
      setupCreateProjectMocks();

      const project = service.createProject('CON', 'idea');
      expect(project.slug).toBe('con-project');
    });

    it('deduplicates existing slugs by appending -2, -3, etc.', () => {
      const service = createService();

      // Simulate existing directory with same slug
      mockedReaddirSync.mockReturnValue([
        mockDirent('my-project'),
      ] as any);

      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return false;
        if (path.endsWith('.bak')) return false;
        if (path.endsWith('tasks.json')) return false;
        return true;
      });

      const project = service.createProject('My Project', 'idea');
      expect(project.slug).toBe('my-project-2');
    });

    it('deduplicates with higher numbers when needed', () => {
      const service = createService();

      mockedReaddirSync.mockReturnValue([
        mockDirent('my-project'),
        mockDirent('my-project-2'),
        mockDirent('my-project-3'),
      ] as any);

      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return false;
        if (path.endsWith('.bak')) return false;
        if (path.endsWith('tasks.json')) return false;
        return true;
      });

      const project = service.createProject('My Project', 'idea');
      expect(project.slug).toBe('my-project-4');
    });
  });

  // -----------------------------------------------------------------------
  // 34. atomicWriteFile cleans up temp on failure
  // -----------------------------------------------------------------------
  describe('atomicWriteFile (via saveConfig)', () => {
    it('cleans up temp file on rename failure', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(true);
      mockedRenameSync.mockImplementation(() => {
        throw new Error('rename failed');
      });

      expect(() => {
        service.saveConfig({ developmentPath: '/test', theme: 'light' });
      }).toThrow('rename failed');

      // Should attempt to clean up the temp file
      expect(mockedUnlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp.'),
      );
    });

    it('handles cleanup failure gracefully on rename failure', () => {
      const service = createService();

      mockedExistsSync.mockReturnValue(true);
      mockedRenameSync.mockImplementation(() => {
        throw new Error('rename failed');
      });
      mockedUnlinkSync.mockImplementation(() => {
        throw new Error('unlink failed');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        service.saveConfig({ developmentPath: '/test', theme: 'light' });
      }).toThrow('rename failed');

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // 35. safeJsonParse returns null on both main and backup failure
  // -----------------------------------------------------------------------
  describe('safeJsonParse (via getTasks with corrupt data)', () => {
    it('returns empty array (null fallback) when both main and backup JSON are corrupt', () => {
      const service = createService();

      // tasks file exists
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('tasks.json')) return true;
        if (path.endsWith('tasks.json.bak')) return true;
        return true;
      });

      // Both main file and backup are corrupt
      mockedReadFileSync.mockReturnValue('NOT VALID JSON AT ALL');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const tasks = service.getTasks('my-project');

      // safeJsonParse returns null, getTasks returns tasks ?? [] which is []
      expect(tasks).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('returns null from getProject when both main and backup are corrupt', () => {
      const service = createService();

      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('meta.json')) return true;
        if (path.endsWith('meta.json.bak')) return true;
        return true;
      });

      mockedReadFileSync.mockReturnValue('CORRUPT DATA');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = service.getProject('my-project');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // WINDOWS_RESERVED_NAMES static property
  // -----------------------------------------------------------------------
  describe('WINDOWS_RESERVED_NAMES', () => {
    it('contains all expected reserved names', () => {
      // Access the static property - it's private but we can test via slug generation
      const service = createService();

      const reservedNames = [
        'con', 'prn', 'aux', 'nul',
        'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
        'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
      ];

      mockedReaddirSync.mockReturnValue([] as any);
      mockedExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('config.json')) return false;
        if (path.endsWith('.bak')) return false;
        if (path.endsWith('tasks.json')) return false;
        return true;
      });

      for (const name of reservedNames) {
        vi.resetAllMocks();
        mockedExistsSync.mockImplementation((p: unknown) => {
          const path = String(p);
          if (path.endsWith('config.json')) return false;
          if (path.endsWith('.bak')) return false;
          if (path.endsWith('tasks.json')) return false;
          return true;
        });
        mockedReaddirSync.mockReturnValue([] as any);
        mockedHomedir.mockReturnValue('/mock-home');
        vi.spyOn(Date, 'now').mockReturnValue(1234567890);

        const project = service.createProject(name.toUpperCase(), 'idea');
        expect(project.slug).toBe(`${name}-project`);
      }
    });
  });
});
