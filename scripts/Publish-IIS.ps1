[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8085,

  [ValidateNotNullOrEmpty()]
  [string]$SiteName = "AI Racing Spectator",

  [ValidateNotNullOrEmpty()]
  [string]$InstallPath = "$env:SystemDrive\inetpub\AI-Racing-Spectator"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "`n>> $Message" -ForegroundColor Cyan
}

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-PublishingHost {
  if ($env:OS -ne "Windows_NT") {
    throw "A publicacao local no IIS requer Windows."
  }

  if ($PSVersionTable.PSVersion -lt [Version]"5.1") {
    throw "Windows PowerShell 5.1 ou superior e necessario."
  }

  foreach ($command in @("robocopy.exe", "icacls.exe", "msiexec.exe")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw "O pre-requisito do Windows '$command' nao foi encontrado."
    }
  }
}

function Get-ChromePath {
  $appPathKeys = @(
    "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  )
  foreach ($key in $appPathKeys) {
    $value = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).'(default)'
    if ($value -and (Test-Path -LiteralPath $value)) { return $value }
  }

  $candidatePaths = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  return $candidatePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
}

function Ensure-Chrome {
  $chromePath = Get-ChromePath
  if ($chromePath) { return $chromePath }

  Write-Step "Instalando o Google Chrome"
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "O Google Chrome nao esta instalado e o Windows Package Manager (winget) nao esta disponivel para instala-lo."
  }

  & $winget.Source install --id Google.Chrome --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) {
    throw "A instalacao do Google Chrome falhou com o codigo $LASTEXITCODE."
  }

  $chromePath = Get-ChromePath
  if (-not $chromePath) {
    throw "O Google Chrome foi instalado, mas chrome.exe nao foi localizado."
  }
  return $chromePath
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = @($machinePath, $userPath) -join ";"
}

function Get-NodeVersion {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    return $null
  }

  try {
    return [Version]((& node.exe --version).Trim().TrimStart("v"))
  }
  catch {
    return $null
  }
}

function Install-NodeLts {
  Write-Step "Baixando e instalando a versao LTS atual do Node.js e do NPM"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $architecture = if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "arm64" } else { "x64" }
  $fileCapability = "win-$architecture-msi"
  $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
  $release = $releases |
    Where-Object { $_.lts -ne $false -and $_.files -contains $fileCapability } |
    Select-Object -First 1

  if (-not $release) {
    throw "Nao foi possivel localizar um instalador LTS do Node.js para Windows $architecture."
  }

  $version = [string]$release.version
  $installerName = "node-$version-$architecture.msi"
  $installerPath = Join-Path $env:TEMP $installerName
  $installerUrl = "https://nodejs.org/dist/$version/$installerName"

  try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @(
      "/i",
      ('"{0}"' -f $installerPath),
      "/qn",
      "/norestart",
      "ADDLOCAL=ALL"
    ) -Wait -PassThru

    if ($process.ExitCode -notin @(0, 1641, 3010)) {
      throw "O instalador do Node.js retornou o codigo $($process.ExitCode)."
    }
  }
  finally {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
  }

  Refresh-ProcessPath
}

function Ensure-NodeAndNpm {
  $minimumNodeVersion = [Version]"22.13.0"
  $installedVersion = Get-NodeVersion

  if (-not $installedVersion -or $installedVersion -lt $minimumNodeVersion) {
    Install-NodeLts
    $installedVersion = Get-NodeVersion
  }

  if (-not $installedVersion -or $installedVersion -lt $minimumNodeVersion) {
    throw "Node.js $minimumNodeVersion ou superior nao esta disponivel depois da instalacao."
  }

  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCommand) {
    throw "O NPM nao foi encontrado depois da instalacao do Node.js."
  }

  Write-Host "Node.js: $installedVersion" -ForegroundColor DarkGray
  $npmVersion = (& npm.cmd --version).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $npmVersion) {
    throw "O NPM instalado com o Node.js nao pode ser executado."
  }
  Write-Host "NPM: $npmVersion" -ForegroundColor DarkGray
}

