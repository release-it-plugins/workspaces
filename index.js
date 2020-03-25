const path = require('path');
const walkSync = require('walk-sync');
const { hasAccess, rejectAfter } = require('release-it/lib/util');
const { npmTimeoutError, npmAuthError } = require('release-it/lib/errors');
const prompts = require('release-it/lib/plugin/npm/prompts');
const UpstreamPlugin = require('release-it/lib/plugin/npm/npm');

const options = { write: false };

const ROOT_MANIFEST_PATH = './package.json';
const REGISTRY_TIMEOUT = 10000;
const DEFAULT_TAG = 'latest';

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

module.exports = class YarnWorkspacesPlugin extends UpstreamPlugin {
  static isEnabled(options) {
    return hasAccess(ROOT_MANIFEST_PATH) && options !== false;
  }

  constructor(...args) {
    super(...args);
    this.registerPrompts(prompts);

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
  }

  async init() {
    // intentionally not calling super.init here:
    //
    // * avoid the `getLatestRegistryVersion` check

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

  async bump(version) {
    // intentionally not calling super.bump here

    const task = () => {
      return this.eachWorkspace(() => {
        return this.exec(`npm version ${version} --no-git-tag-version`).catch(err => {
          if (/version not changed/i.test(err)) {
            this.log.warn(`Did not update version in package.json, etc. (already at ${version}).`);
          }
        });
      });
    };

    const tag = this.options.tag || (await this.resolveTag(version));
    this.setContext({ version, tag });
    return this.spinner.show({ task, label: 'npm version' });
  }

  async publish({ otp = this.options.otp, otpCallback } = {}) {
    // intentionally not calling super.publish here

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

    return this.eachWorkspace(async () => {
      try {
        await this.exec(
          `npm publish ${publishPath} --tag ${tag} ${accessArg} ${otpArg} ${dryRunArg}`,
          { options }
        );

        this.isReleased = true;
      } catch (err) {
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
      }
    });
  }

  eachWorkspace(action) {
    return Promise.all(
      this.getWorkspaceDirs().map(async workspaceDir => {
        try {
          process.chdir(workspaceDir);
          return await action();
        } finally {
          process.chdir(this.getContext('root'));
        }
      })
    );
  }

  getWorkspaceDirs() {
    let root = this.getContext('root');
    let workspaces = this.getContext('workspaces');

    let packageJSONFiles = walkSync(root, {
      includeBasePath: true,
      globs: workspaces.map(glob => `${glob}/package.json`),
    });

    return packageJSONFiles.map(file => path.dirname(file));
  }
};
