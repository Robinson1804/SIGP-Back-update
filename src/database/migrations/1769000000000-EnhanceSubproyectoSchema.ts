import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceSubproyectoSchema1769000000000 implements MigrationInterface {
  name = 'EnhanceSubproyectoSchema1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // STAKEHOLDERS - Agregar roles clave
    // ==========================================

    // Agregar coordinador_id
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS coordinador_id INTEGER REFERENCES public.usuarios(id)
    `);

    // Agregar patrocinador_id
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS patrocinador_id INTEGER REFERENCES public.usuarios(id)
    `);

    // Agregar area_usuaria (array de IDs de usuarios patrocinadores)
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS area_usuaria INTEGER[]
    `);

    // ==========================================
    // ADMINISTRATIVO - Información organizacional
    // ==========================================

    // Agregar coordinacion
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS coordinacion VARCHAR(100)
    `);

    // Agregar area_responsable
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS area_responsable VARCHAR(100)
    `);

    // Agregar clasificacion (Al ciudadano | Gestion interna)
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS clasificacion VARCHAR(50)
    `);

    // ==========================================
    // ALCANCE Y VALOR DE NEGOCIO
    // ==========================================

    // Agregar alcances (array de texto)
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS alcances TEXT[]
    `);

    // Agregar problematica
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS problematica TEXT
    `);

    // Agregar beneficiarios
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS beneficiarios TEXT
    `);

    // Agregar beneficios (array de texto)
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS beneficios TEXT[]
    `);

    // ==========================================
    // FINANCIERO - Mejorar estructura existente
    // ==========================================

    // Agregar costos_anuales (JSONB para [{anio: number, monto: number}])
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS costos_anuales JSONB
    `);

    // Convertir anios de simple-array a INTEGER[]
    // Primero crear columna temporal
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS anios_new INTEGER[]
    `);

    // Migrar datos: convertir "2024,2025,2026" -> {2024, 2025, 2026}
    await queryRunner.query(`
      UPDATE poi.subproyectos
      SET anios_new = string_to_array(anios::text, ',')::INTEGER[]
      WHERE anios IS NOT NULL
    `);

    // Eliminar columna antigua y renombrar
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      DROP COLUMN IF EXISTS anios
    `);

    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      RENAME COLUMN anios_new TO anios
    `);

    // Convertir areas_financieras de simple-array a TEXT[]
    // Primero crear columna temporal
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      ADD COLUMN IF NOT EXISTS areas_financieras_new TEXT[]
    `);

    // Migrar datos
    await queryRunner.query(`
      UPDATE poi.subproyectos
      SET areas_financieras_new = string_to_array(areas_financieras::text, ',')
      WHERE areas_financieras IS NOT NULL
    `);

    // Eliminar columna antigua y renombrar
    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      DROP COLUMN IF EXISTS areas_financieras
    `);

    await queryRunner.query(`
      ALTER TABLE poi.subproyectos
      RENAME COLUMN areas_financieras_new TO areas_financieras
    `);

    // ==========================================
    // ÍNDICES - Mejorar rendimiento de consultas
    // ==========================================

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subproyectos_coordinador ON poi.subproyectos(coordinador_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subproyectos_patrocinador ON poi.subproyectos(patrocinador_id)
    `);

    // ==========================================
    // COMENTARIOS - Documentación de columnas
    // ==========================================

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.coordinador_id IS 'Coordinador responsable del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.patrocinador_id IS 'Patrocinador/sponsor del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.area_usuaria IS 'Array de IDs de usuarios patrocinadores asignados al área usuaria'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.coordinacion IS 'Área de coordinación del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.area_responsable IS 'Área responsable del subproyecto (ej: OTIN, OGD, etc.)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.clasificacion IS 'Clasificación del subproyecto: Al ciudadano | Gestion interna'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.alcances IS 'Lista de items que describen el alcance del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.problematica IS 'Problemática identificada que el subproyecto busca resolver'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.beneficiarios IS 'Beneficiarios del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.beneficios IS 'Lista de beneficios esperados del subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.costos_anuales IS 'Costos estimados por año en formato JSON [{anio: number, monto: number}]'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.anios IS 'Array de años en los que se ejecuta el subproyecto'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN poi.subproyectos.areas_financieras IS 'Array de áreas financieras involucradas'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS poi.idx_subproyectos_coordinador`);
    await queryRunner.query(`DROP INDEX IF EXISTS poi.idx_subproyectos_patrocinador`);

    // Revertir anios y areas_financieras a simple-array (conversión inversa difícil, mejor dejar como está en down)
    // En un rollback real, se perdería data formatting, pero la data permanecería

    // Eliminar columnas agregadas
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS coordinador_id`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS patrocinador_id`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS area_usuaria`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS coordinacion`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS area_responsable`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS clasificacion`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS alcances`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS problematica`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS beneficiarios`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS beneficios`);
    await queryRunner.query(`ALTER TABLE poi.subproyectos DROP COLUMN IF EXISTS costos_anuales`);
  }
}
