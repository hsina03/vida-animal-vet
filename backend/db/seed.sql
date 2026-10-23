-- Vida Animal II — Datos iniciales
-- Teléfono, horario y registros de clientes son DATOS DE EJEMPLO: reemplácenlos con los reales de la clínica.
-- Los usuarios del personal se crean con scripts/db-setup.js (para guardar las contraseñas con bcrypt).

SET NAMES utf8mb4;

INSERT INTO configuracion (clave, valor) VALUES
  ('clinica_nombre', 'Vida Animal II'),
  ('telefono', '656 000 0000'),
  ('whatsapp', '526560000000'),
  ('direccion', 'Plaza del Sol, Ciudad Juárez, Chih.'),
  ('duracion_espacio_min', '30'),
  ('citas_simultaneas', '2'),
  ('anticipacion_min', '120');

INSERT INTO horarios (dia_semana, abierto, apertura, cierre) VALUES
  (0, 0, NULL, NULL),
  (1, 1, '09:00', '19:00'),
  (2, 1, '09:00', '19:00'),
  (3, 1, '09:00', '19:00'),
  (4, 1, '09:00', '19:00'),
  (5, 1, '09:00', '19:00'),
  (6, 1, '09:00', '15:00');

INSERT INTO servicios (clave, nombre, grupo, descripcion, icono, duracion_min, agendable, orden) VALUES
  ('consulta',  'Consulta general',                'Salud',                   'Revisión completa, diagnóstico y tratamiento para perros, gatos y otras especies.', 'steth', 30, 1, 1),
  ('vacuna',    'Vacunación y medicina preventiva','Salud',                   'Esquemas de vacunas, desparasitación y control de cachorros y adultos.',            'syr',   30, 1, 2),
  ('cirugia',   'Cirugías y procedimientos',       'Salud',                   'Esterilizaciones y procedimientos clínicos, con valoración previa.',                'pulse', 30, 1, 3),
  ('estudios',  'Estudios complementarios',        'Salud',                   'Apoyo diagnóstico para confirmar lo que observamos en consulta.',                   'flask', 30, 1, 4),
  ('estetica',  'Estética',                        'Cuidado y estancia',      'Baño, corte de pelo y uñas, limpieza de oídos.',                                    'scis',  60, 1, 5),
  ('hosp',      'Hospitalización',                 'Cuidado y estancia',      'Seguimiento médico de pacientes que necesitan quedarse en observación.',            'bed',   30, 0, 6),
  ('hospedaje', 'Hospedaje',                       'Cuidado y estancia',      'Tu mascota se queda con nosotros mientras viajas, bajo vigilancia veterinaria.',    'house', 30, 1, 7),
  ('tienda',    'Medicamentos y productos',        'Tienda y acompañamiento', 'Alimento, medicamentos y accesorios recomendados por nuestros médicos.',            'pill',  30, 0, 8),
  ('cremacion', 'Cremación',                       'Tienda y acompañamiento', 'Acompañamiento respetuoso para despedir a tu compañero.',                           'feather',30,0, 9);

INSERT INTO preguntas_frecuentes (pregunta, respuesta, orden) VALUES
  ('¿Necesito cita para estética?', 'Sí. Los baños y cortes se agendan para asegurar un espacio de una hora. Puedes agendar desde aquí.', 1),
  ('¿Atienden urgencias?', 'Si tu mascota tiene una urgencia, escríbenos por WhatsApp antes de llegar para preparar su atención.', 2),
  ('¿Qué especies atienden?', 'Perros y gatos, y también conejos, aves y otras especies pequeñas. Pregúntanos por la tuya.', 3),
  ('¿Cuánto cuesta una consulta?', 'El costo depende del servicio y del peso de tu mascota. El personal te informa al confirmar tu cita.', 4);

INSERT INTO dias_inhabiles (fecha, motivo) VALUES
  ('2026-11-02', 'Día de Muertos'),
  ('2026-11-16', 'Día de la Revolución'),
  ('2026-12-25', 'Navidad');

-- Registros de ejemplo (ficticios) para demostrar el panel
INSERT INTO propietarios (id, nombre, telefono, correo) VALUES
  (1, 'Sofía Hernández', '6562147790', 'sofia.hdz@correo.com'),
  (2, 'Carlos Ramírez',  '6563810042', 'c.ramirez@correo.com'),
  (3, 'Mariana Torres',  '6561095521', 'mariana.t@correo.com'),
  (4, 'Jorge Medina',    '6564473318', NULL),
  (5, 'Ana Lucía Pérez', '6562906614', 'analu.perez@correo.com'),
  (6, 'Fernanda Ruiz',   '6565328807', 'fer.ruiz@correo.com');

INSERT INTO mascotas (id, propietario_id, nombre, especie, raza, edad, sexo, peso) VALUES
  (1, 1, 'Max',   'Perro', 'Labrador',              '4 años',  'Macho',  '31 kg'),
  (2, 1, 'Nala',  'Perro', 'Golden retriever',      '2 años',  'Hembra', '26 kg'),
  (3, 2, 'Luna',  'Gato',  'Mestizo',               '1 año',   'Hembra', '3.8 kg'),
  (4, 3, 'Coco',  'Perro', 'Poodle',                '6 años',  'Macho',  '7 kg'),
  (5, 4, 'Kiwi',  'Ave',   'Periquito australiano', '2 años',  'Macho',  '38 g'),
  (6, 5, 'Rocky', 'Perro', 'Pitbull',               '3 años',  'Macho',  '24 kg'),
  (7, 6, 'Mishi', 'Gato',  'Siamés',                '5 meses', 'Hembra', '1.9 kg');