function Install-ProjectDependencies {
  $nodeModulesPath = Join-Path (Get-Location) "node_modules"
  $requiredToolchainFiles = @(
    "node_modules\.bin\vite.cmd",
    "node_modules\vite\package.json",
    "node_modules\vinext\package.json",
    "node_modules\typescript\package.json",
    "node_modules\react\package.json",
    "node_modules\react-dom\package.json",
    "node_modules\@cloudflare\vite-plugin\package.json",
    "node_modules\vite-plugin-wasm\package.json",
    "node_modules\@dimforge\rapier2d-deterministic\package.json"
  )
  $toolchainReady = (Test-Path -LiteralPath $nodeModulesPath) -and -not ($requiredToolchainFiles | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path (Get-Location) $_))
  } | Select-Object -First 1)

  if ($toolchainReady) {
    Write-Step "Usando as dependencias instaladas"
    Write-Host "A arvore node_modules esta pronta e sera preservada para evitar bloqueios EPERM/EBUSY do Windows." -ForegroundColor DarkGray
    return
  }

  Write-Step "Baixando as dependencias exatas do jogo"
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    if ($LASTEXITCODE -in @(-4048, -4082)) {
      throw "O Windows bloqueou um arquivo de dependencia (NPM EPERM/EBUSY $LASTEXITCODE). Feche servidores Node.js que estejam usando esta pasta e tente novamente."
    }
    throw "A instalacao das dependencias falhou com o codigo $LASTEXITCODE."
  }
}

function Ensure-IIS {
  Write-Step "Verificando e instalando os componentes do IIS"

  if (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue) {
    $features = @(
      "Web-Server",
      "Web-Static-Content",
      "Web-Default-Doc",
      "Web-Http-Errors",
      "Web-Mgmt-Console"
    )
    $result = Install-WindowsFeature -Name $features -IncludeManagementTools
    if (-not $result.Success) {
      throw "O Windows Server nao conseguiu instalar todos os componentes necessarios do IIS."
    }
  }
  elseif (Get-Command Enable-WindowsOptionalFeature -ErrorAction SilentlyContinue) {
    $features = @(
      "IIS-WebServerRole",
      "IIS-WebServer",
      "IIS-CommonHttpFeatures",
      "IIS-StaticContent",
      "IIS-DefaultDocument",
      "IIS-HttpErrors",
      "IIS-ManagementConsole"
    )
    Enable-WindowsOptionalFeature -Online -All -NoRestart -FeatureName $features | Out-Null
  }
  else {
    throw "Este Windows nao oferece os comandos necessarios para instalar o IIS."
  }

  Import-Module WebAdministration -ErrorAction Stop
}

