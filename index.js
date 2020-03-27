const fs = require('fs');
const path = require('path');
const semver = require('semver');
const urlJoin = require('url-join');
const walkSync = require('walk-sync');
const { rejectAfter } = require('release-it/lib/util');
const { npmTimeoutError, npmAuthError } = require('release-it/lib/errors');
const { Plugin } = require('release-it');

const options = { write: false };

const ROOT_MANIFEST_PATH = './package.json';
const REGISTRY_TIMEOUT = 10000;
const DEFAULT_TAG = 'latest';
const NPM_BASE_URL = 'https://www.npmjs.com';
const NPM_DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function resolveWorkspaces(workspaces) {
  if (Array.isArray(workspaces)) {
    return workspaces;
  } else if (workspaces !== null && typeof workspaces === 'object') {
    return workspaces.packages;
  }

  throw new Error(
    "This package doesn't use yarn workspaces. (package.json doesn't contain a `workspaces` property)"
  );
}

function parseVersion(raw) {
  if (!raw) return { version: null, isPreRelease: false, preReleaseId: null };

  const version = semver.valid(raw) ? raw : semver.coerce(raw);
  const parsed = semver.parse(version);

  const isPreRelease = parsed.prerelease.length > 0;
  const preReleaseId = isPreRelease && isNaN(parsed.prerelease[0]) ? parsed.prerelease[0] : null;

  return {
    version,
    isPreRelease,
    preReleaseId,
  };
}

module.exports = class YarnWorkspacesPlugin extends Plugin {
  static isEnabled(options) {
    return fs.existsSync(ROOT_MANIFEST_PATH) && options !== false;
  }

  constructor(...args) {
    super(...args);

    this.registerPrompts({
      publish: {
        type: 'confirm',
        message: context => {
          const { tag, name } = context['release-it-yarn-workspaces'];

          return `Publish ${name}${tag === 'latest' ? '' : `@${tag}`} to npm?`;
        },
        default: true,
      },
      otp: {
        type: 'input',
        message: () => `Please enter OTP for npm:`,
      },
    });

    const { publishConfig, workspaces } = require(path.resolve(ROOT_MANIFEST_PATH));

    this.setContext({
      publishConfig,
      workspaces: resolveWorkspaces(workspaces),
      root: process.cwd(),
    });
  }

  async init() {
    if (this.options.skipChecks) return;

    const validations = Promise.all([this.isRegistryUp(), this.isAuthenticated()]);

    await Promise.race([validations, rejectAfter(REGISTRY_TIMEOUT)]);

    const [isRegistryUp, isAuthenticated] = await validations;

    if (!isRegistryUp) {
      throw new npmTimeoutError(REGISTRY_TIMEOUT);
    }

    if (!isAuthenticated) {
      throw new npmAuthError();
    }
  }

  beforeBump() {
    // TODO: implement printing of workspaces found
  }

  async bump(version) {
    let { distTag } = this.options;

    if (!distTag) {
      const { isPreRelease, preReleaseId } = parseVersion(version);
      distTag = this.options.distTag || isPreRelease ? preReleaseId : DEFAULT_TAG;
    }

    this.setContext({ distTag });

    const task = () => {
      return this.eachWorkspace(async () => {
        try {
          return this.exec(`npm version ${version} --no-git-tag-version`);
        } catch (err) {
          if (/version not changed/i.test(err)) {
            this.log.warn(`Did not update version in package.json, etc. (already at ${version}).`);
          } else {
            throw err;
          }
        }
      });
    };

    return this.spinner.show({ task, label: 'npm version' });
  }

  async release() {
    if (this.options.publish === false) return;

    const tag = this.getContext('distTag');
    const otpCallback = this.global.isCI ? null : task => this.step({ prompt: 'otp', task });
    const task = async () => {
      await this.eachWorkspace(async workspaceInfo => {
        await this.publish({ tag, workspaceInfo, otpCallback });
      });
    };

    await this.step({ task, label: 'npm publish', prompt: 'publish' });
  }

  async isRegistryUp() {
    const registry = this.getRegistry();

    try {
      await this.exec(`npm ping --registry ${registry}`);

      return true;
    } catch (error) {
      if (/code E40[04]|404.*(ping not found|No content for path)/.test(error)) {
        this.log.warn('Ignoring unsupported `npm ping` command response.');
        return true;
      }
      return false;
    }
  }

  async isAuthenticated() {
    const registry = this.getRegistry();

    try {
      await this.exec(`npm whoami --registry ${registry}`);
      return true;
    } catch (error) {
      this.debug(error);

      if (/code E40[04]/.test(error)) {
        this.log.warn('Ignoring unsupported `npm whoami` command response.');
        return true;
      }

      return false;
    }
  }

  getReleaseUrl() {
    const registry = this.getRegistry();
    const baseUrl = registry !== NPM_DEFAULT_REGISTRY ? registry : NPM_BASE_URL;
    return urlJoin(baseUrl, 'package', this.getName());
  }

  getRegistry() {
    return this.getContext('publishConfig.registry') || NPM_DEFAULT_REGISTRY;
  }

  async publish({ tag, workspaceInfo, otp, otpCallback } = {}) {
    const otpArg = otp ? `--otp ${otp}` : '';
    const dryRunArg = this.global.isDryRun ? '--dry-run' : '';

    if (workspaceInfo.isPrivate) {
      this.log.warn(`${workspaceInfo.name}: Skip publish (package is private)`);
      return;
    }

    try {
      await this.exec(`npm publish . --tag ${tag} ${otpArg} ${dryRunArg}`, {
        options,
      });

      workspaceInfo.isReleased = true;
    } catch (err) {
      this.debug(err);
      if (/one-time pass/.test(err)) {
        if (otp != null) {
          this.log.warn('The provided OTP is incorrect or has expired.');
        }
        if (otpCallback) {
          return otpCallback(otp => this.publish({ workspaceInfo, tag, otp, otpCallback }));
        }
      }
      throw err;
    }
  }

  eachWorkspace(action) {
    return Promise.all(
      this.getWorkspaces().map(async workspaceInfo => {
        try {
          process.chdir(workspaceInfo.root);
          return await action(workspaceInfo);
        } finally {
          process.chdir(this.getContext('root'));
        }
      })
    );
  }

  getWorkspaces() {
    let root = this.getContext('root');
    let workspaces = this.getContext('workspaces');

    let packageJSONFiles = walkSync('.', {
      globs: workspaces.map(glob => `${glob}/package.json`),
    });

    return packageJSONFiles.map(file => {
      let pkg = JSON.parse(fs.readFileSync(file, { encoding: 'utf8' }));

      let relativeRoot = path.dirname(file);

      return {
        root: path.join(root, relativeRoot),
        relativeRoot,
        name: pkg.name,
        isPrivate: !!pkg.private,
        isReleased: false,
      };
    });
  }
};
