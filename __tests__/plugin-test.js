const fs = require('fs');
const path = require('path');
const { createTempDir } = require('broccoli-test-helper');
const { factory, runTasks } = require('release-it/test/util');
const Shell = require('release-it/lib/shell');
const Plugin = require('../index');

const namespace = 'release-it-yarn-workspaces';

class TestPlugin extends Plugin {
  constructor() {
    super(...arguments);

    this.commands = [];
    this.logs = [];
  }
}

function buildPlugin(config = {}, _Plugin = TestPlugin) {
  const container = {};
  const commandResponses = {};

  const options = { [namespace]: config };
  const plugin = factory(_Plugin, { container, namespace, options });

  plugin.log.log = (...args) => plugin.logs.push(args);

  plugin.commandResponses = commandResponses;

  // this works around a fairly fundamental issue in release-it's testing
  // harness which is that the ShellStub that is used specifically noop's when
  // the command being invoked is `/^(npm (ping|publish|show|whoami)|git fetch)/.test(command)`
  //
  // we work around the same relative issue by storing the commands executed,
  // and intercepting them to return replacement values (this is done in
  // execFormattedCommand just below)
  container.shell.exec = Shell.prototype.exec;

  plugin.shell.execFormattedCommand = async (command, options) => {
    let relativeRoot = path.relative(plugin.context.root, process.cwd());

    plugin.commands.push({
      relativeRoot,
      command,
      options,
    });

    if (commandResponses[command]) {
      return Promise.resolve(commandResponses[command]);
    }
  };

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

  function readWorkspacePackage(name) {
    let contents = dir.readText(`packages/${name}/package.json`);

    return JSON.parse(contents);
  }

  beforeEach(async () => {
    dir = await createTempDir();

    process.chdir(dir.path());
  });

  afterEach(async () => {
    process.chdir(ROOT);

    await dir.dispose();
  });

  describe('normal project setup', () => {
    beforeEach(() => {
      setupProject(['packages/*']);
      setupWorkspace({ name: 'foo' });
      setupWorkspace({ name: 'bar' });
    });

    it('works', async () => {
      let plugin = buildPlugin();

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);

      expect(plugin.logs).toMatchInlineSnapshot(`
        Array [
          Array [
            "🔗 https://www.npmjs.com/package/bar",
          ],
          Array [
            "🔗 https://www.npmjs.com/package/foo",
          ],
        ]
      `);

      expect(readWorkspacePackage('bar').version).toEqual('1.0.1');
      expect(readWorkspacePackage('foo').version).toEqual('1.0.1');
    });

    it('updates dependencies / devDependencies of packages', async () => {
      setupWorkspace({
        name: 'baz',

        dependencies: {
          'foo': '^1.0.0'
        },
        devDependencies: {
          'bar': '^1.0.0'
        }
      });

      let plugin = buildPlugin();

      await runTasks(plugin);

      let pkg = JSON.parse(dir.readText('packages/baz/package.json'));

      expect(pkg).toEqual({
        name: 'baz',
        version: '1.0.1',

        dependencies: {
          'foo': '^1.0.0'
        },
        devDependencies: {
          'bar': '^1.0.0'
        }
      });
    });

    it('can specify custom workspaces (overrides package.json settings)', async () => {
      function setupDistWorkspace(_pkg) {
        let pkg = Object.assign(
          {
            version: '0.0.0',
            license: 'MIT',
          },
          _pkg
        );
        let name = pkg.name;

        dir.write({
          dist: {
            packages: {
              [name]: {
                'package.json': json(pkg),
              },
            },
          },
        });
      }

      setupDistWorkspace({ name: 'qux' });
      setupDistWorkspace({ name: 'zorp' });

      let plugin = buildPlugin({ workspaces: ['dist/packages/*'] });

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "dist/packages/qux",
          },
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "dist/packages/zorp",
          },
        ]
      `);

      expect(plugin.logs).toMatchInlineSnapshot(`
        Array [
          Array [
            "🔗 https://www.npmjs.com/package/qux",
          ],
          Array [
            "🔗 https://www.npmjs.com/package/zorp",
          ],
        ]
      `);
    });

    it('uses specified distTag', async () => {
      let plugin = buildPlugin({ distTag: 'foo' });

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag foo  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag foo  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);
    });

    it('skips registry checks with skipChecks', async () => {
      let plugin = buildPlugin({ skipChecks: true });

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);
    });

    it('uses prerelease npm dist-tag', async () => {
      let plugin = buildPlugin();

      plugin.getIncrementedVersion = () => '1.0.0-beta.1';

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag beta  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag beta  ",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);
    });
  });

  describe('getWorkspaces', () => {
    function workspaceInfoFor(name) {
      let pkg = readWorkspacePackage(name);

      return {
        name,
        isReleased: false,
        isPrivate: !!pkg.private,
        root: fs.realpathSync(dir.path(`packages/${name}`)),
        relativeRoot: `packages/${name}`,
        pkgInfo: {
          indent: 2,
          lineEndings: '\n',
          trailingWhitespace: '',
          filename: fs.realpathSync(dir.path(`packages/${name}/package.json`)),
          pkg,
        },
      };
    }

    it('returns stable values', async () => {
      setupProject(['packages/*']);

      setupWorkspace({ name: 'bar' });
      setupWorkspace({ name: 'foo', private: true });

      let plugin = buildPlugin();

      let workspaces1 = await plugin.getWorkspaces();
      let workspaces2 = await plugin.getWorkspaces();

      expect(workspaces1).toStrictEqual(workspaces2);
    });

    it('detects private packages', async () => {
      setupProject(['packages/*']);

      setupWorkspace({ name: 'bar' });
      setupWorkspace({ name: 'foo', private: true });

      let plugin = buildPlugin();

      let workspaces = await plugin.getWorkspaces();

      expect(workspaces).toEqual([workspaceInfoFor('bar'), workspaceInfoFor('foo')]);
    });

    it('can find workspaces specified as an array', async () => {
      setupProject(['packages/*']);

      setupWorkspace({ name: 'foo' });
      setupWorkspace({ name: 'bar' });

      let plugin = buildPlugin();

      let workspaces = await plugin.getWorkspaces();

      expect(workspaces).toEqual([workspaceInfoFor('bar'), workspaceInfoFor('foo')]);
    });

    it('can find workspaces specified as an object', async () => {
      setupProject({ packages: ['packages/*'] });

      setupWorkspace({ name: 'foo' });
      setupWorkspace({ name: 'bar' });

      let plugin = buildPlugin();

      let workspaces = await plugin.getWorkspaces();

      expect(workspaces).toEqual([workspaceInfoFor('bar'), workspaceInfoFor('foo')]);
    });

    describe('JSONFile', () => {
      it('preserves custom indentation levels when mutating', async () => {
        setupProject({ packages: ['packages/*'] });

        dir.write({
          packages: {
            foo: {
              'package.json': JSON.stringify(
                {
                  name: 'foo',
                  version: '1.0.0',
                },
                null,
                5
              ),
            },
          },
        });

        let plugin = buildPlugin();

        let [fooWorkspaceInfo] = await plugin.getWorkspaces();

        fooWorkspaceInfo.pkgInfo.pkg.thing = true;
        fooWorkspaceInfo.pkgInfo.write();

        expect(dir.readText('packages/foo/package.json')).toMatchInlineSnapshot(`
          "{
               \\"name\\": \\"foo\\",
               \\"version\\": \\"1.0.0\\",
               \\"thing\\": true
          }"
        `);
      });

      it('preserves custom whitespace at end of file when mutating', async () => {
        setupProject({ packages: ['packages/*'] });

        dir.write({
          packages: {
            foo: {
              'package.json':
                JSON.stringify(
                  {
                    name: 'foo',
                    version: '1.0.0',
                  },
                  null,
                  2
                ) + '\n',
            },
          },
        });

        let plugin = buildPlugin();

        let [fooWorkspaceInfo] = await plugin.getWorkspaces();

        fooWorkspaceInfo.pkgInfo.pkg.thing = true;
        fooWorkspaceInfo.pkgInfo.write();

        expect(dir.readText('packages/foo/package.json')).toMatchInlineSnapshot(`
          "{
            \\"name\\": \\"foo\\",
            \\"version\\": \\"1.0.0\\",
            \\"thing\\": true
          }
          "
        `);
      });
    });
  });
});
