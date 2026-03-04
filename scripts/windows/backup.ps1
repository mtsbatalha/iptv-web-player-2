#===============================================================================
# IPTV Web Player - Backup Script (Windows PowerShell)
# Faz backup do banco de dados MySQL e arquivos do projeto
#===============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet('db', 'full', 'list', 'cleanup', 'help')]
    [string]$Action = 'menu'
)

# Configurações
$Script:InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { "C:\iptv-web-player" }
$Script:BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "C:\iptv-backups" }
$Script:RetentionDays = 7
$Script:Date = Get-Date -Format "yyyyMMdd_HHmmss"

# Cores
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# Carregar variáveis do .env
function Load-Env {
    $envFile = Join-Path $Script:InstallDir ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                Set-Variable -Name $name -Value $value -Scope Script
            }
        }
        Write-Success "Variáveis de ambiente carregadas"
    } else {
        Write-Err "Arquivo .env não encontrado em $Script:InstallDir"
        exit 1
    }
}

# Criar diretório de backup
function Create-BackupDir {
    if (-not (Test-Path $Script:BackupDir)) {
        New-Item -ItemType Directory -Path $Script:BackupDir -Force | Out-Null
    }
    Write-Success "Diretório de backup: $Script:BackupDir"
}

# Backup do banco de dados
function Backup-Database {
    Write-Info "Fazendo backup do banco de dados..."
    
    $dbBackupFile = Join-Path $Script:BackupDir "db_${Script:DB_NAME}_${Script:Date}.sql"
    $dbBackupCompressed = "${dbBackupFile}.gz"
    
    # Verificar se mysqldump está disponível
    $mysqldump = Get-Command mysqldump -ErrorAction SilentlyContinue
    if (-not $mysqldump) {
        # Tentar caminhos comuns
        $commonPaths = @(
            "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
            "C:\xampp\mysql\bin\mysqldump.exe",
            "C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysqldump.exe"
        )
        foreach ($path in $commonPaths) {
            if (Test-Path $path) {
                $mysqldump = $path
                break
            }
        }
    }
    
    if (-not $mysqldump) {
        Write-Err "mysqldump não encontrado. Instale o MySQL Client ou adicione ao PATH."
        exit 1
    }
    
    # Executar mysqldump
    $arguments = @(
        "-h", $Script:DB_HOST,
        "-P", ($Script:DB_PORT ?? "3306"),
        "-u", $Script:DB_USER,
        "-p$($Script:DB_PASSWORD)",
        "--single-transaction",
        "--routines",
        "--triggers",
        $Script:DB_NAME
    )
    
    & $mysqldump $arguments | Out-File -FilePath $dbBackupFile -Encoding UTF8
    
    # Comprimir usando gzip (se disponível) ou Compress-Archive
    if (Get-Command gzip -ErrorAction SilentlyContinue) {
        & gzip -f $dbBackupFile
        Write-Success "Backup do banco criado: $dbBackupCompressed"
        return $dbBackupCompressed
    } else {
        # Usar Compress-Archive como alternativa
        $zipFile = "${dbBackupFile}.zip"
        Compress-Archive -Path $dbBackupFile -DestinationPath $zipFile -Force
        Remove-Item $dbBackupFile -Force
        Write-Success "Backup do banco criado: $zipFile"
        return $zipFile
    }
}

