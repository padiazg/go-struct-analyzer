use zed_extension_api as zed;

struct GsaLspExtension;

impl zed::Extension for GsaLspExtension {
    fn new() -> Self {
        GsaLspExtension
    }

    fn language_server_command(
        &mut self,
        _id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let path = worktree
            .which("gsa-lsp")
            .ok_or_else(|| "gsa-lsp binary not found in PATH. Install it with `go install github.com/padiazg/go-struct-analyzer/lsp/cmd/gsa-lsp@latest` or download from https://github.com/padiazg/go-struct-analyzer/releases".to_string())?;

        Ok(zed::Command {
            command: path,
            args: vec![],
            env: Default::default(),
        })
    }
}

zed::register_extension!(GsaLspExtension);
