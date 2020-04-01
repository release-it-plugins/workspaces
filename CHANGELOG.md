## v1.2.0 (2020-04-01)

#### :rocket: Enhancement
* [#26](https://github.com/rwjblue/release-it-yarn-workspaces/pull/26) Allow bumping versions in additional manifest files. ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#27](https://github.com/rwjblue/release-it-yarn-workspaces/pull/27) Avoid running CI for "pushes" on pull requests. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))


## v1.1.2 (2020-04-01)

#### :bug: Bug Fix
* [#25](https://github.com/rwjblue/release-it-yarn-workspaces/pull/25) Pass specific package paths to `npm publish` (avoid `process.chdir`). ([@rwjblue](https://github.com/rwjblue))
* [#24](https://github.com/rwjblue/release-it-yarn-workspaces/pull/24) Ensure new version is updated appropriately in dependencies. ([@rwjblue](https://github.com/rwjblue))
* [#22](https://github.com/rwjblue/release-it-yarn-workspaces/pull/22) Ensure prompts have access to required information. ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#23](https://github.com/rwjblue/release-it-yarn-workspaces/pull/23) Create unified set of plugin operations for test assertions. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))


## v1.1.1 (2020-03-31)

#### :bug: Bug Fix
* [#17](https://github.com/rwjblue/release-it-yarn-workspaces/pull/17) Do not list private packages in "should we publish" prompt. ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#18](https://github.com/rwjblue/release-it-yarn-workspaces/pull/18) Refactor local development flows. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))


## v1.1.0 (2020-03-30)

#### :rocket: Enhancement
* [#16](https://github.com/rwjblue/release-it-yarn-workspaces/pull/16) Prompt if publishing scoped package fails with private error. ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#15](https://github.com/rwjblue/release-it-yarn-workspaces/pull/15) Fix prettier setup. ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))


## v1.0.2 (2020-03-29)

#### :bug: Bug Fix
* [#13](https://github.com/rwjblue/release-it-yarn-workspaces/pull/13) Ensure OTP prompting works correctly ([@rwjblue](https://github.com/rwjblue))

#### Committers: 1
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))


## v1.0.1 (2020-03-27)

#### :bug: Bug Fix
* [#12](https://github.com/rwjblue/release-it-yarn-workspaces/pull/12) Ensure publish prompt is useful ([@scalvert](https://github.com/scalvert))

#### Committers: 1
- Steve Calvert ([@scalvert](https://github.com/scalvert))


## v1.0.0 (2020-03-27)

#### :rocket: Enhancement
* [#8](https://github.com/rwjblue/release-it-yarn-workspaces/pull/8) Refactor publishing process. ([@rwjblue](https://github.com/rwjblue))
* [#1](https://github.com/rwjblue/release-it-yarn-workspaces/pull/1) Basic implementation of `bump` and `publish` methods ([@scalvert](https://github.com/scalvert))

#### :bug: Bug Fix
* [#11](https://github.com/rwjblue/release-it-yarn-workspaces/pull/11) Ensure any cross package dependency versions are updated. ([@rwjblue](https://github.com/rwjblue))
* [#6](https://github.com/rwjblue/release-it-yarn-workspaces/pull/6) Leverage try/catch when bumping (to bubble unrelated errors) ([@rwjblue](https://github.com/rwjblue))
* [#2](https://github.com/rwjblue/release-it-yarn-workspaces/pull/2) Fix bug in `resolveWorkspaces`. ([@rwjblue](https://github.com/rwjblue))

#### :memo: Documentation
* [#9](https://github.com/rwjblue/release-it-yarn-workspaces/pull/9) Add configuration options to README.md. ([@rwjblue](https://github.com/rwjblue))
* [#5](https://github.com/rwjblue/release-it-yarn-workspaces/pull/5) Revamp / flesh out README.md. ([@rwjblue](https://github.com/rwjblue))

#### :house: Internal
* [#10](https://github.com/rwjblue/release-it-yarn-workspaces/pull/10) Update `package.json`s directly (avoid `npm version`) ([@rwjblue](https://github.com/rwjblue))
* [#7](https://github.com/rwjblue/release-it-yarn-workspaces/pull/7) Re-roll yarn.lock. ([@rwjblue](https://github.com/rwjblue))
* [#3](https://github.com/rwjblue/release-it-yarn-workspaces/pull/3) Update prettier related packages to prettier@2 ([@rwjblue](https://github.com/rwjblue))

#### Committers: 2
- Robert Jackson ([@rwjblue](https://github.com/rwjblue))
- Steve Calvert ([@scalvert](https://github.com/scalvert))


