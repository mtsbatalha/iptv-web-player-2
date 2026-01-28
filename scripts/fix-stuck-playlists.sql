-- Script para corrigir playlists travadas em status "syncing"
-- Execute este script no banco de dados para resetar as playlists travadas

-- Verificar playlists travadas (antes de executar)
SELECT 
    id, 
    name, 
    sync_status, 
    sync_error, 
    last_sync_at,
    updated_at,
    TIMESTAMPDIFF(HOUR, updated_at, NOW()) as hours_since_update
FROM playlists 
WHERE sync_status = 'syncing'
ORDER BY updated_at;

-- Resetar todas as playlists travadas em "syncing"
UPDATE playlists
SET 
    sync_status = 'pending',
    sync_error = 'Resetada manualmente - estava travada em syncing'
WHERE sync_status = 'syncing';

-- Verificar playlists com status de erro
SELECT 
    id, 
    name, 
    sync_status, 
    sync_error,
    last_sync_at,
    auto_update,
    update_interval
FROM playlists 
WHERE sync_status = 'error'
ORDER BY updated_at DESC;

-- Resetar também EPG sources travados
UPDATE epg_sources
SET 
    sync_status = 'pending',
    sync_error = 'Resetada manualmente - estava travada em syncing'
WHERE sync_status = 'syncing';

-- Confirmar reset
SELECT 
    sync_status, 
    COUNT(*) as count 
FROM playlists 
GROUP BY sync_status;
