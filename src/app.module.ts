import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@nestjs-modules/ioredis';

// Solo migraciones nuevas (las antiguas se registran via pre-init bootstrap)
import { FixHuEstadoEnRevision1769200000000 } from './database/migrations/1769200000000-FixHuEstadoEnRevision';
import { UpdateHuEstadoEnum1769300000000 } from './database/migrations/1769300000000-UpdateHuEstadoEnum';
import { CreateEvidenciasTareaTable1769400000000 } from './database/migrations/1769400000000-CreateEvidenciasTareaTable';
import { CreateSubactividadesAndAddColumnToTareas1769800000000 } from './database/migrations/1769800000000-CreateSubactividadesAndAddColumnToTareas';

// Config imports
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import appConfig from './config/app.config';


// Module imports
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlanningModule } from './modules/planning/planning.module';
import { PoiModule } from './modules/poi/poi.module';
import { AgileModule } from './modules/agile/agile.module';
import { RrhhModule } from './modules/rrhh/rrhh.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { StorageModule } from './modules/storage/storage.module';

// Migraciones antiguas ya aplicadas en la BD (via synchronize previo).
// Se registran antes de que TypeORM inicialice para que no intente re-ejecutarlas.
const LEGACY_MIGRATIONS = [
  { timestamp: 1000000000000, name: 'BootstrapMigrationsHistory1000000000000' },
  { timestamp: 1734153600000, name: 'CreateSchemas1734153600000' },
  { timestamp: 1734153700000, name: 'CreateFunctionsAndTriggers1734153700000' },
  { timestamp: 1734200000000, name: 'AddUsernameToUsuarios1734200000000' },
  { timestamp: 1734800000000, name: 'AddActasFields1734800000000' },
  { timestamp: 1766400000000, name: 'AddKanbanFeatures1766400000000' },
  { timestamp: 1766500000000, name: 'RestructurePgdHierarchy1766500000000' },
  { timestamp: 1766600000000, name: 'AddProyectoExtendedFields1766600000000' },
  { timestamp: 1766700000000, name: 'RRHHRestructure1766700000000' },
  { timestamp: 1766800000000, name: 'AddDocumentoArchivoFields1766800000000' },
  { timestamp: 1766900000000, name: 'RemoveRequerimientoApprovalFields1766900000000' },
  { timestamp: 1767000000000, name: 'AddCronogramaApprovalFields1767000000000' },
  { timestamp: 1767100000000, name: 'FixNotificacionTimestamps1767100000000' },
  { timestamp: 1767200000000, name: 'AddValidacionesNotificationType1767200000000' },
  { timestamp: 1767300000000, name: 'AddActaApprovalFields1767300000000' },
  { timestamp: 1767400000000, name: 'AddHistoriaUsuarioExtendedFields1767400000000' },
  { timestamp: 1767500000000, name: 'SimplifyCriteriosAceptacion1767500000000' },
  { timestamp: 1767600000000, name: 'ChangePrioridadToAltaMediaBaja1767600000000' },
  { timestamp: 1767700000000, name: 'RemoveNotasFromHistoriaUsuario1767700000000' },
  { timestamp: 1767800000000, name: 'ChangeHuEstadoToSimple1767800000000' },
  { timestamp: 1767900000000, name: 'ChangeSprintEstadoToSimple1767900000000' },
  { timestamp: 1768000000000, name: 'RemoveEvidenciaUrlFromTareas1768000000000' },
  { timestamp: 1768100000000, name: 'RefactorEvidenciasSystem1768100000000' },
  { timestamp: 1768200000000, name: 'ChangeTareaCronogramaEstado1768200000000' },
  { timestamp: 1768300000000, name: 'ChangeResponsableToAsignadoA1768300000000' },
  { timestamp: 1768400000000, name: 'AddGestorIdToActividades1768400000000' },
  { timestamp: 1768500000000, name: 'UpdateProyectosEstadoAutomatico1768500000000' },
  { timestamp: 1768600000000, name: 'AddRequiereCambioPassword1768600000000' },
  { timestamp: 1768700000000, name: 'AddAreaUsuariaToProyectos1768700000000' },
  { timestamp: 1768800000000, name: 'AddActivoToNotificaciones1768800000000' },
  { timestamp: 1768900000000, name: 'AddActividadIdToNotificaciones1768900000000' },
  { timestamp: 1769000000000, name: 'EnhanceSubproyectoSchema1769000000000' },
  { timestamp: 1769100000000, name: 'AddSubproyectoIdToAgileEntities1769100000000' },
  { timestamp: 1769500000000, name: 'RemovePatrocinadorIdFromProyectos1769500000000' },
  { timestamp: 1769600000000, name: 'ChangeSubproyectoAreaUsuariaToSingular1769600000000' },
  { timestamp: 1769700000000, name: 'ChangeProyectoAreaUsuariaToSingular1769700000000' },
];

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig, appConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // TypeORM
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const sslConfig = config.get('database.ssl');
        const { Client } = await import('pg');

        const clientConfig = {
          host: config.get('database.host'),
          port: config.get('database.port'),
          user: config.get('database.username'),
          password: config.get('database.password'),
          database: config.get('database.database'),
          ssl: sslConfig,
        };

        // Pre-init: crear schemas y registrar migraciones antiguas ANTES de que TypeORM inicialice.
        // Esto es crítico: TypeORM pre-calcula migraciones pendientes al inicializar.
        // Si registramos las antiguas aquí, TypeORM no las ejecutará.
        const client = new Client(clientConfig);
        try {
          await client.connect();

          // Crear schemas si no existen
          const schemas = ['planning', 'poi', 'agile', 'rrhh', 'notificaciones', 'storage'];
          for (const schema of schemas) {
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
          }

          // Crear tabla typeorm_migrations si no existe
          await client.query(`
            CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
              "id" SERIAL PRIMARY KEY,
              "timestamp" BIGINT NOT NULL,
              "name" VARCHAR NOT NULL
            )
          `);

          // Registrar migraciones antiguas como ya ejecutadas (no-op si ya están)
          for (const migration of LEGACY_MIGRATIONS) {
            await client.query(`
              INSERT INTO "typeorm_migrations" ("timestamp", "name")
              SELECT $1, $2
              WHERE NOT EXISTS (
                SELECT 1 FROM "typeorm_migrations" WHERE "name" = $2
              )
            `, [migration.timestamp, migration.name]);
          }

          console.log('✅ Pre-init: schemas y migraciones legacy registradas correctamente');
        } catch (error) {
          console.error('❌ Pre-init error:', error.message);
        } finally {
          await client.end();
        }

        return {
          type: 'postgres',
          host: config.get('database.host'),
          port: config.get('database.port'),
          username: config.get('database.username'),
          password: config.get('database.password'),
          database: config.get('database.database'),
          autoLoadEntities: true,
          synchronize: false,
          logging: config.get('database.logging'),
          ssl: sslConfig,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [
            FixHuEstadoEnRevision1769200000000,
            UpdateHuEstadoEnum1769300000000,
            CreateEvidenciasTareaTable1769400000000,
            CreateSubactividadesAndAddColumnToTareas1769800000000,
          ],
          migrationsRun: true,
        };
      },
    }),

    // Schedule (for cron jobs)
    ScheduleModule.forRoot(),

    // Redis
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password') || undefined,
          db: config.get('redis.db'),
          keyPrefix: config.get('redis.keyPrefix'),
        },
      }),
    }),

    // Application modules
    CommonModule,
    AuthModule,
    PlanningModule,
    PoiModule,
    AgileModule,
    RrhhModule,
    NotificacionesModule,
    DashboardModule,
    StorageModule,
  ],
})
export class AppModule {}
