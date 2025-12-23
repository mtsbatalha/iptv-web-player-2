#===============================================================================
# IPTV Web Player - Restore Script (Windows PowerShell)
# Restaura backup do banco de dados MySQL e arquivos do projeto
#===============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet('db', 'full', 'list', 'help')]
    [string]$Action = 'menu',
    
    [Parameter(Position = 1)]
    [string]$BackupFile
)

# Configurações
$Script:InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { "C:\iptv-web-player" }
$Script:BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "C:\iptv-backups" }

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
    }
    else {
        Write-Warn "Arquivo .env não encontrado. Digite as credenciais:"
        $Script:DB_HOST = Read-Host "DB_HOST"
        $Script:DB_PORT = Read-Host "DB_PORT (padrão: 3306)"
        if (-not $Script:DB_PORT) { $Script:DB_PORT = "3306" }
        $Script:DB_USER = Read-Host "DB_USER"
        $Script:DB_PASSWORD = Read-Host "DB_PASSWORD" -AsSecureString
        $Script:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Script:DB_PASSWORD))
        $Script:DB_NAME = Read-Host "DB_NAME"
    }
}

# Listar backups
function List-Backups {
    Write-Info "Backups disponíveis em ${Script:BackupDir}:"
    Write-Host ""
    
    $Script:BackupFiles = @(Get-ChildItem $Script:BackupDir -Include *.gz, *.zip -Recurse | Sort-Object LastWriteTime -Descending)
    
    if ($Script:BackupFiles.Count -eq 0) {
        Write-Warn "Nenhum backup encontrado"
        return $false
    }
    
    $i = 1
    foreach ($file in $Script:BackupFiles) {
        $size = "{0:N2} MB" -f ($file.Length / 1MB)
        Write-Host "  $i) $($file.Name) ($size) - $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))"
        $i++
    }
    
    Write-Host ""
    return $true
}

# Selecionar backup
function Select-Backup {
    if (-not (List-Backups)) { return $null }
    
    $selection = Read-Host "Selecione o número do backup (0 para cancelar)"
    
    if ($selection -eq "0") { return $null }
    
    $index = [int]$selection - 1
    
    if ($index -ge 0 -and $index -lt $Script:BackupFiles.Count) {
        return $Script:BackupFiles[$index].FullName
    }
    
    Write-Err "Seleção inválida"
    return $null
}

# Restaurar banco de dados
function Restore-Database {
    param([string]$File)
    
    if (-not $File) {
        Write-Err "Arquivo de backup não especificado"
        return
    }
    
    if (-not (Test-Path $File)) {
        Write-Err "Arquivo não encontrado: $File"
        return
    }
    
    Write-Warn "ATENÇÃO: Esta operação irá SUBSTITUIR todos os dados do banco $Script:DB_NAME"
    $confirm = Read-Host "Deseja continuar? (digite 'sim' para confirmar)"
    
    if ($confirm -ne "sim") {
        Write-Info "Operação cancelada"
        return
    }
    
    # Encontrar mysql
    $mysql = Get-Command mysql -ErrorAction SilentlyContinue
    if (-not $mysql) {
        $commonPaths = @(
            "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
            "C:\xampp\mysql\bin\mysql.exe"
        )
        foreach ($path in $commonPaths) {
            if (Test-Path $path) { $mysql = $path; break }
        }
    }
    
    if (-not $mysql) {
        Write-Err "mysql não encontrado"
        return
    }
    
    Write-Info "Restaurando banco de dados..."
    
    # Criar arquivo temporário se comprimido
    $sqlFile = $File
    $tempFile = $null
    
    if ($File -match '\.gz$') {
        if (Get-Command gzip -ErrorAction SilentlyContinue) {
            $tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
            & gzip -dc $File | Out-File $tempFile -Encoding UTF8
            $sqlFile = $tempFile
        }
        else {
            Write-Err "gzip não encontrado. Use um arquivo .zip ou instale gzip."
            return
        }
    }
    elseif ($File -match '\.zip$') {
        $tempDir = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
        Expand-Archive -Path $File -DestinationPath $tempDir -Force
        $sqlFile = Get-ChildItem $tempDir -Filter "*.sql" -Recurse | Select-Object -First 1 | ForEach-Object { $_.FullName }
        if (-not $sqlFile) {
            Write-Err "Arquivo SQL não encontrado no backup"
            Remove-Item $tempDir -Recurse -Force
            return
        }
    }
    
    # Executar restauração
    $arguments = @(
        "-h", $Script:DB_HOST,
        "-P", $Script:DB_PORT,
        "-u", $Script:DB_USER,
        "-p$($Script:DB_PASSWORD)",
        $Script:DB_NAME
    )
    
    Get-Content $sqlFile | & $mysql $arguments
    
    # Limpar arquivos temporários
    if ($tempFile -and (Test-Path $tempFile)) {
        Remove-Item $tempFile -Force
    }
    if ($tempDir -and (Test-Path $tempDir)) {
        Remove-Item $tempDir -Recurse -Force
    }
    
    Write-Success "Banco de dados restaurado com sucesso!"
}

