import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Actualizar ENUM de estado de Historia Usuario
 *
 * Problema: PostgreSQL rechaza 'En revisión' porque el ENUM tiene 'En revision' (sin acento)
 * Solución: Recrear el ENUM con el valor correcto
 */
export class UpdateHuEstadoEnum1769300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Primero convertir la columna a text para poder manipular los datos
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado DROP DEFAULT;
    `);

    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE text
        USING estado::text;
    `);

    // 2. Actualizar TODOS los datos: 'En revision' → 'En revisión'
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revisión'
      WHERE estado = 'En revision';
    `);

    // 3. Verificar que no queden registros con el valor antiguo
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revisión'
      WHERE estado LIKE '%revision%' AND estado != 'En revisión';
    `);

    // 4. Crear el nuevo enum con los valores correctos
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'historia_usuario_estado_enum_new') THEN
          CREATE TYPE agile.historia_usuario_estado_enum_new AS ENUM (
            'Por hacer',
            'En progreso',
            'En revisión',
            'Finalizado'
          );
        END IF;
      END $$;
    `);

    // 5. Convertir la columna al nuevo tipo enum
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE agile.historia_usuario_estado_enum_new
        USING estado::agile.historia_usuario_estado_enum_new;
    `);

    // 6. Eliminar el enum antiguo
    await queryRunner.query(`
      DROP TYPE IF EXISTS agile.historia_usuario_estado_enum;
    `);

    // 7. Renombrar el nuevo enum al nombre original
    await queryRunner.query(`
      ALTER TYPE agile.historia_usuario_estado_enum_new
        RENAME TO historia_usuario_estado_enum;
    `);

    // 8. Restaurar el default
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado SET DEFAULT 'Por hacer'::agile.historia_usuario_estado_enum;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: volver a 'En revision' sin acento

    // 1. Quitar default
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado DROP DEFAULT;
    `);

    // 2. Convertir columna a text
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE text
        USING estado::text;
    `);

    // 3. Actualizar datos: 'En revisión' → 'En revision'
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revision'
      WHERE estado = 'En revisión';
    `);

    // 4. Crear enum con valor antiguo
    await queryRunner.query(`
      CREATE TYPE agile.historia_usuario_estado_enum_old AS ENUM (
        'Por hacer',
        'En progreso',
        'En revision',
        'Finalizado'
      );
    `);

    // 5. Convertir al enum antiguo
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE agile.historia_usuario_estado_enum_old
        USING estado::agile.historia_usuario_estado_enum_old;
    `);

    // 6. Eliminar enum nuevo
    await queryRunner.query(`
      DROP TYPE IF EXISTS agile.historia_usuario_estado_enum;
    `);

    // 7. Renombrar
    await queryRunner.query(`
      ALTER TYPE agile.historia_usuario_estado_enum_old
        RENAME TO historia_usuario_estado_enum;
    `);

    // 8. Restaurar default
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado SET DEFAULT 'Por hacer'::agile.historia_usuario_estado_enum;
    `);
  }
}
