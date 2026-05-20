# Alias retrocompatible: detiene todos los servidores de desarrollo del monorepo.
Set-StrictMode -Version Latest
$here = $PSScriptRoot
& "$here\stop-all-dev-servers.ps1"