# Restaurar backup completo
function Restore-Full {
    param([string]$File)
    
    if (-not $File) {
        Write-Err "Arquivo de backup não especificado"
        return
    }
    
    if (-not (Test-Path $File)) {
        Write-Err "Arquivo não encontrado: $File"
        return
    }
    
    if ($File -notmatch '\.zip$') {
        Write-Err "Para restauração completa, use um arquivo .zip"
        return
    }
    
    Write-Warn "ATENÇÃO: Esta operação irá SUBSTITUIR:"
    Write-Warn "  - Todos os dados do banco $Script:DB_NAME"
    Write-Warn "  - Arquivos de upload (playlists, avatars, EPG)"
    Write-Host ""
    $confirm = Read-Host "Deseja continuar? (digite 'sim' para confirmar)"
    
    if ($confirm -ne "sim") {
        Write-Info "Operação cancelada"
        return
    }
    
    # Extrair backup
    $tempDir = [System.IO.Path]::GetTempPath() + "iptv_restore_" + [System.Guid]::NewGuid().ToString()
    Write-Info "Extraindo backup..."
    Expand-Archive -Path $File -DestinationPath $tempDir -Force
    
    # 1. Restaurar banco de dados
    $dbFile = Get-ChildItem $tempDir -Filter "database.sql" -Recurse | Select-Object -First 1
    if ($dbFile) {
        Write-Info "Restaurando banco de dados..."
        
        $mysql = Get-Command mysql -ErrorAction SilentlyContinue
        if (-not $mysql) {
            $commonPaths = @("C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe", "C:\xampp\mysql\bin\mysql.exe")
            foreach ($path in $commonPaths) { if (Test-Path $path) { $mysql = $path; break } }
        }
        
        if ($mysql) {
            $arguments = @("-h", $Script:DB_HOST, "-P", $Script:DB_PORT, "-u", $Script:DB_USER, "-p$($Script:DB_PASSWORD)", $Script:DB_NAME)
            Get-Content $dbFile.FullName | & $mysql $arguments
            Write-Success "Banco de dados restaurado"
        }
    }
    
    # 2. Restaurar uploads
    $uploadsDir = Get-ChildItem $tempDir -Directory -Filter "uploads" -Recurse | Select-Object -First 1
    if ($uploadsDir) {
        Write-Info "Restaurando uploads..."
        $destUploads = Join-Path $Script:InstallDir "uploads"
        if (Test-Path $destUploads) { Remove-Item $destUploads -Recurse -Force }
        Copy-Item $uploadsDir.FullName -Destination $destUploads -Recurse
        Write-Success "Uploads restaurados"
    }
    
    # 3. Restaurar recordings
    $recordingsDir = Get-ChildItem $tempDir -Directory -Filter "recordings" -Recurse | Select-Object -First 1
    if ($recordingsDir) {
        Write-Info "Restaurando recordings..."
        $destRecordings = Join-Path $Script:InstallDir "recordings"
        if (Test-Path $destRecordings) { Remove-Item $destRecordings -Recurse -Force }
        Copy-Item $recordingsDir.FullName -Destination $destRecordings -Recurse
        Write-Success "Recordings restaurados"
    }
    
    # 4. Restaurar .env
    $envFile = Get-ChildItem $tempDir -Filter ".env" -Recurse | Select-Object -First 1
    if ($envFile) {
        $restoreEnv = Read-Host "Restaurar arquivo .env? (s/n)"
        if ($restoreEnv -eq "s") {
            Copy-Item $envFile.FullName -Destination (Join-Path $Script:InstallDir ".env") -Force
            Write-Success ".env restaurado"
        }
    }
    
    # Limpar
    Remove-Item $tempDir -Recurse -Force
    
    Write-Success "Restauração completa concluída!"
}

# Menu
function Show-Menu {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "   IPTV Web Player - Restore Script" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1) Restaurar banco de dados"
    Write-Host "2) Restaurar backup completo"
    Write-Host "3) Listar backups disponíveis"
    Write-Host "0) Sair"
    Write-Host ""
    
    $choice = Read-Host "Escolha uma opção"
    
    switch ($choice) {
        "1" {
            Load-Env
            $file = Select-Backup
            if ($file) { Restore-Database -File $file }
        }
        "2" {
            Load-Env
            $file = Select-Backup
            if ($file) { Restore-Full -File $file }
        }
        "3" { List-Backups }
        "0" { exit }
        default { Write-Err "Opção inválida" }
    }
}

# Execução principal
switch ($Action) {
    'db' { Load-Env; Restore-Database -File $BackupFile }
    'full' { Load-Env; Restore-Full -File $BackupFile }
    'list' { List-Backups }
    'help' {
        Write-Host "Uso: .\restore.ps1 [ação] [arquivo]"
        Write-Host ""
        Write-Host "Ações:"
        Write-Host "  db <arquivo>    Restaurar apenas banco de dados"
        Write-Host "  full <arquivo>  Restaurar backup completo"
        Write-Host "  list            Listar backups disponíveis"
        Write-Host "  help            Mostrar esta ajuda"
        Write-Host ""
        Write-Host "Sem argumentos, abre menu interativo."
    }
    default { Show-Menu }
}
