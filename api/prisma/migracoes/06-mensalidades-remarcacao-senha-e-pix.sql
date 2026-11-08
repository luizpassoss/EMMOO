-- =====================================================================
-- Migração 06 — EMMOO: ajuste e cancelamento de mensalidades, recibo numerado, remarcação de aula,
-- redefinição de senha por e-mail e Pix da escola.
--
-- - mensalidade.status ganha "cancelada" (a escola desistiu de cobrar; não conta nos totais nem gera alerta),
--   com o motivo em cancelamento_motivo.
-- - mensalidade.valor_original e ajuste_motivo: desconto, bolsa ou correção de valor (o valor do plano antes
--   do ajuste fica guardado).
-- - mensalidade.numero_recibo: número do recibo, sequencial por escola. As mensalidades já pagas recebem
--   números na ordem da data de pagamento (o recibo nº 1 é o pagamento mais antigo de cada escola).
-- - solicitacao.tipo ganha "remarcacao" e solicitacao.data_anterior: a aula remarcada guarda de quando era.
-- - redefinicao_senha: pedidos de "Esqueci minha senha" (só o hash do token; vale por 1 hora, uma vez só).
-- - escola.pix_*: chave Pix, nome e cidade do recebedor, para o responsável pagar com o QR do Pix.
-- Nada que já existe é apagado ou alterado (só acrescenta colunas, uma tabela e valores aos ENUMs).
--
-- Quando usar: o banco já passou pelas migrações 01 a 05.
-- Como rodar no XAMPP: backup (phpMyAdmin → "Exportar") e depois phpMyAdmin → banco "emmoo" → "Importar" → este arquivo.
-- Rode uma única vez: numa segunda vez ele para no primeiro passo (a coluna já existe).
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `escola` ADD COLUMN `pix_chave` VARCHAR(77) NULL,
    ADD COLUMN `pix_cidade` VARCHAR(15) NULL,
    ADD COLUMN `pix_recebedor` VARCHAR(25) NULL,
    ADD COLUMN `pix_tipo` VARCHAR(12) NULL;

ALTER TABLE `solicitacao` ADD COLUMN `data_anterior` DATETIME(3) NULL,
    MODIFY `tipo` ENUM('falta', 'reposicao', 'remarcacao') NOT NULL;

ALTER TABLE `mensalidade` ADD COLUMN `ajuste_motivo` VARCHAR(160) NULL,
    ADD COLUMN `cancelamento_motivo` VARCHAR(160) NULL,
    ADD COLUMN `numero_recibo` INTEGER NULL,
    ADD COLUMN `valor_original` DECIMAL(10, 2) NULL,
    MODIFY `status` ENUM('pendente', 'paga', 'atrasada', 'cancelada') NOT NULL DEFAULT 'pendente';

-- Recibos das mensalidades já pagas: 1, 2, 3… por escola, do pagamento mais antigo ao mais recente.
UPDATE `mensalidade` AS `m`
  JOIN (
    SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `escola_id` ORDER BY `data_pagamento`, `id`) AS `numero`
    FROM `mensalidade`
    WHERE `status` = 'paga'
  ) AS `pagas` ON `pagas`.`id` = `m`.`id`
  SET `m`.`numero_recibo` = `pagas`.`numero`;

CREATE TABLE `redefinicao_senha` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expira_em` DATETIME(3) NOT NULL,
    `usado_em` DATETIME(3) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `redefinicao_senha_token_hash_key`(`token_hash`),
    INDEX `redefinicao_senha_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `mensalidade_escola_id_numero_recibo_key` ON `mensalidade`(`escola_id`, `numero_recibo`);

ALTER TABLE `redefinicao_senha` ADD CONSTRAINT `redefinicao_senha_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `redefinicao_senha` ADD CONSTRAINT `redefinicao_senha_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