function Assert-SafeInstallPath {
  param([string]$Path)

  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd("\")
  $rootPath = [IO.Path]::GetPathRoot($fullPath).TrimEnd("\")
  $inetpubRoot = [IO.Path]::GetFullPath("$env:SystemDrive\inetpub").TrimEnd("\")

  if ($fullPath -eq $rootPath -or $fullPath -eq $inetpubRoot) {
    throw "Por seguranca, escolha uma subpasta dedicada dentro de C:\inetpub."
  }

  return $fullPath
}

function Publish-StaticFiles {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (-not (Test-Path -LiteralPath (Join-Path $Source "index.html"))) {
    throw "A compilacao IIS nao gerou o arquivo index.html."
  }

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $robocopy = Start-Process -FilePath "robocopy.exe" -ArgumentList @(
    ('"{0}"' -f $Source),
    ('"{0}"' -f $Destination),
    "/MIR",
    "/R:2",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  ) -Wait -PassThru

  if ($robocopy.ExitCode -gt 7) {
    throw "A copia dos arquivos para o IIS falhou com o codigo $($robocopy.ExitCode)."
  }

  & icacls.exe $Destination /grant "IIS_IUSRS:(OI)(CI)RX" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel conceder permissao de leitura dos arquivos ao IIS."
  }
}

function Configure-IISSite {
  param(
    [string]$Name,
    [string]$PhysicalPath,
    [int]$ListenPort
  )

  $appPoolName = "AI-Racing-Spectator"
  $conflictingBinding = Get-Website | Where-Object { $_.Name -ne $Name } | ForEach-Object {
    $websiteName = $_.Name
    Get-WebBinding -Name $websiteName -Protocol "http" | Where-Object {
      $_.bindingInformation -match "^([^:]*):${ListenPort}:"
    } | Select-Object -First 1 | ForEach-Object { $websiteName }
  } | Select-Object -First 1
  if ($conflictingBinding) {
    throw "A porta $ListenPort ja esta vinculada ao site IIS '$conflictingBinding'. Escolha outra porta com -Port."
  }

  if (-not (Test-Path "IIS:\AppPools\$appPoolName")) {
    New-WebAppPool -Name $appPoolName | Out-Null
  }

  Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name managedRuntimeVersion -Value ""
  Set-ItemProperty "IIS:\AppPools\$appPoolName" -Name managedPipelineMode -Value "Integrated"

  $site = Get-Website -Name $Name -ErrorAction SilentlyContinue
  if (-not $site) {
    New-Website -Name $Name -Port $ListenPort -PhysicalPath $PhysicalPath -ApplicationPool $appPoolName | Out-Null
  }
  else {
    Stop-Website -Name $Name -ErrorAction SilentlyContinue
    Set-ItemProperty "IIS:\Sites\$Name" -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty "IIS:\Sites\$Name" -Name applicationPool -Value $appPoolName

    $hasRequestedBinding = Get-WebBinding -Name $Name -Protocol "http" |
      Where-Object { $_.bindingInformation -match ":${ListenPort}:" }
    if (-not $hasRequestedBinding) {
      New-WebBinding -Name $Name -Protocol "http" -Port $ListenPort -IPAddress "*" | Out-Null
    }
  }

  $appPoolState = (Get-WebAppPoolState -Name $appPoolName).Value
  if ($appPoolState -eq "Started") {
    Restart-WebAppPool -Name $appPoolName
  }
  else {
    Start-WebAppPool -Name $appPoolName
  }

  if ((Get-WebsiteState -Name $Name).Value -ne "Started") {
    Start-Website -Name $Name
  }
}

function Wait-ForWebsite {
  param([string]$Url)

  for ($attempt = 1; $attempt -le 15; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return
      }
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "O IIS foi configurado, mas o jogo nao respondeu em $Url."
}

if (-not (Test-Administrator)) {
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $PSCommandPath),
    "-Port", $Port,
    "-SiteName", ('"{0}"' -f $SiteName),
    "-InstallPath", ('"{0}"' -f $InstallPath)
  ) -join " "

  try {
    $elevatedProcess = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevatedProcess.ExitCode
  }
  catch {
    Write-Host "A permissao de administrador e necessaria para instalar e configurar o IIS." -ForegroundColor Red
    exit 1
  }
}

try {
  Assert-PublishingHost
  $projectRoot = Split-Path -Parent $PSScriptRoot
  $buildOutput = Join-Path $projectRoot "iis-dist"
  $safeInstallPath = Assert-SafeInstallPath -Path $InstallPath

  foreach ($requiredFile in @("package.json", "package-lock.json", "vite.iis.config.ts", "iis\index.html", "iis\public\web.config")) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $requiredFile))) {
      throw "Arquivo necessario para publicacao ausente: $requiredFile"
    }
  }

  Set-Location $projectRoot
  $chromePath = Ensure-Chrome
  Ensure-NodeAndNpm

  Install-ProjectDependencies

  Write-Step "Validando o build de producao do ChatGPT Sites"
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "O build do ChatGPT Sites falhou com o codigo $LASTEXITCODE."
  }

  Write-Step "Compilando a versao estatica para IIS"
  & npm.cmd run build:iis
  if ($LASTEXITCODE -ne 0) {
    throw "O build para IIS falhou com o codigo $LASTEXITCODE."
  }

  Ensure-IIS

  Write-Step "Publicando os arquivos no IIS"
  Publish-StaticFiles -Source $buildOutput -Destination $safeInstallPath
  Configure-IISSite -Name $SiteName -PhysicalPath $safeInstallPath -ListenPort $Port

  $url = "http://localhost:$Port/"
  Wait-ForWebsite -Url $url

  Write-Host "`nPublicacao concluida: $url" -ForegroundColor Green
  try {
    Start-Process -FilePath $chromePath -ArgumentList @("--new-window", $url) | Out-Null
  }
  catch {
    Write-Warning "O jogo foi publicado, mas nao foi possivel abrir o Google Chrome automaticamente. Acesse $url manualmente."
  }
}
catch {
  Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Nenhuma outra tentativa sera feita automaticamente." -ForegroundColor Yellow
  Read-Host "Pressione ENTER para fechar"
  exit 1
}
