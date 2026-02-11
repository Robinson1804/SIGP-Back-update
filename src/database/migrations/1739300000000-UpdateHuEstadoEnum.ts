import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Actualizar ENUM de estado de Historia Usuario
 *
 * Problema: PostgreSQL rechaza 'En revisión' porque el ENUM tiene 'En revision' (sin acento)
 * Solución: Recrear el ENUM con el valor correcto
 */
export class UpdateHuEstadoEnum1739300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear un enum temporal con los valores correctos
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

    // 2. Actualizar la columna para usar el nuevo enum
    // Primero convertir a text, luego al nuevo enum
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE text;
    `);

    // 3. Actualizar datos: 'En revision' → 'En revisión'
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revisión'
      WHERE estado = 'En revision';
    `);

    // 4. Convertir la columna al nuevo tipo enum
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE agile.historia_usuario_estado_enum_new
        USING estado::agile.historia_usuario_estado_enum_new;
    `);

    // 5. Eliminar el enum antiguo si existe
    await queryRunner.query(`
      DROP TYPE IF EXISTS agile.historia_usuario_estado_enum CASCADE;
    `);

    // 6. Renombrar el nuevo enum al nombre original
    await queryRunner.query(`
      ALTER TYPE agile.historia_usuario_estado_enum_new
        RENAME TO historia_usuario_estado_enum;
    `);

    // 7. Restaurar el default
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado SET DEFAULT 'Por hacer';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: volver a 'En revision' sin acento

    // 1. Crear enum con valor antiguo
    await queryRunner.query(`
      CREATE TYPE agile.historia_usuario_estado_enum_old AS ENUM (
        'Por hacer',
        'En progreso',
        'En revision',
        'Finalizado'
      );
    `);

    // 2. Convertir columna a text
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE text;
    `);

    // 3. Actualizar datos: 'En revisión' → 'En revision'
    await queryRunner.query(`
      UPDATE agile.historias_usuario
      SET estado = 'En revision'
      WHERE estado = 'En revisión';
    `);

    // 4. Convertir al enum antiguo
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado TYPE agile.historia_usuario_estado_enum_old
        USING estado::agile.historia_usuario_estado_enum_old;
    `);

    // 5. Eliminar enum nuevo
    await queryRunner.query(`
      DROP TYPE IF EXISTS agile.historia_usuario_estado_enum CASCADE;
    `);

    // 6. Renombrar
    await queryRunner.query(`
      ALTER TYPE agile.historia_usuario_estado_enum_old
        RENAME TO historia_usuario_estado_enum;
    `);

    // 7. Restaurar default
    await queryRunner.query(`
      ALTER TABLE agile.historias_usuario
        ALTER COLUMN estado SET DEFAULT 'Por hacer';
    `);
  }
}
