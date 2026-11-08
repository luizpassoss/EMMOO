-- =====================================================================
-- Migração 01 — EMMOO: migra um banco "emmoo" já existente (de antes do multi-tenant) para várias escolas,
-- SEM perder dados: tudo o que já existe passa a ser da escola 1, "Escola de Música EMMOO" (código "emmoo").
--
-- Quando usar: o banco foi importado de uma versão anterior do emmoo.sql e já tem dados seus.
-- (Banco novo ou sem dados importantes? Basta importar o emmoo.sql, que já vem pronto.)
--
-- Como rodar no XAMPP:
--   1. Faça um backup antes: phpMyAdmin → banco "emmoo" → "Exportar" → "Executar".
--   2. phpMyAdmin → banco "emmoo" → aba "Importar" → escolher este arquivo → "Importar".
--   3. Depois, importe os próximos arquivos desta pasta, em ordem (02, 03…).
--   Rode cada um uma única vez: numa segunda vez ele para no primeiro passo (a tabela "escola" já existe).
--
-- Resultado, depois de todos os arquivos: o esquema fica igual ao de api/prisma/schema.prisma (confira com
--   npx prisma migrate diff --from-url "mysql://root@localhost:3306/emmoo" --to-schema-datamodel prisma/schema.prisma
--   que deve responder "This is an empty migration").
-- =====================================================================

SET NAMES utf8mb4;

-- 1. A escola de quem já usa o sistema
CREATE TABLE `escola` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `codigo` VARCHAR(40) NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `escola_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `escola` (`id`, `nome`, `codigo`, `atualizado_em`) VALUES (1, 'Escola de Música EMMOO', 'emmoo', NOW(3));

-- 2. Cada tabela ganha a escola; os registros existentes ficam na escola 1 (o DEFAULT só vale para esta migração)
ALTER TABLE `usuario` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`, ADD COLUMN `login` VARCHAR(40) NULL AFTER `email`;
ALTER TABLE `plano` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `aluno` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `horario_disponivel` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `aula` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `diario_aula` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `solicitacao` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;
ALTER TABLE `mensalidade` ADD COLUMN `escola_id` INTEGER NOT NULL DEFAULT 1 AFTER `id`;

-- Dali em diante a escola é sempre informada pela API (sem padrão, como no schema.prisma).
ALTER TABLE `usuario` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `plano` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `aluno` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `horario_disponivel` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `aula` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `diario_aula` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `solicitacao` ALTER COLUMN `escola_id` DROP DEFAULT;
ALTER TABLE `mensalidade` ALTER COLUMN `escola_id` DROP DEFAULT;

-- 3. E-mail e usuário passam a ser únicos DENTRO da escola (a mesma pessoa pode estar em duas escolas)
DROP INDEX `usuario_email_key` ON `usuario`;
CREATE UNIQUE INDEX `usuario_escola_id_email_key` ON `usuario`(`escola_id`, `email`);
CREATE UNIQUE INDEX `usuario_escola_id_login_key` ON `usuario`(`escola_id`, `login`);

-- 4. Índices: toda consulta filtra pela escola
CREATE INDEX `plano_escola_id_idx` ON `plano`(`escola_id`);
CREATE INDEX `aluno_escola_id_status_idx` ON `aluno`(`escola_id`, `status`);
CREATE INDEX `horario_disponivel_escola_id_idx` ON `horario_disponivel`(`escola_id`);
CREATE INDEX `aula_escola_id_data_idx` ON `aula`(`escola_id`, `data`);
CREATE INDEX `diario_aula_escola_id_idx` ON `diario_aula`(`escola_id`);
CREATE INDEX `solicitacao_escola_id_idx` ON `solicitacao`(`escola_id`);
CREATE INDEX `mensalidade_escola_id_idx` ON `mensalidade`(`escola_id`);

-- 5. Chaves estrangeiras para a escola
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `plano` ADD CONSTRAINT `plano_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `horario_disponivel` ADD CONSTRAINT `horario_disponivel_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aula` ADD CONSTRAINT `aula_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `diario_aula` ADD CONSTRAINT `diario_aula_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `mensalidade` ADD CONSTRAINT `mensalidade_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Acessos de demonstração (senhas fracas, APENAS para desenvolvimento). Sem esses e-mails, não muda nada.
--    Lucimara: usuário "admin", senha "admin" · Luiz: usuário "luiz", senha "Luiz123" · Mary: inalterada.
UPDATE `usuario` SET `login` = 'admin', `senha_hash` = '$2a$10$SneiaSR5iQWQpePz4GTuUu5CsqN6DYRvige/gYg/4a.TFTZEYuBDC', `atualizado_em` = NOW(3)
  WHERE `escola_id` = 1 AND `email` = 'lucimara@emmoo.com.br';
UPDATE `usuario` SET `login` = 'luiz', `senha_hash` = '$2a$10$gMZ9cMJfKMQQK0vdnoixDuK1T4AHTutCUEEQ1/YjMyfcp5gjFm0Du', `atualizado_em` = NOW(3)
  WHERE `escola_id` = 1 AND `email` = 'luiz@emmoo.com.br';
