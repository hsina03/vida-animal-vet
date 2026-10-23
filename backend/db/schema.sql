-- Vida Animal II — Esquema de base de datos (MySQL 8)
-- Requerimientos: RF-01 a RF-18, RNF-01, RNF-05 (ver docs/requerimientos.md)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS solicitudes;
DROP TABLE IF EXISTS citas;
DROP TABLE IF EXISTS mascotas;
DROP TABLE IF EXISTS propietarios;
DROP TABLE IF EXISTS servicios;
DROP TABLE IF EXISTS horarios;
DROP TABLE IF EXISTS dias_inhabiles;
DROP TABLE IF EXISTS configuracion;
DROP TABLE IF EXISTS preguntas_frecuentes;
DROP TABLE IF EXISTS usuarios;

SET FOREIGN_KEY_CHECKS = 1;

-- RF-01, RF-02: usuarios del personal y su rol
CREATE TABLE usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  usuario         VARCHAR(40)  NOT NULL UNIQUE,
  password_hash   VARCHAR(100) NOT NULL,
  rol             ENUM('admin','operativo') NOT NULL DEFAULT 'operativo',
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso   DATETIME NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-16, RF-18
CREATE TABLE propietarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  telefono        VARCHAR(20)  NOT NULL,
  correo          VARCHAR(120) NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_propietario_telefono (telefono),
  KEY idx_propietario_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-17, RF-18
CREATE TABLE mascotas (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id  INT UNSIGNED NOT NULL,
  nombre          VARCHAR(60)  NOT NULL,
  especie         VARCHAR(30)  NOT NULL,
  raza            VARCHAR(60)  NULL,
  edad            VARCHAR(30)  NULL,
  sexo            ENUM('Macho','Hembra') NULL,
  -- El peso se guarda como texto con su unidad (kg o g) porque la clínica atiende aves y especies pequeñas
  peso            VARCHAR(20)  NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mascota_propietario FOREIGN KEY (propietario_id) REFERENCES propietarios(id) ON DELETE CASCADE,
  KEY idx_mascota_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-04: catálogo de servicios publicado en el sitio
CREATE TABLE servicios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clave           VARCHAR(30)  NOT NULL UNIQUE,
  nombre          VARCHAR(80)  NOT NULL,
  grupo           VARCHAR(60)  NOT NULL,
  descripcion     VARCHAR(300) NOT NULL,
  icono           VARCHAR(20)  NOT NULL DEFAULT 'paw',
  duracion_min    SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  agendable       TINYINT(1) NOT NULL DEFAULT 1,
  visible         TINYINT(1) NOT NULL DEFAULT 1,
  orden           SMALLINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-15: horario semanal (0 = domingo ... 6 = sábado, igual que Date.getDay())
CREATE TABLE horarios (
  dia_semana      TINYINT UNSIGNED PRIMARY KEY,
  abierto         TINYINT(1) NOT NULL DEFAULT 1,
  apertura        TIME NULL,
  cierre          TIME NULL,
  CONSTRAINT chk_dia CHECK (dia_semana BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- RF-15: días sin servicio
CREATE TABLE dias_inhabiles (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fecha           DATE NOT NULL UNIQUE,
  motivo          VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-03, RF-05, RF-15: parámetros generales (contacto, reglas de agenda)
CREATE TABLE configuracion (
  clave           VARCHAR(40) PRIMARY KEY,
  valor           VARCHAR(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-07: preguntas frecuentes del chatbot
CREATE TABLE preguntas_frecuentes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pregunta        VARCHAR(160) NOT NULL,
  respuesta       VARCHAR(500) NOT NULL,
  activa          TINYINT(1) NOT NULL DEFAULT 1,
  orden           SMALLINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-11 a RF-14, RNF-05
CREATE TABLE citas (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  propietario_id      INT UNSIGNED NOT NULL,
  mascota_id          INT UNSIGNED NOT NULL,
  servicio_id         INT UNSIGNED NOT NULL,
  fecha               DATE NOT NULL,
  hora                TIME NOT NULL,
  estado              ENUM('pendiente','confirmada','atendida','cancelada','reprogramada') NOT NULL DEFAULT 'pendiente',
  origen              ENUM('chat','personal') NOT NULL DEFAULT 'personal',
  motivo_cancelacion  VARCHAR(120) NULL,
  notas               VARCHAR(300) NULL,
  creado_por          INT UNSIGNED NULL,
  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cita_propietario FOREIGN KEY (propietario_id) REFERENCES propietarios(id),
  CONSTRAINT fk_cita_mascota     FOREIGN KEY (mascota_id)     REFERENCES mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cita_servicio    FOREIGN KEY (servicio_id)    REFERENCES servicios(id),
  CONSTRAINT fk_cita_usuario     FOREIGN KEY (creado_por)     REFERENCES usuarios(id) ON DELETE SET NULL,
  KEY idx_cita_fecha_hora (fecha, hora),
  KEY idx_cita_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- RF-06 a RF-10: conversaciones del asistente que requieren acción del personal
CREATE TABLE solicitudes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  folio           VARCHAR(12) NOT NULL UNIQUE,
  tipo            ENUM('cita','canalizacion') NOT NULL,
  estado          ENUM('nueva','urgente','requiere_atencion','registrada','resuelta') NOT NULL DEFAULT 'nueva',
  nombre          VARCHAR(120) NULL,
  telefono        VARCHAR(20)  NULL,
  mascota         VARCHAR(60)  NULL,
  especie         VARCHAR(30)  NULL,
  servicio_id     INT UNSIGNED NULL,
  cita_id         INT UNSIGNED NULL,
  tema            VARCHAR(200) NULL,
  conversacion    JSON NOT NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sol_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_sol_cita     FOREIGN KEY (cita_id)     REFERENCES citas(id) ON DELETE SET NULL,
  KEY idx_sol_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
