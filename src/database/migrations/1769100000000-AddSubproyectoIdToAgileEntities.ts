import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubproyectoIdToAgileEntities1769100000000 implements MigrationInterface {
  name = 'AddSubproyectoIdToAgileEntities1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // SPRINTS - Agregar subproyecto_id
    // ==========================================

    // Agregar columna subproyecto_id
    await queryRunner.query(`
      ALTER TABLE agile.sprints
      ADD COLUMN IF NOT EXISTS subproyecto_id INTEGER
    `);

    // Agregar foreign key
    await queryRunner.query(`
      ALTER TABLE agile.sprints
      ADD CONSTRAINT fk_sprints_subproyecto
      FOREIGN KEY (subproyecto_id)
      REFERENCES poi.subproyectos(id)
      ON DELETE CASCADE
    `);

    // Agregar constraint: debe pertenecer a proyecto O subproyecto (no ambos, no ninguno)
    await queryRunner.query(`
      ALTER TABLE agile.sprints
      ADD CONSTRAINT chk_sprints_proyecto_or_subproyecto
      CHECK (
        (proyecto_id IS NOT NULL AND subproyecto_id IS NULL) OR
        (proyecto_id IS NULL AND subproyecto_id IS NOT NULL)
      )
    `);

    // Agregar índice
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sprints_subproyecto ON agile.sprints(subproyecto_id)
    `);

    // ==========================================
    // EPICAS - Agregar subproyecto_id
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE agile.epicas
      ADD COLUMN IF NOT EXISTS subproyecto_id INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE agile.epicas
      ADD CONSTRAINT fk_epicas_subproyecto
      FOREIGN KEY (subproyecto_id)
      REFERENCES poi.subproyectos(id)
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE agile.epicas
      ADD CONSTRAINT chk_epicas_proyecto_or_subproyecto
      CHECK (
        (proyecto_id IS NOT NULL AND subproyecto_id IS NULL) OR
        (proyecto_id IS NULL AND subproyecto_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_epicas_subproyecto ON agile.epicas(subproyecto_id)
    `);

    // ==========================================
    // HISTORIAS_USUARIO - Agregar subproyecto_id
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
      ADD COLUMN IF NOT EXISTS subproyecto_id INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
      ADD CONSTRAINT fk_historias_usuario_subproyecto
      FOREIGN KEY (subproyecto_id)
      REFERENCES poi.subproyectos(id)
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
      ADD CONSTRAINT chk_historias_usuario_proyecto_or_subproyecto
      CHECK (
        (proyecto_id IS NOT NULL AND subproyecto_id IS NULL) OR
        (proyecto_id IS NULL AND subproyecto_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_historias_usuario_subproyecto ON agile.historias_usuario(subproyecto_id)
    `);

    // ==========================================
    // DAILY_MEETINGS - Agregar subproyecto_id
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE agile.daily_meetings
      ADD COLUMN IF NOT EXISTS subproyecto_id INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE agile.daily_meetings
      ADD CONSTRAINT fk_daily_meetings_subproyecto
      FOREIGN KEY (subproyecto_id)
      REFERENCES poi.subproyectos(id)
      ON DELETE CASCADE
    `);

    // Daily meetings puede tener proyecto_id Y subproyecto_id ambos null (meetings sin contexto)
    // pero si tiene uno, no puede tener el otro
    await queryRunner.query(`
      ALTER TABLE agile.daily_meetings
      ADD CONSTRAINT chk_daily_meetings_proyecto_or_subproyecto
      CHECK (
        NOT (proyecto_id IS NOT NULL AND subproyecto_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_meetings_subproyecto ON agile.daily_meetings(subproyecto_id)
    `);

    // ==========================================
    // IMPEDIMENTOS - Agregar subproyecto_id
    // ==========================================

    await queryRunner.query(`
      ALTER TABLE agile.impedimentos
      ADD COLUMN IF NOT EXISTS subproyecto_id INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE agile.impedimentos
      ADD CONSTRAINT fk_impedimentos_subproyecto
      FOREIGN KEY (subproyecto_id)
      REFERENCES poi.subproyectos(id)
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE agile.impedimentos
      ADD CONSTRAINT chk_impedimentos_proyecto_or_subproyecto
      CHECK (
        (proyecto_id IS NOT NULL AND subproyecto_id IS NULL) OR
        (proyecto_id IS NULL AND subproyecto_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_impedimentos_subproyecto ON agile.impedimentos(subproyecto_id)
    `);

    // ==========================================
    // COMENTARIOS - Documentación
    // ==========================================

    await queryRunner.query(`
      COMMENT ON COLUMN agile.sprints.subproyecto_id IS 'ID del subproyecto al que pertenece el sprint (mutuamente exclusivo con proyecto_id)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN agile.epicas.subproyecto_id IS 'ID del subproyecto al que pertenece la épica (mutuamente exclusivo con proyecto_id)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN agile.historias_usuario.subproyecto_id IS 'ID del subproyecto al que pertenece la HU (mutuamente exclusivo con proyecto_id)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN agile.daily_meetings.subproyecto_id IS 'ID del subproyecto al que pertenece el daily (mutuamente exclusivo con proyecto_id)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN agile.impedimentos.subproyecto_id IS 'ID del subproyecto al que pertenece el impedimento (mutuamente exclusivo con proyecto_id)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar constraints CHECK primero
    await queryRunner.query(`ALTER TABLE agile.sprints DROP CONSTRAINT IF EXISTS chk_sprints_proyecto_or_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.epicas DROP CONSTRAINT IF EXISTS chk_epicas_proyecto_or_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.historias_usuario DROP CONSTRAINT IF EXISTS chk_historias_usuario_proyecto_or_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.daily_meetings DROP CONSTRAINT IF EXISTS chk_daily_meetings_proyecto_or_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.impedimentos DROP CONSTRAINT IF EXISTS chk_impedimentos_proyecto_or_subproyecto`);

    // Eliminar foreign keys
    await queryRunner.query(`ALTER TABLE agile.sprints DROP CONSTRAINT IF EXISTS fk_sprints_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.epicas DROP CONSTRAINT IF EXISTS fk_epicas_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.historias_usuario DROP CONSTRAINT IF EXISTS fk_historias_usuario_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.daily_meetings DROP CONSTRAINT IF EXISTS fk_daily_meetings_subproyecto`);
    await queryRunner.query(`ALTER TABLE agile.impedimentos DROP CONSTRAINT IF EXISTS fk_impedimentos_subproyecto`);

    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS agile.idx_sprints_subproyecto`);
    await queryRunner.query(`DROP INDEX IF EXISTS agile.idx_epicas_subproyecto`);
    await queryRunner.query(`DROP INDEX IF EXISTS agile.idx_historias_usuario_subproyecto`);
    await queryRunner.query(`DROP INDEX IF EXISTS agile.idx_daily_meetings_subproyecto`);
    await queryRunner.query(`DROP INDEX IF EXISTS agile.idx_impedimentos_subproyecto`);

    // Eliminar columnas
    await queryRunner.query(`ALTER TABLE agile.sprints DROP COLUMN IF EXISTS subproyecto_id`);
    await queryRunner.query(`ALTER TABLE agile.epicas DROP COLUMN IF EXISTS subproyecto_id`);
    await queryRunner.query(`ALTER TABLE agile.historias_usuario DROP COLUMN IF EXISTS subproyecto_id`);
    await queryRunner.query(`ALTER TABLE agile.daily_meetings DROP COLUMN IF EXISTS subproyecto_id`);
    await queryRunner.query(`ALTER TABLE agile.impedimentos DROP COLUMN IF EXISTS subproyecto_id`);
  }
}
