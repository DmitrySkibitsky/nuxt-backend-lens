{
  # Optional development shell for Nix users (`nix develop`, or direnv with `use flake`).
  # Nothing here is required: CI and non-Nix setups use their own Node / pnpm / PHP.
  #
  # Provides the host-side tools of the workspace. Docker stays a system requirement
  # (on NixOS: virtualisation.docker.enable) — a flake cannot provide the daemon.
  description = "nuxt-backend-lens — development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs:
        let
          # Playwright's own Chromium builds do not run on NixOS; tests use this one instead
          # (playwright.config.ts reads PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH). Linux only in nixpkgs.
          chromium = pkgs.lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.chromium;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24 # ships corepack, which provides the pinned pnpm (package.json "packageManager")
              pkgs.php85 # host Composer for demo/bin/setup; same PHP as the backend image
              pkgs.php85Packages.composer
              pkgs.gnumake
              pkgs.ffmpeg
              pkgs.curl
              pkgs.git
            ] ++ chromium;

            shellHook = ''
              # pnpm through corepack, in a project-local writable dir (the Nix store is read-only).
              # nixpkgs' own pnpm lags behind the version the lockfile was written with.
              export COREPACK_HOME="$PWD/.corepack"
              export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
              mkdir -p "$COREPACK_HOME/bin"
              corepack enable --install-directory "$COREPACK_HOME/bin" pnpm
              export PATH="$COREPACK_HOME/bin:$PATH"

              ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
                export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
              ''}
              # A global LD_LIBRARY_PATH pointing at other glibc builds breaks Chromium.
              unset LD_LIBRARY_PATH
            '';
          };
        });
    };
}
