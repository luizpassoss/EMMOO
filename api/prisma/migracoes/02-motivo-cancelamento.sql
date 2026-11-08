-- =====================================================================
-- Migração 02 — EMMOO: guarda por que cada aula foi cancelada (à mão ou pela inativação do aluno).
-- Assim, ao reativar um aluno, as aulas que a inativação cancelou voltam para a agenda — e só elas.
--
-- Quando usar: o banco já passou pela migração 01 (ou foi importado do emmoo.sql antes desta mudança).
-- Como rodar no XAMPP: backup (phpMyAdmin → "Exportar") e depois phpMyAdmin → banco "emmoo" → "Importar" → este arquivo.
-- Rode uma única vez: numa segunda vez ele para no primeiro passo (a coluna já existe).
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `aula` ADD COLUMN `motivo_cancelamento` ENUM('manual', 'inativacao') NULL AFTER `status`;

-- Aulas que já estavam canceladas: as de hoje em diante de quem está inativo foram, quase certamente,
-- canceladas pela inativação (era a única forma de cancelar em lote) — então voltam se o aluno for reativado.
-- As demais ficam sem motivo, o que o sistema trata como cancelamento à mão (não voltam).
UPDATE `aula` a
  JOIN `aluno` al ON al.`id` = a.`aluno_id` AND al.`escola_id` = a.`escola_id`
  SET a.`motivo_cancelamento` = 'inativacao'
  WHERE a.`status` = 'cancelada' AND al.`status` = 'inativo' AND a.`data` >= CURDATE();
