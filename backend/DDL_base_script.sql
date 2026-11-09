-- =====================================================
-- Vida Animal II - Script DDL (MySQL 8.0.16+)
-- =====================================================
CREATE DATABASE IF NOT EXISTS vida_animal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE vida_animal;

-- ---------- Usuarios del sistema (solo personal) ----------
CREATE TABLE rol (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE usuario (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  id_rol INT NOT NULL,
  nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

-- ---------- Propietarios y mascotas ----------
CREATE TABLE propietario (
  id_propietario INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  correo VARCHAR(100) NULL,
  fecha_registro DATE NOT NULL DEFAULT (CURRENT_DATE),
  INDEX idx_propietario_nombre (nombre),
  INDEX idx_propietario_whatsapp (whatsapp)
);

CREATE TABLE mascota (
  id_mascota INT AUTO_INCREMENT PRIMARY KEY,
  id_propietario INT NOT NULL,
  nombre VARCHAR(50) NOT NULL,
  especie VARCHAR(50) NOT NULL,
  raza VARCHAR(50) NULL,
  edad TINYINT UNSIGNED NULL,           -- en años, la actualiza el personal
  sexo ENUM('Macho','Hembra') NULL,
  peso DECIMAL(5,2) NULL,               -- en kg
  CONSTRAINT fk_mascota_propietario FOREIGN KEY (id_propietario)
    REFERENCES propietario(id_propietario),
  INDEX idx_mascota_nombre (nombre)
);

-- ---------- Servicios ----------
CREATE TABLE categoria_servicio (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE servicio (
  id_servicio INT AUTO_INCREMENT PRIMARY KEY,
  id_categoria INT NOT NULL,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  publicado BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_servicio_categoria FOREIGN KEY (id_categoria)
    REFERENCES categoria_servicio(id_categoria)
);

-- ---------- Citas (solicitud y cita en una sola tabla) ----------
CREATE TABLE cita (
  id_cita INT AUTO_INCREMENT PRIMARY KEY,   -- sirve como folio
  id_mascota INT NOT NULL,
  id_servicio INT NOT NULL,
  id_usuario INT NULL,                      -- veterinario asignado (opcional)
  fecha DATE NOT NULL,
  hora TIME NOT NULL,                       -- hora de inicio
  estado ENUM('pendiente','confirmada','atendida','cancelada')
    NOT NULL DEFAULT 'pendiente',
  tipo ENUM('normal','urgencia') NOT NULL DEFAULT 'normal',
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cita_mascota  FOREIGN KEY (id_mascota)  REFERENCES mascota(id_mascota),
  CONSTRAINT fk_cita_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio),
  CONSTRAINT fk_cita_usuario  FOREIGN KEY (id_usuario)  REFERENCES usuario(id_usuario),
  INDEX idx_cita_fecha_hora (fecha, hora),
  INDEX idx_cita_estado (estado)
);

-- ---------- Horario de atención ----------
CREATE TABLE horario_atencion (
  id_horario INT AUTO_INCREMENT PRIMARY KEY,
  dia_semana ENUM('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')
    NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  hora_apertura TIME NULL,
  hora_cierre TIME NULL,
  CONSTRAINT chk_horario CHECK (
    activo = FALSE OR (hora_apertura IS NOT NULL AND hora_cierre IS NOT NULL
                       AND hora_apertura < hora_cierre)
  )
);
