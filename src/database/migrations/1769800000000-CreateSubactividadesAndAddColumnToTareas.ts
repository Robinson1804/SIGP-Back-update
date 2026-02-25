import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para:
 * 1. Crear tabla poi.subactividades (hijos de Actividades Kanban)
 * 2. Agregar columna subactividad_id a agile.tareas
 */
export class CreateSubactividadesAndAddColumnToTareas1769800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='poi' AND table_name='actividades') as e`);
    if (!exists[0]?.e) return;

    // 1. Crear tabla poi.subactividades
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS poi.subactividades (
        id SERIAL PRIMARY KEY,
        actividad_padre_id INTEGER NOT NULL REFERENCES poi.actividades(id) ON DELETE CASCADE,
        codigo VARCHAR(20) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        accion_estrategica_id INTEGER REFERENCES planning.acciones_estrategicas(id),
        clasificacion VARCHAR(50),
        metodo_gestion VARCHAR(20) NOT NULL DEFAULT 'Kanban',
        coordinador_id INTEGER REFERENCES public.usuarios(id),
        gestor_id INTEGER REFERENCES public.usuarios(id),
        coordinacion VARCHAR(100),
        areas_financieras TEXT[],
        monto_anual DECIMAL(15,2),
        anios INTEGER[],
        fecha_inicio DATE,
        fecha_fin DATE,
        estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente',
        activo BOOLEAN NOT NULL DEFAULT true,
        created_by INTEGER REFERENCES public.usuarios(id),
        updated_by INTEGER REFERENCES public.usuarios(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subactividades_actividad_padre_id
      ON poi.subactividades(actividad_padre_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subactividades_coordinador_id
      ON poi.subactividades(coordinador_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subactividades_gestor_id
      ON poi.subactividades(gestor_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subactividades_estado
      ON poi.subactividades(estado)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subactividades_activo
      ON poi.subactividades(activo)
    `);

    // 2. Agregar columna subactividad_id a agile.tareas
    await queryRunner.query(`
      ALTER TABLE agile.tareas
      ADD COLUMN IF NOT EXISTS subactividad_id INTEGER
      REFERENCES poi.subactividades(id) ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tareas_subactividad_id
      ON agile.tareas(subactividad_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE agile.tareas DROP COLUMN IF EXISTS subactividad_id
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS poi.subactividades CASCADE
    `);
  }
}
