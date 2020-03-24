# release-it-yarn-workspaces

This package is a [release-it](https://github.com/release-it/release-it) plugin
(using [`release-it`'s plugin
API](https://github.com/release-it/release-it/tree/master/docs/plugins)) that
reads `workspaces` configuration from your `package.json` and bumps each
individual package's version and publishes.

## Usage

Installation using your projects normal package manager, for example:

```
# npm
npm install --save-dev release-it-yarn-workspaces

# yarn add --dev release-it-yarn-workspaces
```

Once installed, configure `release-it` to use the plugin. 

Either via `package.json`:

```json
{
  "release-it": {
    "plugins": {
      "release-it-yarn-workspaces": {}
    }
  }
}
```

Or via `.release-it.json`:

```json
{
  "plugins": {
    "release-it-yarn-workspaces": {}
  }
}
```

## License

This project is licensed under the [MIT License](LICENSE.md).
