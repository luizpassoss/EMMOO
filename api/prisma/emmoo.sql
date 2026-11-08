-- =====================================================================
-- EMMOO — banco de dados para MySQL/MariaDB (XAMPP), já multi-tenant (várias escolas)
-- Gerado a partir de api/prisma/schema.prisma (prisma migrate diff) + dados de demonstração.
--
-- Como importar no XAMPP:
--   phpMyAdmin (http://localhost/phpmyadmin) → aba "Importar" → escolher este arquivo → "Importar".
--   O script cria o banco "emmoo". ATENÇÃO: se ele já existir, as tabelas são apagadas e recriadas.
--
-- Escola de demonstração: código "emmoo" (é o que se digita no campo "Escola" do login).
-- Usuários de demonstração — senhas fracas, APENAS para desenvolvimento:
--   admin                  senha admin     (coordenacao; também entra com lucimara@emmoo.com.br)
--   luiz                   senha Luiz123   (professor; também entra com luiz@emmoo.com.br)
--   mary@emmoo.com.br      senha emmoo123  (responsavel)
-- =====================================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `emmoo` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `emmoo`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `redefinicao_senha`, `alerta`, `feriado`, `mensalidade`, `solicitacao`, `diario_aula`, `aula`, `horario_disponivel`, `aluno`, `plano`, `usuario`, `escola`;
SET FOREIGN_KEY_CHECKS = 1;

-- CreateTable
CREATE TABLE `escola` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `codigo` VARCHAR(40) NOT NULL,
    `pix_tipo` VARCHAR(12) NULL,
    `pix_chave` VARCHAR(77) NULL,
    `pix_recebedor` VARCHAR(25) NULL,
    `pix_cidade` VARCHAR(15) NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `escola_codigo_key`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `login` VARCHAR(40) NULL,
    `senha_hash` VARCHAR(100) NOT NULL,
    `papel` ENUM('coordenacao', 'professor', 'responsavel') NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `versao_sessao` INTEGER NOT NULL DEFAULT 0,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuario_escola_id_email_key`(`escola_id`, `email`),
    UNIQUE INDEX `usuario_escola_id_login_key`(`escola_id`, `login`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plano` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `nome` VARCHAR(80) NOT NULL,
    `tipo` ENUM('particular', 'grupo') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `freq_semanal` INTEGER NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `plano_escola_id_idx`(`escola_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aluno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `contato` VARCHAR(120) NOT NULL,
    `instrumento` VARCHAR(60) NOT NULL,
    `status` ENUM('ativo', 'inativo') NOT NULL DEFAULT 'ativo',
    `plano_id` INTEGER NOT NULL,
    `usuario_resp_id` INTEGER NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    INDEX `aluno_escola_id_status_idx`(`escola_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horario_disponivel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `professor_id` INTEGER NOT NULL,
    `dia_semana` INTEGER NOT NULL,
    `hora_inicio` VARCHAR(5) NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `disponivel` BOOLEAN NOT NULL DEFAULT true,

    INDEX `horario_disponivel_escola_id_idx`(`escola_id`),
    UNIQUE INDEX `horario_disponivel_professor_id_dia_semana_hora_inicio_key`(`professor_id`, `dia_semana`, `hora_inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `aluno_id` INTEGER NOT NULL,
    `professor_id` INTEGER NOT NULL,
    `data` DATE NOT NULL,
    `hora` VARCHAR(5) NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `status` ENUM('agendada', 'realizada', 'falta', 'cancelada') NOT NULL DEFAULT 'agendada',
    `motivo_cancelamento` ENUM('manual', 'inativacao', 'feriado') NULL,
    `reposicao_de_id` INTEGER NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aula_escola_id_data_idx`(`escola_id`, `data`),
    INDEX `aula_professor_id_data_idx`(`professor_id`, `data`),
    INDEX `aula_aluno_id_data_idx`(`aluno_id`, `data`),
    INDEX `aula_reposicao_de_id_idx`(`reposicao_de_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diario_aula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `aula_id` INTEGER NOT NULL,
    `conteudo_ministrado` TEXT NOT NULL,
    `plano_proxima` TEXT NULL,

    UNIQUE INDEX `diario_aula_aula_id_key`(`aula_id`),
    INDEX `diario_aula_escola_id_idx`(`escola_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `solicitacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `aluno_id` INTEGER NOT NULL,
    `aula_id` INTEGER NULL,
    `tipo` ENUM('falta', 'reposicao', 'remarcacao') NOT NULL,
    `data_solicitacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('pendente', 'aprovada', 'recusada') NOT NULL DEFAULT 'pendente',
    `nova_data` DATETIME(3) NULL,
    `data_anterior` DATETIME(3) NULL,
    `libera_reposicao` BOOLEAN NOT NULL DEFAULT false,

    INDEX `solicitacao_escola_id_idx`(`escola_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mensalidade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `escola_id` INTEGER NOT NULL,
    `aluno_id` INTEGER NOT NULL,
    `mes_referencia` VARCHAR(7) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `vencimento` DATE NOT NULL,
    `status` ENUM('pendente', 'paga', 'atrasada', 'cancelada') NOT NULL DEFAULT 'pendente',
    `data_pagamento` DATE NULL,
    `forma_pagamento` VARCHAR(30) NULL,
    `valor_original` DECIMAL(10, 2) NULL,
    `ajuste_motivo` VARCHAR(160) NULL,
    `cancelamento_motivo` VARCHAR(160) NULL,
    `numero_recibo` INTEGER NULL,

    INDEX `mensalidade_escola_id_idx`(`escola_id`),
    INDEX `mensalidade_escola_id_mes_referencia_idx`(`escola_id`, `mes_referencia`),
    UNIQUE INDEX `mensalidade_aluno_id_mes_referencia_key`(`aluno_id`, `mes_referencia`),
    UNIQUE INDEX `mensalidade_escola_id_numero_recibo_key`(`escola_id`, `numero_recibo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

-- CreateTable
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

-- AddForeignKey
ALTER TABLE `feriado` ADD CONSTRAINT `feriado_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario` ADD CONSTRAINT `usuario_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plano` ADD CONSTRAINT `plano_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_plano_id_fkey` FOREIGN KEY (`plano_id`) REFERENCES `plano`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_usuario_resp_id_fkey` FOREIGN KEY (`usuario_resp_id`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horario_disponivel` ADD CONSTRAINT `horario_disponivel_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horario_disponivel` ADD CONSTRAINT `horario_disponivel_professor_id_fkey` FOREIGN KEY (`professor_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_professor_id_fkey` FOREIGN KEY (`professor_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_reposicao_de_id_fkey` FOREIGN KEY (`reposicao_de_id`) REFERENCES `aula`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diario_aula` ADD CONSTRAINT `diario_aula_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diario_aula` ADD CONSTRAINT `diario_aula_aula_id_fkey` FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_aula_id_fkey` FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensalidade` ADD CONSTRAINT `mensalidade_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensalidade` ADD CONSTRAINT `mensalidade_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `redefinicao_senha` ADD CONSTRAINT `redefinicao_senha_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `redefinicao_senha` ADD CONSTRAINT `redefinicao_senha_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerta` ADD CONSTRAINT `alerta_escola_id_fkey` FOREIGN KEY (`escola_id`) REFERENCES `escola`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerta` ADD CONSTRAINT `alerta_mensalidade_id_fkey` FOREIGN KEY (`mensalidade_id`) REFERENCES `mensalidade`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Dados de demonstração (personas da RFC), todos na escola 1
-- ---------------------------------------------------------------------
INSERT INTO `escola` (`id`, `nome`, `codigo`, `atualizado_em`) VALUES
  (1, 'Escola de Música EMMOO', 'emmoo', NOW(3));

INSERT INTO `usuario` (`id`, `escola_id`, `nome`, `email`, `login`, `senha_hash`, `papel`, `atualizado_em`) VALUES
  (1, 1, 'Lucimara', 'lucimara@emmoo.com.br', 'admin', '$2a$10$L9M.muleUZxvERQSBqDQxu1bEbW7hIdpD1XdheQhVNoWtAlHfceti', 'coordenacao', NOW(3)),
  (2, 1, 'Luiz', 'luiz@emmoo.com.br', 'luiz', '$2a$10$MnC6RmpMctl0kMuMX0XFSepbFO5CeJGJ5QIkTkRanLbpVwxvkBZum', 'professor', NOW(3)),
  (3, 1, 'Mary', 'mary@emmoo.com.br', NULL, '$2a$10$U44EddYXea3G0CDkl9eh1OgmbXnhas6xOFpqk4QwoQuX199Cf2Oqa', 'responsavel', NOW(3));

INSERT INTO `plano` (`id`, `escola_id`, `nome`, `tipo`, `valor`, `freq_semanal`, `duracao_min`, `atualizado_em`) VALUES
  (1, 1, 'Particular · 1 aula por semana', 'particular', 140.00, 1, 45, NOW(3)),
  (2, 1, 'Particular · 2 aulas por semana', 'particular', 260.00, 2, 45, NOW(3)),
  (3, 1, 'Grupo · 1 aula por semana', 'grupo', 90.00, 1, 60, NOW(3)),
  (4, 1, 'Grupo · 2 aulas por semana', 'grupo', 170.00, 2, 60, NOW(3));

INSERT INTO `aluno` (`id`, `escola_id`, `nome`, `contato`, `instrumento`, `status`, `plano_id`, `usuario_resp_id`, `atualizado_em`) VALUES
  (1, 1, 'Ana Beatriz', '(47) 99999-0001', 'Violino', 'ativo', 1, 3, NOW(3)),
  (2, 1, 'Pedro Henrique', '(47) 99999-0002', 'Violão', 'ativo', 1, NULL, NOW(3));

-- Horários de atendimento do professor Luiz: segundas (1) e quartas (3), 14:00 às 17:00 (RF04)
INSERT INTO `horario_disponivel` (`escola_id`, `professor_id`, `dia_semana`, `hora_inicio`, `duracao_min`, `disponivel`) VALUES
  (1, 2, 1, '14:00', 45, 1),
  (1, 2, 1, '14:45', 45, 1),
  (1, 2, 1, '15:30', 45, 1),
  (1, 2, 1, '16:15', 45, 1),
  (1, 2, 3, '14:00', 45, 1),
  (1, 2, 3, '14:45', 45, 1),
  (1, 2, 3, '15:30', 45, 1),
  (1, 2, 3, '16:15', 45, 1);

-- Aulas semanais por 8 semanas: Ana às segundas 14:00 e Pedro às quartas 15:30 (a partir de 12/10/2026)
INSERT INTO `aula` (`escola_id`, `aluno_id`, `professor_id`, `data`, `hora`, `duracao_min`, `status`) VALUES
  (1, 1, 2, '2026-10-12', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-10-19', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-10-26', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-11-02', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-11-09', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-11-16', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-11-23', '14:00', 45, 'agendada'),
  (1, 1, 2, '2026-11-30', '14:00', 45, 'agendada'),
  (1, 2, 2, '2026-10-14', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-10-21', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-10-28', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-11-04', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-11-11', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-11-18', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-11-25', '15:30', 45, 'agendada'),
  (1, 2, 2, '2026-12-02', '15:30', 45, 'agendada');
