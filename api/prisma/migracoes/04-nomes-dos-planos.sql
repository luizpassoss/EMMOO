-- =====================================================================
-- Migração 04 — EMMOO: nomes de plano por extenso.
--
-- O sistema sugeria nomes como "Particular 1x/semana"; agora sugere "Particular · 1 aula por semana".
-- Esta migração renomeia só os planos que seguem exatamente o padrão antigo ("Particular" ou "Grupo",
-- espaço, número de 1 a 7, "x/semana"). Nomes escolhidos pela escola (ex.: "Musicalização") não mudam.
--
-- Quando usar: o banco já passou pelas migrações 01 a 03. Rode antes do seed (npm run db:seed): o seed cria
-- os planos de exemplo pelo nome, e sem esta migração criaria cópias com o nome novo.
-- Como rodar no XAMPP: backup (phpMyAdmin → "Exportar") e depois phpMyAdmin → banco "emmoo" → "Importar" → este arquivo.
-- Pode rodar mais de uma vez: na segunda, nenhum nome segue mais o padrão antigo e nada muda.
-- Funciona no MariaDB (XAMPP) e no MySQL 8 (Docker): usa REGEXP só para filtrar, sem referências de grupo.
-- =====================================================================

SET NAMES utf8mb4;

UPDATE `plano`
SET `nome` = CONCAT(
    SUBSTRING_INDEX(`nome`, ' ', 1),
    ' · ',
    SUBSTRING(`nome`, CHAR_LENGTH(SUBSTRING_INDEX(`nome`, ' ', 1)) + 2, 1),
    IF(SUBSTRING(`nome`, CHAR_LENGTH(SUBSTRING_INDEX(`nome`, ' ', 1)) + 2, 1) = '1', ' aula por semana', ' aulas por semana')
  )
WHERE `nome` REGEXP '^(Particular|Grupo) [1-7]x/semana$';
