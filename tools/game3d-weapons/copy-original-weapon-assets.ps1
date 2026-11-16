# Copies the five authentic private source-repository weapon GLBs into the
# clone working tree after checking out both repositories locally.
# Requires PowerShell + Git, no hosted CI or GitHub runner.
# Example:
# pwsh ./tools/game3d-weapons/copy-original-weapon-assets.ps1 \
#   -SourceRepo C:/AXE/atom-x-eve-os -CloneRepo C:/AXE/gitsync-pro
# SourceRepo must be checked out at claude/weapon-combo-remote-swings.
# CloneRepo must be checked out at feature/clone-claude-weapon-combos-20261116.
param(
  [Parameter(Mandatory=$true)][string]$SourceRepo,
  [Parameter(Mandatory=$true)][string]$CloneRepo
)
$ErrorActionPreference = 'Stop'
$files = [ordered]@{
  'energy_sword.glb'  = '72addacc401fa1b035138c0631e54786a7671811'
  'fantasy_bow.glb'   = 'c09422124e4522cb1ddcf4476964b5240d1afea4'
  'fantasy_sword.glb' = 'a78753cff2714fc9eb50c6eb6fe6d1cf2eb682fc'
  'odachi.glb'        = '312a8c2c58998196e6df782e59eb1c63279ff2e5'
  'ornate_bow.glb'    = '39683ddb5e8e85baf9f17fd7b9bd67ba29401454'
}
$srcHead = (& git -C $SourceRepo rev-parse HEAD).Trim()
if ($srcHead -ne 'f16c034993c745e9f61e60a2cbaaee91a8047859') {
  throw "Source checkout must be the exact Claude weapon-combo commit; got $srcHead"
}
$dstBranch = (& git -C $CloneRepo branch --show-current).Trim()
if ($dstBranch -ne 'feature/clone-claude-weapon-combos-20261116') {
  throw "Clone must be on the integration feature branch, got $dstBranch"
}
$dir = Join-Path $CloneRepo 'public/game3d/weapons'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
foreach ($name in $files.Keys) {
  $original = Join-Path $SourceRepo "public/game3d/weapons/$name"
  $target = Join-Path $dir $name
  if (!(Test-Path $original)) { throw "Source asset missing: $original" }
  $oldHash = (& git -C $SourceRepo hash-object $original).Trim()
  if ($oldHash -ne $files[$name]) { throw "Source SHA mismatch: $name $oldHash" }
  Copy-Item -LiteralPath $original -Destination $target -Force
  $newHash = (& git -C $CloneRepo hash-object $target).Trim()
  if ($newHash -ne $files[$name]) { throw "Copied file corrupted: $name $newHash" }
  Write-Host "Verified original $name ($newHash)"
}
Write-Host "All five original GLBs verified in the clone working tree."
Write-Host "Review and commit these binary assets on the clone branch; do not commit placeholders."
