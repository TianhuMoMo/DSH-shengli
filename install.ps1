<#
  鲸鱼娘生理拓展 · dsh-whale-utero 一键安装(Windows)

  用法:
    powershell -ExecutionPolicy Bypass -File .\install.ps1
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile web
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Spec "github:you/dsh-whale-utero"

  做的事:
    1. 定位 DSH 配置目录与 profile(默认 %USERPROFILE%\.dsh / desktop)
    2. 用 `dsh plugin --profile <p> add <spec>` 把包装进 profile(没装 dsh 就跳过)
    3. 把 dsh-whale-utero 补进 profile 的 dependencies 和 dsh.profile.bundles(改前留 .bak)
    4. 提示重启 DSH
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$DshHome = '',
  [string]$Spec = '',
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$PkgName = 'dsh-whale-utero'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [xx] $m" -ForegroundColor Red; exit 1 }

if (-not $DshHome) {
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
}
$profileDir = Join-Path $DshHome (Join-Path 'profiles' $Profile)
$pkgPath = Join-Path $profileDir 'package.json'

Step "DSH 配置目录:$DshHome"
Step "目标 profile:$profileDir"

if (-not (Test-Path -LiteralPath $pkgPath)) {
  Fail "找不到 $pkgPath —— 先用 DSH 启动一次 profile '$Profile',或用 -Profile 指定已有 profile(如 web)"
}

$depSpec = 'link:' + ($Here -replace '\\', '/')

# ---------- 1. 包安装 ----------
if (-not $Spec) { $Spec = $Here }
if ($SkipInstall) {
  Warn '已跳过依赖安装(-SkipInstall),只改 profile 的 JSON'
} else {
  $dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
  if ($dshCmd) {
    Step "dsh plugin --profile $Profile add `"$Spec`""
    try {
      & $dshCmd.Source plugin --profile $Profile add $Spec
      if ($LASTEXITCODE -eq 0) { Ok '依赖已由 dsh plugin 写入 profile' }
      else { Warn "dsh plugin 返回 $LASTEXITCODE,继续手动补 JSON" }
    } catch {
      Warn "dsh plugin 执行失败:$($_.Exception.Message)"
    }
  } else {
    Warn 'PATH 上没有 dsh,继续手动补 JSON'
  }
}

# ---------- 2. 补 JSON(正则插入,保留原文件格式) ----------
$utf8 = New-Object System.Text.UTF8Encoding($false)
$raw = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)
$original = $raw
$changed = $false

function Get-ObjectBody([string]$text, [int]$openIndex) {
  # 从 '[' 或 '{' 之后扫描到配对的 ']' / '}'
  $open = $text[$openIndex]
  $close = if ($open -eq '[') { ']' } else { '}' }
  $depth = 1
  $i = $openIndex + 1
  while ($i -lt $text.Length -and $depth -gt 0) {
    $ch = $text[$i]
    if ($ch -eq $open) { $depth++ }
    elseif ($ch -eq $close) { $depth-- }
    $i++
  }
  if ($depth -ne 0) { return $null }
  return @{ start = $openIndex + 1; end = $i - 1; text = $text.Substring($openIndex + 1, $i - 1 - ($openIndex + 1)) }
}

# dependencies
$depKey = '"' + $PkgName + '"'
if ($raw -match ($depKey + '\s*:')) {
  Ok 'dependencies 里已有本插件'
} else {
  $m = [regex]::Match($raw, '"dependencies"\s*:\s*\{')
  if (-not $m.Success) {
    Warn 'profile 里没有 dependencies 段,请在插件管理器里手动安装'
  } else {
    $braceIndex = $raw.IndexOf('{', $m.Index)
    $body = Get-ObjectBody $raw $braceIndex
    if ($null -eq $body) {
      Warn 'dependencies 结构解析失败,跳过'
    } else {
      $empty = [string]::IsNullOrWhiteSpace($body.text)
      $entry = if ($empty) { "`r`n    `"$PkgName`": `"$depSpec`"`r`n  " } else { "`r`n    `"$PkgName`": `"$depSpec`"," }
      $raw = $raw.Substring(0, $body.start) + $entry + $raw.Substring($body.start)
      $changed = $true
      Ok "dependencies += $PkgName ($depSpec)"
    }
  }
}

# dsh.profile.bundles
if (-not ($raw -match '"bundles"\s*:\s*\[')) {
  Warn 'profile 里没有 dsh.profile.bundles,装好后请在插件管理器里点一下启用'
} else {
  $m2 = [regex]::Match($raw, '"bundles"\s*:\s*\[')
  $open2 = $raw.IndexOf('[', $m2.Index)
  $body2 = Get-ObjectBody $raw $open2
  if ($null -eq $body2) {
    Warn 'bundles 结构解析失败,跳过'
  } elseif ($body2.text -match [regex]::Escape($depKey)) {
    Ok 'bundles 里已启用本插件'
  } else {
    $empty2 = [string]::IsNullOrWhiteSpace($body2.text)
    $entry2 = if ($empty2) { "`r`n        `"$PkgName`"`r`n      " } else { "`r`n        `"$PkgName`"," }
    $raw = $raw.Substring(0, $body2.start) + $entry2 + $raw.Substring($body2.start)
    $changed = $true
    Ok "dsh.profile.bundles += $PkgName"
  }
}

if ($changed) {
  $backup = $pkgPath + '.bak-dshwhale'
  Copy-Item -LiteralPath $pkgPath -Destination $backup -Force
  [System.IO.File]::WriteAllText($pkgPath, $raw, $utf8)
  try {
    $null = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Ok "已写入 package.json(备份:$backup)"
  } catch {
    Copy-Item -LiteralPath $backup -Destination $pkgPath -Force
    Fail "写入后 JSON 不合法,已回滚:$($_.Exception.Message)"
  }
} else {
  Ok 'package.json 无需修改'
}

# ---------- 3. 结束 ----------
Write-Host ''
Write-Host '安装完成。接下来:' -ForegroundColor Cyan
Write-Host '  1) 重启 DSH(全新插件第一次必须重启)'
Write-Host '  2) 页面刷新后,点侧边栏的鲸鱼娘图标'
Write-Host "  3) 状态文件会生成在:$Here\data\state.json"
Write-Host ''
Write-Host '卸载:插件管理器里禁用并移除,或从 package.json 删掉依赖与 bundles 项(有 .bak-dshwhale 备份)。' -ForegroundColor DarkGray
