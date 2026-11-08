-- =====================================================================
-- Migração 05 — EMMOO: aviso de falta, reposição e alertas de pagamento (RF06, RF07 e RF12).
--
-- - aula.reposicao_de_id: a aula de reposição aponta para a aula que o aluno perdeu (RF07).
--   Se a aula original for apagada, a reposição continua e só perde o vínculo (ON DELETE SET NULL).
-- - solicitacao.libera_reposicao: o aviso de falta foi feito com a antecedência mínima (RN05) e dá
--   direito a uma reposição.
-- - alerta: alertas de pagamento por e-mail (vencimento próximo e atraso). O que não puder ser enviado
--   (e-mail não configurado ou falha) fica pendente para reenvio, sem bloquear nada.
-- As tabelas diario_aula, solicitacao e mensalidade já existem desde a primeira versão do banco.
--
-- Quando usar: o banco já passou pelas migrações 01 a 04.
-- Como rodar no XAMPP: backup (phpMyAdmin → "Exportar") e depois phpMyAdmin → banco "emmoo" → "Importar" → este arquivo.
-- Rode uma única vez: numa segunda vez ele para no primeiro passo (a coluna já existe).
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE `aula` ADD COLUMN `reposicao_de_id` INTEGER NULL;

ALTER TABLE `solicitacao` ADD COLUMN `libera_reposicao` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `alerta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `mensalidade_id` INTEGER NOT NULL,
    `tipo` ENUM('vencimento', 'atraso') NOT NULL,
    `destinatario` VARCHAR(160) NOT NULL,
    `status` ENUM('pendente', 'enviado') NOT NULL DEFAULT 'pendente',
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `ultimo_erro` VARCHAR(200) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `enviado_em` DATETIME(3) NULL,

    INDEX `alerta_escola_id_status_idx`(`escola_id`, `status`),
    UNIQUE INDEX `alerta_mensalidade_id_tipo_key`(`mensalidade_id`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `aula_reposicao_de_id_idx` ON `aula`(`reposicao_de_id`);

CREATE INDEX `mensalidade_escola_id_mes_referencia_idx` ON `mensalidade`(`escola_id`, `mes_referencia`);

ALTER TABLE `aula` ADD CONSTRAINT `aula_reposicao_de_id_fkey` FOREIGN KEY (`reposicao_de_id`) REFERENCES `aula`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `alerta` ADD CONSTRAINT `alerta_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `alerta` ADD CONSTRAINT `alerta_mensalidade_id_fkey` FOREIGN KEY (`mensalidade_id`) REFERENCES `mensalidade`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
