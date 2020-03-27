# release-it-yarn-workspaces

This package is a [release-it](https://github.com/release-it/release-it) plugin
(using [`release-it`'s plugin
API](https://github.com/release-it/release-it/blob/master/docs/plugins.md)) that
releases each of your projects configured workspaces.

## How it works

In order to publish each of your projects workspaces, we first check the root
`package.json` to determine the locations of each of your workspaces (handling
both globbing and various formats for `workspaces`). Once we have identified
all of the workspaces, we bump the `package.json`s `version` field to the
selected version and publish the package (by changing into the package's root
folder and calling `npm publish`).

## Usage

Installation using your projects normal package manager, for example:

```sh
yarn add --dev --ignore-workspace-root-check release-it-yarn-workspaces
```

Once installed, configure `release-it` to use the plugin. 

For example, configuring via `package.json` would look like this:

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": true
    }
  }
}
```

Often times the root `package.json` for a workspace setup is commonly not
published, in order to configure `release-it` to avoid attempting to publish
the top level package (in addition to publishing your workspace packages), you
would add the following to your `release-it` config (again showing
`package.json` style configuration):

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": true
    },
    "npm": false
  }
}
```

## Configuration

For the most part `release-it-yarn-workspaces` "does the right thing", but
there are a few things that are configurable.

### skipChecks

By default, `release-it-yarn-workspaces` confirms that the `npm` registry is up
and running (via `npm ping`) and that you are authenticated properly (via `npm
whoami`). If you'd prefer to avoid these checks (e.g. your custom `npm`
registry does not support them) you can specify the `skipChecks` option:

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": {
        "skipChecks": true
      }
    }
  }
}
```

### publish

`release-it-yarn-workspaces` publishes to the `npm` registry.
However, some repository configurations prefer to commit + tag then let CI
publish the actual packages to the registry. This is where the `publish` option
comes in:

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": {
        "publish": false
      }
    }
  }
}
```

With this configuration, the `package.json` files in your workspaces would be
updated with the new version information but the packages would not be
published.

### distTag

`release-it-yarn-workspaces` uses the `latest` dist-tag when the
released version is a stable release and the prereleaseId when it is a
prerelease (e.g. `beta` for `1.0.0-beta.1`). This is a good default setup, but
there may be cases where you would like to specify a custom dist-tag to be
used.

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": {
        "distTag": "lts"
      }
    }
  }
}
```

### workspaces

The list of workspaces is gathered from the `package.json` in the current
working directory. This is the same location that `yarn install` uses, and it
is a great default for `release-it-yarn-workspaces`. In some circumstances, the
workspace settings that `yarn` should use differ from the actual locations that
are published.  Most commonly this is due to a custom build script that emits
the compiled and ready to publish packages into a different location (e.g.
`dist/packages/*`).

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": {
        "workspaces": ["dist/packages/*"]
      }
    }
  }
}
```

This value replaces the value from `package.json`, and given the above
configuration `release-it-yarn-workspaces` would publish each package (that was
not private) in `dist/packages` folder.

## License

This project is licensed under the [MIT License](LICENSE.md).
