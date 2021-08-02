const fs = require('fs');
const path = require('path');
const semver = require('semver');
const chalk = require('chalk');
const urlJoin = require('url-join');
const walkSync = require('walk-sync');
const { Plugin } = require('release-it');
const JSONFile = require('./json-file');
const { rejectAfter } = require('./utils');

const { green, red, redBright } = chalk;

require('validate-peer-dependencies')(__dirname);

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

function findAdditionalManifests(root, manifestPaths) {
  if (!Array.isArray(manifestPaths)) {
    return null;
  }

  let packageJSONFiles = walkSync('.', {
    globs: manifestPaths,
  });

  let manifests = packageJSONFiles.map((file) => {
    let absolutePath = path.join(root, file);
    let pkgInfo = JSONFile.for(absolutePath);

    let relativeRoot = path.dirname(file);

    return {
      root: path.join(root, relativeRoot),
      relativeRoot,
      pkgInfo,
    };
  });

  return manifests;
}

const versionTransformer = (context) => (input) =>
  semver.valid(input)
    ? semver.gt(input, context.latestVersion)
      ? green(input)
      : red(input)
    : redBright(input);

module.exports = class YarnWorkspacesPlugin extends Plugin {
  static isEnabled(options) {
    return fs.existsSync(ROOT_MANIFEST_PATH) && options !== false;
  }

  constructor(...args) {
    super(...args);

    this.registerPrompts({
      publish: {
        type: 'confirm',
        message: (context) => {
          const { distTag, packagesToPublish } = context['release-it-yarn-workspaces'];

          return this._formatPublishMessage(distTag, packagesToPublish);
        },
        default: true,
      },
      otp: {
        type: 'input',
        message: () => `Please enter OTP for npm:`,
      },
      'publish-as-public': {
        type: 'confirm',
        message(context) {
          const { currentPackage } = context['release-it-yarn-workspaces'];

          return `Publishing ${currentPackage.name} failed because \`publishConfig.access\` is not set in its \`package.json\`.\n  Would you like to publish ${currentPackage.name} as a public package?`;
        },
      },
      independentVersion: {
        type: 'input',
        message(context) {
          const { currentPackage } = context['release-it-yarn-workspaces'];
          return `Please enter a valid version for the independent ${currentPackage.name}, from ${currentPackage.pkgInfo.pkg.version}:`;
        },
        transformer: (context) => versionTransformer(context),
        validate: (input) =>
          !!semver.valid(input) || 'The version must follow the semver standard.',
      },
    });

    const { publishConfig, workspaces } = require(path.resolve(ROOT_MANIFEST_PATH));

    this.setContext({
      publishConfig,
      workspaces: this.options.workspaces || resolveWorkspaces(workspaces),
      root: process.cwd(),
    });
  }

  async init() {
    if (this.options.skipChecks) return;

    const validations = Promise.all([this.isRegistryUp(), this.isAuthenticated()]);

    await Promise.race([
      validations,
      rejectAfter(REGISTRY_TIMEOUT, new Error(`Timed out after ${REGISTRY_TIMEOUT}ms.`)),
    ]);

    const [isRegistryUp, isAuthenticated] = await validations;

    if (!isRegistryUp) {
      throw new Error(`Unable to reach npm registry (timed out after ${REGISTRY_TIMEOUT}ms).`);
    }

    if (!isAuthenticated) {
      throw new Error('Not authenticated with npm. Please `npm login` and try again.');
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
    const workspaces = this.getWorkspaces();
    const independentWorkspaceWithVersions = [];
    await this.eachWorkspace(async (workspaceInfo) => {
      const versionOfIndependentWorkspace = await this.promptIncrementVersion();
      independentWorkspaceWithVersions.push([
        workspaceInfo.name,
        { workspace: workspaceInfo, version: versionOfIndependentWorkspace },
      ]);
    }, this.getIndependentWorkspaces());

    const workspaceWithNewVersionsMap = new Map(
      workspaces
        .map((workspace) => [workspace.name, { workspace, version }])
        .concat(independentWorkspaceWithVersions)
    );

    const packagesToPublish = workspaces
      .filter((w) => !w.isPrivate)
      .map((workspace) => workspace.name);

    this.setContext({
      distTag,
      packagesToPublish,
    });

    const task = async () => {
      const { isDryRun } = this.config;

      const updateVersion = (pkgInfo, newVersion) => {
        let { pkg } = pkgInfo;
        let originalVersion = pkg.version;

        if (originalVersion === newVersion) {
          this.log.warn(`\tDid not update version (already at ${newVersion}).`);
        }

        this.log.exec(`\tversion: -> ${newVersion} (from ${originalVersion})`);

        if (!isDryRun) {
          pkg.version = newVersion;
        }
      };

      for (let {
        workspace: { relativeRoot, pkgInfo },
        version: newVersion,
      } of workspaceWithNewVersionsMap.values()) {
        this.log.exec(`Processing ${relativeRoot}/package.json:`);

        updateVersion(pkgInfo, newVersion);
        this._updateDependencies(pkgInfo, workspaceWithNewVersionsMap);

        if (!isDryRun) {
          pkgInfo.write();
        }
      }

      const additionalManifests = this.getAdditionalManifests();
      if (additionalManifests.dependencyUpdates) {
        additionalManifests.dependencyUpdates.forEach(({ relativeRoot, pkgInfo }) => {
          this.log.exec(
            `Processing additionManifest.dependencyUpdates for ${relativeRoot}/package.json:`
          );

          this._updateDependencies(pkgInfo, workspaceWithNewVersionsMap);

          if (!isDryRun) {
            pkgInfo.write();
          }
        });
      }

      if (additionalManifests.versionUpdates) {
        additionalManifests.versionUpdates.forEach(({ relativeRoot, pkgInfo }) => {
          this.log.exec(
            `Processing additionManifest.versionUpdates for ${relativeRoot}/package.json:`
          );
          updateVersion(pkgInfo, version);

          if (!isDryRun) {
            pkgInfo.write();
          }
        });
      }
    };

    return this.spinner.show({ task, label: 'npm version' });
  }

  async release() {
    if (this.options.publish === false) return;

    // creating a stable object that is shared across all package publishes
    // this ensures that we don't accidentally prompt multiple times (e.g. once
    // per package) due to loosing the otp value after each `this.publish` call
    const otp = {
      value: this.options.otp,
    };

    const tag = this.getContext('distTag');
    const task = async () => {
      await this.eachWorkspace(async (workspaceInfo) => {
        await this.publish({ tag, workspaceInfo, otp });
      });
    };

    await this.step({ task, label: 'npm publish', prompt: 'publish' });
  }

  async afterRelease() {
    let workspaces = this.getWorkspaces();

    workspaces.forEach((workspaceInfo) => {
      if (workspaceInfo.isReleased) {
        this.log.log(`🔗 ${this.getReleaseUrl(workspaceInfo)}`);
      }
    });
  }

  _buildReplacementDepencencyVersion(existingVersion, newVersion) {
    let firstChar = existingVersion[0];

    // preserve existing floating constraint
    if (['^', '~'].includes(firstChar)) {
      return `${firstChar}${newVersion}`;
    }

    return newVersion;
  }

  _updateDependencies(pkgInfo, workspaceWithNewVersionsMap) {
    const { isDryRun } = this.config;
    const { pkg } = pkgInfo;

    const updateDependencies = (dependencyType) => {
      let dependencies = pkg[dependencyType];

      if (dependencies) {
        for (let dependency in dependencies) {
          if (workspaceWithNewVersionsMap.has(dependency)) {
            const existingVersion = dependencies[dependency];
            const replacementVersion = this._buildReplacementDepencencyVersion(
              existingVersion,
              workspaceWithNewVersionsMap.get(dependency).version
            );

            this.log.exec(
              `\t${dependencyType}: \`${dependency}\` -> ${replacementVersion} (from ${existingVersion})`
            );

            if (!isDryRun) {
              dependencies[dependency] = replacementVersion;
            }
          }
        }
      }
    };

    updateDependencies('dependencies');
    updateDependencies('devDependencies');
    updateDependencies('optionalDependencies');
    updateDependencies('peerDependencies');
  }

  _formatPublishMessage(distTag, packageNames) {
    const messages = [
      'Preparing to publish:',
      ...packageNames.map((name) => `    ${name}${distTag === 'latest' ? '' : `@${distTag}`}`),
      '  Publish to npm:',
    ];

    return messages.join('\n');
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

  getReleaseUrl(workspaceInfo) {
    const registry = this.getRegistry();
    const baseUrl = registry !== NPM_DEFAULT_REGISTRY ? registry : NPM_BASE_URL;

    return urlJoin(baseUrl, 'package', workspaceInfo.name);
  }

  getRegistry() {
    return this.getContext('publishConfig.registry') || NPM_DEFAULT_REGISTRY;
  }

  async publish({ tag, workspaceInfo, otp, access } = {}) {
    const isScoped = workspaceInfo.name.startsWith('@');
    const otpArg = otp.value ? ` --otp ${otp.value}` : '';
    const accessArg = access ? ` --access ${access}` : '';
    const dryRunArg = this.config.isDryRun ? ' --dry-run' : '';

    if (workspaceInfo.isPrivate) {
      this.log.warn(`${workspaceInfo.name}: Skip publish (package is private)`);
      return;
    }

    try {
      await this.exec(
        `npm publish ./${workspaceInfo.relativeRoot} --tag ${tag}${accessArg}${otpArg}${dryRunArg}`,
        {
          options,
        }
      );

      workspaceInfo.isReleased = true;
    } catch (err) {
      this.debug(err);
      if (/one-time pass/.test(err)) {
        if (otp.value != null) {
          this.log.warn('The provided OTP is incorrect or has expired.');
        }

        await this.step({
          prompt: 'otp',
          task(newOtp) {
            otp.value = newOtp;
          },
        });

        return await this.publish({ tag, workspaceInfo, otp, access });
      } else if (isScoped && /private packages/.test(err)) {
        let publishAsPublic = false;

        await this.step({
          prompt: 'publish-as-public',
          task(value) {
            publishAsPublic = value;
          },
        });

        if (publishAsPublic) {
          return await this.publish({ tag, workspaceInfo, otp, access: 'public' });
        } else {
          this.log.warn(`${workspaceInfo.name} was not published.`);
        }
      }
      throw err;
    }
  }

  async eachWorkspace(action, workspaces = this.getWorkspaces()) {
    for (let workspaceInfo of workspaces) {
      try {
        this.setContext({
          currentPackage: workspaceInfo,
        });

        await action(workspaceInfo);
      } finally {
        this.setContext({
          currentPackage: null,
        });
      }
    }
  }

  getAdditionalManifests() {
    let root = this.getContext('root');
    let additionalManifestsConfig = this.getContext('additionalManifests');
    let additionalManifests = {
      dependencyUpdates: null,
      versionUpdates: null,
    };

    let versionUpdates = ['package.json'];

    if (additionalManifestsConfig) {
      additionalManifests.dependencyUpdates = findAdditionalManifests(
        root,
        additionalManifestsConfig.dependencyUpdates
      );

      if (additionalManifestsConfig.versionUpdates) {
        versionUpdates = additionalManifestsConfig.versionUpdates;
      }
    }

    additionalManifests.versionUpdates = findAdditionalManifests(root, versionUpdates);

    this._additionalManifests = additionalManifests;

    return this._additionalManifests;
  }

  getWorkspaces() {
    if (this._workspaces) {
      return this._workspaces;
    }

    let root = this.getContext('root');
    let workspaces = this.getContext('workspaces');

    let packageJSONFiles = walkSync('.', {
      globs: workspaces.map((glob) => `${glob}/package.json`),
    });

    this._workspaces = packageJSONFiles.map((file) => {
      let absolutePath = path.join(root, file);
      let pkgInfo = JSONFile.for(absolutePath);

      let relativeRoot = path.dirname(file);

      return {
        root: path.join(root, relativeRoot),
        relativeRoot,
        name: pkgInfo.pkg.name,
        isPrivate: !!pkgInfo.pkg.private,
        isReleased: false,
        pkgInfo,
      };
    });

    return this._workspaces;
  }

  getIndependentWorkspaces() {
    if (this._independentWorkspaces) {
      return this._independentWorkspaces;
    }

    let root = this.getContext('root');
    let { independentWorkspaces } = this.options;
    if (!independentWorkspaces) return [];
    let packageJSONFiles = walkSync('.', {
      globs: independentWorkspaces.map((glob) => `${glob}/package.json`),
    });

    return (this._independentWorkspaces = packageJSONFiles.map((file) => {
      let absolutePath = path.join(root, file);
      let pkgInfo = JSONFile.for(absolutePath);

      let relativeRoot = path.dirname(file);

      return {
        root: path.join(root, relativeRoot),
        relativeRoot,
        name: pkgInfo.pkg.name,
        isPrivate: !!pkgInfo.pkg.private,
        isReleased: false,
        pkgInfo,
      };
    }));
  }

  promptIncrementVersion() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'independentVersion',
        task: resolve,
      });
    });
  }
};
