const fs = require('fs');
const { createTempDir } = require('broccoli-test-helper');
const { factory, runTasks } = require('release-it/test/util');
const Plugin = require('../index');

const namespace = 'release-it-yarn-workspaces';

class TestPlugin extends Plugin {
  constructor() {
    super(...arguments);

    this.responses = {};

    this.commands = [];
    this.shell.execFormattedCommand = async (command, options) => {
      this.commands.push([command, options]);
      if (this.responses[command]) {
        return Promise.resolve(this.responses[command]);
      }
    };
  }
}

function buildPlugin(config = {}, _Plugin = TestPlugin) {
  const options = { [namespace]: config };
  const plugin = factory(_Plugin, { namespace, options });

  return plugin;
}

function json(obj) {
  return JSON.stringify(obj, null, 2);
}

describe('release-it-yarn-workspaces', () => {
  let ROOT = process.cwd();
  let dir;

  function setupProject(workspaces) {
    dir.write({
      'package.json': json({
        name: 'root',
        version: '0.0.0',
        license: 'MIT',
        private: true,
        workspaces,
      }),
    });
  }

  function setupWorkspace(_pkg) {
    let pkg = Object.assign(
      {
        version: '0.0.0',
        license: 'MIT',
      },
      _pkg
    );
    let name = pkg.name;

    dir.write({
      packages: {
        [name]: {
          'package.json': json(pkg),
        },
      },
    });
  }

  beforeEach(async () => {
    dir = await createTempDir();

    process.chdir(dir.path());
  });

  afterEach(async () => {
    process.chdir(ROOT);

    await dir.dispose();
  });

  it('works', async () => {
    setupProject(['packages/*']);
    setupWorkspace({ name: 'foo' });
    setupWorkspace({ name: 'bar' });

    let plugin = buildPlugin();

    await runTasks(plugin);

    expect(plugin.commands).toMatchInlineSnapshot(`
      Array [
        Array [
          "npm version 0.0.1 --no-git-tag-version",
          Object {},
        ],
        Array [
          "npm version 0.0.1 --no-git-tag-version",
          Object {},
        ],
      ]
    `);
  });

  describe('getWorkspaceDirs', () => {
    it('can find workspaces specified as an array', async () => {
      setupProject(['packages/*']);

      setupWorkspace({ name: 'foo' });
      setupWorkspace({ name: 'bar' });

      let plugin = buildPlugin();

      let workspaces = await plugin.getWorkspaceDirs();

      expect(workspaces).toEqual([
        fs.realpathSync(dir.path('packages/bar')),
        fs.realpathSync(dir.path('packages/foo')),
      ]);
    });

    it('can find workspaces specified as an object', async () => {
      setupProject({ packages: ['packages/*'] });

      setupWorkspace({ name: 'foo' });
      setupWorkspace({ name: 'bar' });

      let plugin = buildPlugin();

      let workspaces = await plugin.getWorkspaceDirs();

      expect(workspaces).toEqual([
        fs.realpathSync(dir.path('packages/bar')),
        fs.realpathSync(dir.path('packages/foo')),
      ]);
    });
  });
});
