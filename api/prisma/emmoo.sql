-- =====================================================================
-- EMMOO — banco de dados para MySQL/MariaDB (XAMPP)
-- Gerado a partir de api/prisma/schema.prisma (prisma migrate diff) + dados de demonstração.
--
-- Como importar no XAMPP:
--   phpMyAdmin (http://localhost/phpmyadmin) → aba "Importar" → escolher este arquivo → "Importar".
--   O script cria o banco "emmoo". ATENÇÃO: se ele já existir, as tabelas são apagadas e recriadas.
--
-- Usuários de demonstração (senha: emmoo123 — apenas para desenvolvimento):
--   lucimara@emmoo.com.br (coordenação) · luiz@emmoo.com.br (professor) · mary@emmoo.com.br (responsável)
-- =====================================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `emmoo` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `emmoo`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `mensalidade`, `solicitacao`, `diario_aula`, `aula`, `horario_disponivel`, `aluno`, `plano`, `usuario`;
SET FOREIGN_KEY_CHECKS = 1;

-- CreateTable
CREATE TABLE `usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `senha_hash` VARCHAR(100) NOT NULL,
    `papel` ENUM('coordenacao', 'professor', 'responsavel') NOT NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuario_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plano` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(80) NOT NULL,
    `tipo` ENUM('particular', 'grupo') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `freq_semanal` INTEGER NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aluno` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `contato` VARCHAR(120) NOT NULL,
    `instrumento` VARCHAR(60) NOT NULL,
    `status` ENUM('ativo', 'inativo') NOT NULL DEFAULT 'ativo',
    `plano_id` INTEGER NOT NULL,
    `usuario_resp_id` INTEGER NULL,
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizado_em` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horario_disponivel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `professor_id` INTEGER NOT NULL,
    `dia_semana` INTEGER NOT NULL,
    `hora_inicio` VARCHAR(5) NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `disponivel` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `horario_disponivel_professor_id_dia_semana_hora_inicio_key`(`professor_id`, `dia_semana`, `hora_inicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `aluno_id` INTEGER NOT NULL,
    `professor_id` INTEGER NOT NULL,
    `data` DATE NOT NULL,
    `hora` VARCHAR(5) NOT NULL,
    `duracao_min` INTEGER NOT NULL DEFAULT 45,
    `status` ENUM('agendada', 'realizada', 'falta', 'cancelada') NOT NULL DEFAULT 'agendada',
    `criado_em` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aula_professor_id_data_idx`(`professor_id`, `data`),
    INDEX `aula_aluno_id_data_idx`(`aluno_id`, `data`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diario_aula` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `aula_id` INTEGER NOT NULL,
    `conteudo_ministrado` TEXT NOT NULL,
    `plano_proxima` TEXT NULL,

    UNIQUE INDEX `diario_aula_aula_id_key`(`aula_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `solicitacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `aluno_id` INTEGER NOT NULL,
    `aula_id` INTEGER NULL,
    `tipo` ENUM('falta', 'reposicao') NOT NULL,
    `data_solicitacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('pendente', 'aprovada', 'recusada') NOT NULL DEFAULT 'pendente',
    `nova_data` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mensalidade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `aluno_id` INTEGER NOT NULL,
    `mes_referencia` VARCHAR(7) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `vencimento` DATE NOT NULL,
    `status` ENUM('pendente', 'paga', 'atrasada') NOT NULL DEFAULT 'pendente',
    `data_pagamento` DATE NULL,
    `forma_pagamento` VARCHAR(30) NULL,

    UNIQUE INDEX `mensalidade_aluno_id_mes_referencia_key`(`aluno_id`, `mes_referencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_plano_id_fkey` FOREIGN KEY (`plano_id`) REFERENCES `plano`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aluno` ADD CONSTRAINT `aluno_usuario_resp_id_fkey` FOREIGN KEY (`usuario_resp_id`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horario_disponivel` ADD CONSTRAINT `horario_disponivel_professor_id_fkey` FOREIGN KEY (`professor_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aula` ADD CONSTRAINT `aula_professor_id_fkey` FOREIGN KEY (`professor_id`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diario_aula` ADD CONSTRAINT `diario_aula_aula_id_fkey` FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitacao` ADD CONSTRAINT `solicitacao_aula_id_fkey` FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensalidade` ADD CONSTRAINT `mensalidade_aluno_id_fkey` FOREIGN KEY (`aluno_id`) REFERENCES `aluno`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Dados de demonstração (personas da RFC)
-- ---------------------------------------------------------------------
INSERT INTO `usuario` (`id`, `nome`, `email`, `senha_hash`, `papel`, `atualizado_em`) VALUES
  (1, 'Lucimara', 'lucimara@emmoo.com.br', '$2a$10$qKAv864RrKatTsOiuKfLJui66ua7YnzG17dMG3qNlxaFU.21PShBi', 'coordenacao', NOW(3)),
  (2, 'Luiz', 'luiz@emmoo.com.br', '$2a$10$qKAv864RrKatTsOiuKfLJui66ua7YnzG17dMG3qNlxaFU.21PShBi', 'professor', NOW(3)),
  (3, 'Mary', 'mary@emmoo.com.br', '$2a$10$qKAv864RrKatTsOiuKfLJui66ua7YnzG17dMG3qNlxaFU.21PShBi', 'responsavel', NOW(3));

INSERT INTO `plano` (`id`, `nome`, `tipo`, `valor`, `freq_semanal`, `duracao_min`, `atualizado_em`) VALUES
  (1, 'Particular 1x/semana', 'particular', 140.00, 1, 45, NOW(3));

INSERT INTO `aluno` (`id`, `nome`, `contato`, `instrumento`, `status`, `plano_id`, `usuario_resp_id`, `atualizado_em`) VALUES
  (1, 'Ana Beatriz', '(47) 99999-0001', 'Violino', 'ativo', 1, 3, NOW(3)),
  (2, 'Pedro Henrique', '(47) 99999-0002', 'Violão', 'ativo', 1, NULL, NOW(3));

-- Horários de atendimento do professor Luiz: segundas (1) e quartas (3), 14:00 às 17:00 (RF04)
INSERT INTO `horario_disponivel` (`professor_id`, `dia_semana`, `hora_inicio`, `duracao_min`, `disponivel`) VALUES
  (2, 1, '14:00', 45, 1),
  (2, 1, '14:45', 45, 1),
  (2, 1, '15:30', 45, 1),
  (2, 1, '16:15', 45, 1),
  (2, 3, '14:00', 45, 1),
  (2, 3, '14:45', 45, 1),
  (2, 3, '15:30', 45, 1),
  (2, 3, '16:15', 45, 1);

-- Aulas semanais por 8 semanas: Ana às segundas 14:00 e Pedro às quartas 15:30 (a partir de 28/09/2026)
INSERT INTO `aula` (`aluno_id`, `professor_id`, `data`, `hora`, `duracao_min`, `status`) VALUES
  (1, 2, '2026-09-28', '14:00', 45, 'agendada'),
  (1, 2, '2026-10-05', '14:00', 45, 'agendada'),
  (1, 2, '2026-10-12', '14:00', 45, 'agendada'),
  (1, 2, '2026-10-19', '14:00', 45, 'agendada'),
  (1, 2, '2026-10-26', '14:00', 45, 'agendada'),
  (1, 2, '2026-11-02', '14:00', 45, 'agendada'),
  (1, 2, '2026-11-09', '14:00', 45, 'agendada'),
  (1, 2, '2026-11-16', '14:00', 45, 'agendada'),
  (2, 2, '2026-09-30', '15:30', 45, 'agendada'),
  (2, 2, '2026-10-07', '15:30', 45, 'agendada'),
  (2, 2, '2026-10-14', '15:30', 45, 'agendada'),
  (2, 2, '2026-10-21', '15:30', 45, 'agendada'),
  (2, 2, '2026-10-28', '15:30', 45, 'agendada'),
  (2, 2, '2026-11-04', '15:30', 45, 'agendada'),
  (2, 2, '2026-11-11', '15:30', 45, 'agendada'),
  (2, 2, '2026-11-18', '15:30', 45, 'agendada');
