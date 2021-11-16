# Change Log

## 0.2.0

- Add `executableArguments` launch option (PR: [#21](https://github.com/godotengine/godot-csharp-vscode/pull/21))
- Assets and configuration providers (PR: [#22](https://github.com/godotengine/godot-csharp-vscode/pull/22))
  - Generate `tasks.json` and `preLaunchTask` for `launch.json`
  - Attempt to find Godot executable path for configuring `tasks.json` and `launch.json`
  - Add snippets for `launch.json` configurations
  - Fix launch and debug configurations not working due to `package.json` using a deprecated property
- Add debug configuration to launch a specified scene (PR: [#24](https://github.com/godotengine/godot-csharp-vscode/pull/24))
- Add support for different Godot project locations in workspace (PR: [#28](https://github.com/godotengine/godot-csharp-vscode/pull/28))
- Bump minimum required version of VS Code to v1.62

Many thanks to @raulsntos and @olestourko

## 0.1.3

- Fixed communication with the Godot editor not working on Windows

## 0.1.2

- Fixed missing dependencies

## 0.1.1

- Added extension icon

## 0.1.0

- Initial release