# Backup completo
function Backup-Full {
    Write-Info "Fazendo backup completo..."
    
    $fullBackupDir = Join-Path $Script:BackupDir "full_${Script:Date}"
    $fullBackupFile = Join-Path $Script:BackupDir "iptv_backup_full_${Script:Date}.zip"
    
    New-Item -ItemType Directory -Path $fullBackupDir -Force | Out-Null
    
    # 1. Backup do banco de dados
    Write-Info "Exportando banco de dados..."
    $dbFile = Join-Path $fullBackupDir "database.sql"
    
    $mysqldump = Get-Command mysqldump -ErrorAction SilentlyContinue
    if (-not $mysqldump) {
        $commonPaths = @(
            "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe",
            "C:\xampp\mysql\bin\mysqldump.exe"
        )
        foreach ($path in $commonPaths) {
            if (Test-Path $path) { $mysqldump = $path; break }
        }
    }
    
    if ($mysqldump) {
        $arguments = @(
            "-h", $Script:DB_HOST,
            "-P", ($Script:DB_PORT ?? "3306"),
            "-u", $Script:DB_USER,
            "-p$($Script:DB_PASSWORD)",
            "--single-transaction",
            $Script:DB_NAME
        )
        & $mysqldump $arguments | Out-File -FilePath $dbFile -Encoding UTF8
    }
    
    # 2. Copiar .env
    Write-Info "Copiando configurações..."
    $envSource = Join-Path $Script:InstallDir ".env"
    if (Test-Path $envSource) {
        Copy-Item $envSource -Destination (Join-Path $fullBackupDir ".env")
    }
    
    # 3. Copiar uploads
    $uploadsSource = Join-Path $Script:InstallDir "uploads"
    if (Test-Path $uploadsSource) {
        Write-Info "Copiando uploads..."
        Copy-Item $uploadsSource -Destination (Join-Path $fullBackupDir "uploads") -Recurse
    }
    
    # 4. Copiar recordings (se pequeno)
    $recordingsSource = Join-Path $Script:InstallDir "recordings"
    if (Test-Path $recordingsSource) {
        $size = (Get-ChildItem $recordingsSource -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        if ($size -lt 1024) {
            Write-Info "Copiando recordings (${size}MB)..."
            Copy-Item $recordingsSource -Destination (Join-Path $fullBackupDir "recordings") -Recurse
        } else {
            Write-Warn "Recordings muito grande (${size}MB), pulando..."
        }
    }
    
    # 5. Criar arquivo comprimido
    Write-Info "Comprimindo backup..."
    Compress-Archive -Path "$fullBackupDir\*" -DestinationPath $fullBackupFile -Force
    
    # 6. Limpar diretório temporário
    Remove-Item $fullBackupDir -Recurse -Force
    
    Write-Success "Backup completo criado: $fullBackupFile"
    return $fullBackupFile
}

# Limpar backups antigos
function Cleanup-OldBackups {
    Write-Info "Limpando backups com mais de $Script:RetentionDays dias..."
    
    $cutoffDate = (Get-Date).AddDays(-$Script:RetentionDays)
    
    Get-ChildItem $Script:BackupDir -Include *.gz, *.zip -Recurse | 
        Where-Object { $_.LastWriteTime -lt $cutoffDate } |
        ForEach-Object {
            Write-Info "Removendo: $($_.Name)"
            Remove-Item $_.FullName -Force
        }
    
    Write-Success "Limpeza concluída"
}

# Listar backups
function List-Backups {
    Write-Info "Backups disponíveis em ${Script:BackupDir}:"
    Write-Host ""
    
    Get-ChildItem $Script:BackupDir -Include *.gz, *.zip -Recurse | 
        Sort-Object LastWriteTime -Descending |
        Format-Table Name, @{Label="Size";Expression={"{0:N2} MB" -f ($_.Length / 1MB)}}, LastWriteTime -AutoSize
}

# Menu
function Show-Menu {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "   IPTV Web Player - Backup Script" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1) Backup do banco de dados (comprimido)"
    Write-Host "2) Backup completo (banco + arquivos)"
    Write-Host "3) Listar backups existentes"
    Write-Host "4) Limpar backups antigos"
    Write-Host "0) Sair"
    Write-Host ""
    
    $choice = Read-Host "Escolha uma opção"
    
    switch ($choice) {
        "1" { Load-Env; Backup-Database }
        "2" { Load-Env; Backup-Full }
        "3" { List-Backups }
        "4" { Cleanup-OldBackups }
        "0" { exit }
        default { Write-Err "Opção inválida" }
    }
}

# Execução principal
Create-BackupDir

switch ($Action) {
    'db' { Load-Env; Backup-Database }
    'full' { Load-Env; Backup-Full }
    'list' { List-Backups }
    'cleanup' { Cleanup-OldBackups }
    'help' {
        Write-Host "Uso: .\backup.ps1 [ação]"
        Write-Host ""
        Write-Host "Ações:"
        Write-Host "  db        Backup apenas do banco de dados"
        Write-Host "  full      Backup completo (banco + arquivos)"
        Write-Host "  list      Listar backups existentes"
        Write-Host "  cleanup   Limpar backups antigos"
        Write-Host "  help      Mostrar esta ajuda"
        Write-Host ""
        Write-Host "Sem argumentos, abre menu interativo."
    }
    default { Show-Menu }
}
