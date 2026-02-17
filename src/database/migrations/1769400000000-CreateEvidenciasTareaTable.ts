import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para crear la tabla evidencias_tarea
 *
 * SCRUM: Tarea → Evidencias (tabla evidencias_tarea)
 * Cuando una tarea SCRUM recibe evidencia, su estado cambia a "Finalizado"
 */
export class CreateEvidenciasTareaTable1769400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agile.evidencias_tarea (
        id SERIAL PRIMARY KEY,
        tarea_id INTEGER NOT NULL REFERENCES agile.tareas(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT,
        url VARCHAR(500) NOT NULL,
        tipo VARCHAR(50),
        tamano_bytes BIGINT,
        subido_por INTEGER NOT NULL REFERENCES public.usuarios(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_evidencias_tarea_tarea_id
      ON agile.evidencias_tarea(tarea_id);
    `);

    await queryRunner.query(`
      COMMENT ON TABLE agile.evidencias_tarea IS
      'Evidencias adjuntas a tareas SCRUM. Agregar evidencia finaliza la tarea automáticamente.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS agile.evidencias_tarea CASCADE;`,
    );
  }
}
