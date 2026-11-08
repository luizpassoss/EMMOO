-- =====================================================================
-- Migração 03 — EMMOO: desativar o acesso de usuários e cadastrar feriados/recessos da escola.
--
-- - usuario.ativo: quem for desativado não entra mais (todos começam ativos).
-- - usuario.versao_sessao: muda quando o acesso é desativado (ou o perfil/senha é alterado pela coordenação),
--   e os tokens emitidos antes deixam de valer — a sessão aberta é encerrada na hora.
-- - feriado: dias sem aula de cada escola; as aulas desses dias saem da agenda (motivo "feriado").
--
-- Quando usar: o banco já passou pelas migrações 01 e 02.
-- Como rodar no XAMPP: backup (phpMyAdmin → "Exportar") e depois phpMyAdmin → banco "emmoo" → "Importar" → este arquivo.
-- Rode uma única vez: numa segunda vez ele para no primeiro passo (a coluna já existe).
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `usuario` ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true AFTER `papel`,
    ADD COLUMN `versao_sessao` INTEGER NOT NULL DEFAULT 0 AFTER `ativo`;

ALTER TABLE `aula` MODIFY `motivo_cancelamento` ENUM('manual', 'inativacao', 'feriado') NULL;

CREATE TABLE `feriado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `descricao` VARCHAR(80) NOT NULL,
    `inicio` DATE NOT NULL,
    `fim` DATE NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `feriado_escola_id_inicio_idx`(`escola_id`, `inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `feriado` ADD CONSTRAINT `feriado_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
