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

## License

This project is licensed under the [MIT License](LICENSE.md).
