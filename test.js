const tmp = require('tmp');
const test = require('ava');
const { factory, runTasks } = require('release-it/test/util');
const Plugin = require('./index');

tmp.setGracefulCleanup();

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

test('TODO: it invokes does stuff with external commands', async t => {
  let plugin = buildPlugin();

  await runTasks(plugin);

  t.deepEqual(plugin.commands, [
    [`npm publish blah --next-version=Unreleased --from=v1.0.0`, { write: true }],
  ]);
});
