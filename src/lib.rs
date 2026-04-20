use std::fs;
use zed_extension_api::{self as zed, LanguageServerId, Result};

const SERVER_JS: &str = include_str!("../server/out/server.js");
const PARSER_JS: &str = include_str!("../server/out/parser.js");
const ANALYZER_JS: &str = include_str!("../server/out/analyzer.js");

struct GoStructAnalyzerExtension {
    did_setup: bool,
}

impl GoStructAnalyzerExtension {
    fn setup_server(&self, language_server_id: &LanguageServerId) -> Result<()> {
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );

        // Write bundled JS files to the extension work directory
        for (name, content) in [
            ("server.js", SERVER_JS),
            ("parser.js", PARSER_JS),
            ("analyzer.js", ANALYZER_JS),
        ] {
            fs::write(name, content)
                .map_err(|e| format!("failed to write {name}: {e}"))?;
        }

        // Install npm dependencies that the server requires
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::Downloading,
        );

        for package in [
            "vscode-languageserver",
            "vscode-languageserver-textdocument",
        ] {
            let version = zed::npm_package_latest_version(package)?;
            if zed::npm_package_installed_version(package)?.as_deref() != Some(&version) {
                zed::npm_install_package(package, &version)?;
            }
        }

        Ok(())
    }
}

impl zed::Extension for GoStructAnalyzerExtension {
    fn new() -> Self {
        Self { did_setup: false }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if !self.did_setup {
            self.setup_server(language_server_id)?;
            self.did_setup = true;
        }

        let ext_dir = std::env::current_dir()
            .map_err(|e| format!("failed to get extension directory: {e}"))?;
        let server_path = ext_dir.join("server.js");

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                server_path.to_string_lossy().to_string(),
                "--stdio".to_string(),
            ],
            env: worktree.shell_env(),
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        let settings = zed::serde_json::json!({
            "goStructAnalyzer": {
                "architecture": worktree
                    .shell_env()
                    .iter()
                    .find(|(k, _)| k == "GOARCH")
                    .map(|(_, v)| v.as_str())
                    .unwrap_or("amd64"),
                "enableStructOptimizationWarnings": true,
                "enableReorderCodeAction": true,
                "enableGCPressureWarnings": true,
                "gcPressureSeverityWarning": false,
            }
        });
        Ok(Some(settings))
    }
}

zed::register_extension!(GoStructAnalyzerExtension);
