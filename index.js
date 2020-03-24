const path = require('path');
const walkSync = require('walk-sync');
const urlJoin = require('url-join');
const { Plugin } = require('release-it');
const { hasAccess, rejectAfter, parseVersion } = require('release-it/lib/util');
const { npmTimeoutError, npmAuthError } = require('release-it/lib/errors');
const prompts = require('release-it/lib/plugin/npm/prompts');

const options = { write: false };

const ROOT_MANIFEST_PATH = './package.json';
const REGISTRY_TIMEOUT = 10000;
const DEFAULT_TAG = 'latest';
const DEFAULT_TAG_PRERELEASE = 'next';
const NPM_BASE_URL = 'https://www.npmjs.com';
const NPM_DEFAULT_REGISTRY = 'https://registry.npmjs.org';

const noop = Promise.resolve();

function resolveWorkspaces(workspaces) {
  if (Array.isArray(workspaces)) {
    return workspaces;
  } else if (workspaces !== null && typeof workspaces === 'object') {
    return workspaces.workspaces;
  }

  throw new Error(
    "This package doesn't use yarn workspaces. (package.json doesn't contain a `workspaces` property)"
  );
}

module.exports = class YarnWorkspacesPlugin extends Plugin {
  static isEnabled(options) {
    return hasAccess(ROOT_MANIFEST_PATH) && options !== false;
  }

  constructor(...args) {
    super(...args);
    this.registerPrompts(prompts);
  }

  async init() {
    const {
      name,
      version: latestVersion,
      private: isPrivate,
      publishConfig,
      workspaces,
    } = require(path.resolve(ROOT_MANIFEST_PATH));
    this.setContext({
      name,
      latestVersion,
      private: isPrivate,
      publishConfig,
      workspaces: resolveWorkspaces(workspaces),
      root: process.cwd(),
    });

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

  isRegistryUp() {
    const registry = this.getRegistry();
    const registryArg = registry !== NPM_DEFAULT_REGISTRY ? ` --registry ${registry}` : '';
    return this.exec(`npm ping${registryArg}`).then(
      () => true,
      err => {
        if (/code E40[04]|404.*(ping not found|No content for path)/.test(err)) {
          this.log.warn('Ignoring unsupported `npm ping` command response.');
          return true;
        }
        return false;
      }
    );
  }

  isAuthenticated() {
    const registry = this.getRegistry();
    const registryArg = registry !== NPM_DEFAULT_REGISTRY ? ` --registry ${registry}` : '';
    return this.exec(`npm whoami${registryArg}`).then(
      () => true,
      err => {
        this.debug(err);
        if (/code E40[04]/.test(err)) {
          this.log.warn('Ignoring unsupported `npm whoami` command response.');
          return true;
        }
        return false;
      }
    );
  }

  getRegistryPreReleaseTags() {
    return this.exec(`npm view ${this.getName()} dist-tags --json`, { options }).then(
      output => {
        try {
          const tags = JSON.parse(output);
          return Object.keys(tags).filter(tag => tag !== DEFAULT_TAG);
        } catch (err) {
          this.debug(err);
          return [];
        }
      },
      () => []
    );
  }

  getReleaseUrl() {
    const registry = this.getRegistry();
    const baseUrl = registry !== NPM_DEFAULT_REGISTRY ? registry : NPM_BASE_URL;
    return urlJoin(baseUrl, 'package', this.getName());
  }

  getRegistry() {
    return this.getContext('publishConfig.registry') || NPM_DEFAULT_REGISTRY;
  }

  async guessPreReleaseTag() {
    const [tag] = await this.getRegistryPreReleaseTags();
    if (tag) {
      return tag;
    } else {
      this.log.warn(
        `Unable to get pre-release tag(s) from npm registry. Using "${DEFAULT_TAG_PRERELEASE}".`
      );
      return DEFAULT_TAG_PRERELEASE;
    }
  }

  async resolveTag(version) {
    const { tag } = this.options;
    const { isPreRelease, preReleaseId } = parseVersion(version);
    if (!isPreRelease) {
      return DEFAULT_TAG;
    } else {
      return tag || preReleaseId || (await this.guessPreReleaseTag());
    }
  }

  async bump(version) {
    const task = () => {
      Promise.all(
        this.eachWorkspace(() => {
          return this.exec(`npm version ${version} --no-git-tag-version`).catch(err => {
            if (/version not changed/i.test(err)) {
              this.log.warn(
                `Did not update version in package.json, etc. (already at ${version}).`
              );
            }
          });
        })
      );
    };

    const tag = this.options.tag || (await this.resolveTag(version));
    this.setContext({ version, tag });
    return this.spinner.show({ task, label: 'npm version' });
  }

  async publish({ otp = this.options.otp, otpCallback } = {}) {
    const { publishPath = '.', access } = this.options;
    const { name, private: isPrivate, tag = DEFAULT_TAG, isNewPackage } = this.getContext();
    const isScopedPkg = name.startsWith('@');
    const accessArg =
      isScopedPkg && (access || (isNewPackage && !isPrivate))
        ? `--access ${access || 'public'}`
        : '';
    const otpArg = otp ? `--otp ${otp}` : '';
    const dryRunArg = this.global.isDryRun ? '--dry-run' : '';
    if (isPrivate) {
      this.log.warn('Skip publish: package is private.');
      return noop;
    }

    return Promise.all(
      this.eachWorkspace(() => {
        return this.exec(
          `npm publish ${publishPath} --tag ${tag} ${accessArg} ${otpArg} ${dryRunArg}`,
          { options }
        )
          .then(() => {
            this.isReleased = true;
          })
          .catch(err => {
            this.debug(err);
            if (/one-time pass/.test(err)) {
              if (otp != null) {
                this.log.warn('The provided OTP is incorrect or has expired.');
              }
              if (otpCallback) {
                return otpCallback(otp => this.publish({ otp, otpCallback }));
              }
            }
            throw err;
          });
      })
    );
  }

  eachWorkspace(action) {
    return this.getWorkspaceDirs().map(workspace => {
      return new Promise(resolve => {
        process.chdir(path.dirname(workspace));

        return action().then(() => {
          process.chdir(this.getContext('root'));
          resolve();
        });
      });
    });
  }

  getWorkspaceDirs() {
    return walkSync('.', {
      globs: this.getContext('workspaces').map(glob => `${glob}/package.json`),
    }).map(workspace => path.resolve(this.getContext('root'), workspace));
  }
};
