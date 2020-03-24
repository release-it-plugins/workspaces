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

  beforeEach(async () => {
    dir = await createTempDir();

    process.chdir(dir.path());
  });

  afterEach(async () => {
    process.chdir(ROOT);
    await dir.dispose();
  });

  it('it executes commands with defaults', async () => {
    let plugin = buildPlugin();

    dir.write({
      'package.json': json({
        name: 'root',
        version: '0.0.0',
        license: 'MIT',
        private: true,
        workspaces: ['packages/*'],
      }),
      packages: {
        foo: {
          'package.json': json({
            name: 'foo',
            version: '0.0.0',
            license: 'MIT',
          }),
        },
        bar: {
          'package.json': json({
            name: 'bar',
            version: '0.0.0',
            license: 'MIT',
          }),
        },
      },
    });

    await runTasks(plugin);

    expect(plugin.commands).toMatchSnapshot();
  });
});
