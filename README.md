## Agentic OpenPLC fork

This experimental fork adds an agent chat panel that generates and edits IEC Structured Text (ST), creates POU variables, and updates a live ladder sketch beside the ST editor. Open an ST POU and click the AI Chat button to use it.

The ladder pane is a display-only prototype, not a native editable LD program or a verified ST-to-LD conversion. Its current parser handles a subset of assignments, comparisons, and IF conditions; OR branches and more complex control flow are not represented faithfully. ST remains the executable program. Agent edits are applied directly to the editor; review and compile the result before using it.

### Run the agent fork

Use Node.js 22 or 23 and npm 10 or newer:

```bash
npm install
export XAI_API_KEY='your-local-xai-key'
# Optional: select a model available to your xAI account.
export XAI_MODEL='your-model-id'
npm run dev
```

The current default model identifier is `grok-4.6`. `GROK_API_KEY` is also accepted. To keep the key in a local file, set `RUNG_API_KEY_FILE` to its path. A legacy local fallback reads `~/Desktop/AGENTIC_PLC/api_key.txt`. Credentials stay in the Electron main process; source, variable definitions, and chat messages are sent to xAI when you submit a request. Do not commit credentials.

# Open PLC Editor - IDE

![GitHub stars](https://img.shields.io/github/stars/Autonomy-Logic/openplc-editor?color=fa6470)
![GitHub issues](https://img.shields.io/github/issues/Autonomy-Logic/openplc-editor?color=d8b22d)

<p align="center">
<img alt="draft-cover" src="assets/images/github-background.png">
</p>

## Running a preview version

In order to run the development version, clone the repository, and install dependencies via `npm`, you need network access.

You'll need the following tools:

- [Git](https://git-scm.com/)
- [NodeJS](https://nodejs.org/en/download/), version `>=22 <24`

### Step by step

- Clone the repository locally and go to the project folder.

```bash
git clone https://github.com/Autonomy-Logic/openplc-editor.git

cd openplc-editor
```

- Install the dependencies

```bash
npm install
```

- Run the development script

```bash
npm run dev
```

### Running tests

```bash
npm run test         # Unit tests (Jest, with coverage)
npm run test:watch   # Unit tests in watch mode (no coverage)
npm run test:e2e     # End-to-end tests (Playwright, builds the app first)
```

## Releasing a New Version

The project uses GitHub Actions to automatically build and release new versions for all supported platforms (macOS, Windows, and Linux) in both x64 and ARM64 architectures.

### Creating a Release

To create a new release, simply create and push a new tag with the version number:

```bash
git tag v4.2.0
git push origin v4.2.0
```

This will automatically:

1. Build the application for all platforms (macOS, Windows, Linux) and architectures (x64, ARM64)
2. Sign and notarize the macOS builds
3. Create a GitHub Release with all artifacts attached
4. Generate release notes based on commits since the last release

### Version Naming

- Use semantic versioning: `vMAJOR.MINOR.PATCH` (e.g., `v4.2.0`)
- For pre-releases, add a suffix: `v4.2.0-beta`, `v4.2.0-alpha`, or `v4.2.0-rc1`
- Pre-release tags will be marked as pre-releases on GitHub

### Manual Workflow Trigger

You can also trigger the build workflow manually from the GitHub Actions tab without creating a release. This is useful for testing builds:

1. Go to Actions > Build and Release
2. Click "Run workflow"
3. Optionally specify a version number
4. Click "Run workflow"

Note: Manual triggers will build all artifacts but won't create a GitHub Release (releases are only created when pushing a tag).

## Documentation

Please go to the repository [wiki](https://github.com/Autonomy-Logic/openplc-editor/wiki) page to get instruction about the project.

## Project Management

Go to [project](https://github.com/orgs/Autonomy-Logic/projects/4) management page to see the current state of the project.

## Issues

Go to [issues](https://github.com/Autonomy-Logic/openplc-editor/issues) page to view the current state of issues in the project.
