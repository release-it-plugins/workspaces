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

    this.operations = [];
    this.commands = [];
    this.prompts = [];
    this.logs = [];
  }
}

function buildPlugin(config = {}, _Plugin = TestPlugin) {
  const container = {};
  const commandResponses = {};
  const promptResponses = {};

  const options = { [namespace]: config };
  const plugin = factory(_Plugin, { container, namespace, options });

  plugin.log.log = (...args) => {
    plugin.logs.push(args);

    plugin.operations.push({
      operationType: 'log',
      messages: args,
    });
  };

  plugin.commandResponses = commandResponses;
  plugin.promptResponses = promptResponses;

  // when in CI mode (all tests are ran in CI mode) `Plugin.prototype.step`
  // goes through `spinner.show` (in normal mode it goes through `prompt.show`)
  plugin.spinner.show = (options) => {
    let relativeRoot = path.relative(plugin.context.root, process.cwd());
    let response = promptResponses[relativeRoot] && promptResponses[relativeRoot][options.prompt];

    if (options.prompt) {
      let prompt = plugin.prompt.prompts[plugin.namespace][options.prompt];

      // uses the same prompting logic from release-it itself:
      //
      // https://github.com/release-it/release-it/blob/13.5.0/lib/prompt.js#L19-L24
      const promptDetails = Object.assign({}, prompt, {
        operationType: 'prompt',
        name: options.prompt,
        message: prompt.message(options.context),
        choices: 'choices' in prompt && prompt.choices(options.context),
        transformer: 'transformer' in prompt && prompt.transformer(options.context),
      });

      plugin.prompts.push(promptDetails);
    }

    if (Array.isArray(response)) {
      response = response.shift();
    }

    if (options.enabled !== false) {
      return options.task(response);
    }
  };

  // this works around a fairly fundamental issue in release-it's testing
  // harness which is that the ShellStub that is used specifically noop's when
  // the command being invoked is `/^(npm (ping|publish|show|whoami)|git fetch)/.test(command)`
  //
  // we work around the same relative issue by storing the commands executed,
  // and intercepting them to return replacement values (this is done in
  // execFormattedCommand just below)
  container.shell.exec = Shell.prototype.exec;
  container.shell.execFormattedCommand = async (command, options) => {
    let relativeRoot = path.relative(plugin.context.root, process.cwd());

    const operation = {
      operationType: 'command',
      relativeRoot,
      command,
      options,
    };

    plugin.commands.push(operation);
    plugin.operations.push(operation);

    let response = commandResponses[relativeRoot] && commandResponses[relativeRoot][command];

    if (response) {
      if (Array.isArray(response)) {
        response = response.shift();
      }

      if (typeof response === 'string') {
        return Promise.resolve(response);
      } else if (typeof response === 'object' && response !== null && response.reject === true) {
        return Promise.reject(new Error(response.value));
      }
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

    let hasScope = pkg.name.startsWith('@');
    if (hasScope) {
      let [scope, name] = pkg.name.split('/');

      dir.write({
        packages: {
          [scope]: {
            [name]: {
              'package.json': json(pkg),
            },
          },
        },
      });
    } else {
      dir.write({
        packages: {
          [pkg.name]: {
            'package.json': json(pkg),
          },
        },
      });
    }
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
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
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

      expect(plugin.prompts).toMatchInlineSnapshot(`
        Array [
          Object {
            "choices": false,
            "default": true,
            "message": "Preparing to publish:
            bar
            foo
          Publish to npm:",
            "name": "publish",
            "operationType": "prompt",
            "transformer": false,
            "type": "confirm",
          },
        ]
      `);

      expect(readWorkspacePackage('bar').version).toEqual('1.0.1');
      expect(readWorkspacePackage('foo').version).toEqual('1.0.1');
    });

    it('updates dependencies / devDependencies of packages', async () => {
      setupWorkspace({ name: 'derp' });
      setupWorkspace({ name: 'qux' });

      setupWorkspace({
        name: 'baz',

        dependencies: {
          foo: '^1.0.0',
        },
        devDependencies: {
          bar: '~1.0.0',
        },
        optionalDependencies: {
          qux: '1.0.0',
        },
        peerDependencies: {
          derp: '^1.0.0',
        },
      });

      let plugin = buildPlugin();

      await runTasks(plugin);

      let pkg = JSON.parse(dir.readText('packages/baz/package.json'));

      expect(pkg).toEqual({
        name: 'baz',
        license: 'MIT',
        version: '1.0.1',

        dependencies: {
          foo: '^1.0.1',
        },
        devDependencies: {
          bar: '~1.0.1',
        },
        optionalDependencies: {
          qux: '1.0.1',
        },
        peerDependencies: {
          derp: '^1.0.1',
        },
      });
    });

    it('prompts to ask if the package should be public when private package publishing fails', async () => {
      setupProject(['packages/@scope-name/*']);
      setupWorkspace({ name: '@scope-name/bar' });
      setupWorkspace({ name: '@scope-name/foo' });

      let plugin = buildPlugin();

      plugin.commandResponses['packages/@scope-name/bar'] = {
        'npm publish . --tag latest': [
          {
            reject: true,
            value:
              'Payment Required - PUT https://registry.npmjs.org/@scope-name/bar - You must sign up for private packages',
          },
        ],
      };

      plugin.promptResponses['packages/@scope-name/bar'] = {
        'publish-as-public': true,
      };

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/@scope-name/bar",
          },
          Object {
            "command": "npm publish . --tag latest --access public",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/@scope-name/bar",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/@scope-name/foo",
          },
        ]
      `);

      expect(plugin.prompts).toMatchInlineSnapshot(`
        Array [
          Object {
            "choices": false,
            "default": true,
            "message": "Preparing to publish:
            @scope-name/bar
            @scope-name/foo
          Publish to npm:",
            "name": "publish",
            "operationType": "prompt",
            "transformer": false,
            "type": "confirm",
          },
          Object {
            "choices": false,
            "message": "Publishing @scope-name/bar failed because \`publishConfig.access\` is not set in its \`package.json\`.
          Would you like to publish @scope-name/bar as a public package?",
            "name": "publish-as-public",
            "operationType": "prompt",
            "transformer": false,
            "type": "confirm",
          },
        ]
      `);
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
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "dist/packages/qux",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
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

      expect(plugin.prompts).toMatchInlineSnapshot(`
        Array [
          Object {
            "choices": false,
            "default": true,
            "message": "Preparing to publish:
            qux
            zorp
          Publish to npm:",
            "name": "publish",
            "operationType": "prompt",
            "transformer": false,
            "type": "confirm",
          },
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
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag foo",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag foo",
            "operationType": "command",
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
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
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
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag beta",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag beta",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);
    });

    it('when publishing rejects requiring a one time password', async () => {
      let plugin = buildPlugin();

      plugin.commandResponses['packages/bar'] = {
        'npm publish . --tag latest': [
          {
            reject: true,
            value: 'This operation requires a one-time password',
          },
        ],
      };

      plugin.promptResponses['packages/bar'] = {
        otp: '123456',
      };

      await runTasks(plugin);

      expect(plugin.commands).toMatchInlineSnapshot(`
        Array [
          Object {
            "command": "npm ping --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm whoami --registry https://registry.npmjs.org",
            "operationType": "command",
            "options": Object {},
            "relativeRoot": "",
          },
          Object {
            "command": "npm publish . --tag latest",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest --otp 123456",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/bar",
          },
          Object {
            "command": "npm publish . --tag latest --otp 123456",
            "operationType": "command",
            "options": Object {
              "write": false,
            },
            "relativeRoot": "packages/foo",
          },
        ]
      `);

      expect(plugin.prompts).toMatchInlineSnapshot(`
        Array [
          Object {
            "choices": false,
            "default": true,
            "message": "Preparing to publish:
            bar
            foo
          Publish to npm:",
            "name": "publish",
            "operationType": "prompt",
            "transformer": false,
            "type": "confirm",
          },
          Object {
            "choices": false,
            "message": "Please enter OTP for npm:",
            "name": "otp",
            "operationType": "prompt",
            "transformer": false,
            "type": "input",
          },
        ]
      `);
    });
  });

  describe('format publish output', () => {
    it('correctly formats publish message for all packages', () => {
      setupProject(['packages/*']);

      let plugin = buildPlugin();

      expect(plugin._formatPublishMessage('latest', ['@foo/bar', '@foo/baz', '@foo/blarg']))
        .toMatchInlineSnapshot(`
        "Preparing to publish:
            @foo/bar
            @foo/baz
            @foo/blarg
          Publish to npm:"
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
