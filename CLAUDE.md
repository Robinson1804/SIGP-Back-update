# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SIGP (Sistema Integral de Gestión de Proyectos) is a comprehensive project management system backend built with NestJS 11, TypeScript, PostgreSQL, and Redis. The API is served at `/api/v1` with Swagger documentation at `/api/docs`.

## Common Commands

```bash
# Development
npm run start:dev       # Watch mode with hot reload
npm run start:debug     # Debug mode with watch

# Build & Production
npm run build           # Compile TypeScript to dist/
npm run start:prod      # Run compiled app from dist/

# Testing
npm run test            # Run unit tests (*.spec.ts in src/)
npm run test:watch      # Watch mode for tests
npm run test -- --testPathPattern="archivo.service"  # Run specific test file
npm run test:e2e        # E2E tests (*.e2e-spec.ts in test/)
npm run test:cov        # Test coverage report

# Code Quality
npm run lint            # ESLint with auto-fix
npm run format          # Prettier formatting
```

## Architecture

### Module Structure

Each domain module follows a consistent pattern:
```
src/modules/{module}/
├── {submodule}/
│   ├── entities/       # TypeORM entities
│   ├── dto/            # Request/Response DTOs with class-validator
│   ├── enums/          # TypeScript enums
│   ├── services/       # Business logic
│   ├── controllers/    # REST endpoints
│   └── index.ts        # Barrel exports
└── {module}.module.ts  # NestJS module definition
```

### Core Modules

- **AuthModule**: JWT authentication, sessions, user management
- **PlanningModule**: Strategic planning hierarchy (PGD → OEI → OGD → OEGD → Acciones Estratégicas)
- **PoiModule**: Projects, subprojects, activities, schedules, requirements, reports
- **AgileModule**: Scrum/Kanban (epics, sprints, user stories, tasks, subtasks, daily meetings, boards)
- **RrhhModule**: Personnel, divisions, skills, assignments
- **NotificacionesModule**: Notification system
- **DashboardModule**: Metrics and analytics
- **StorageModule**: File management with MinIO (presigned URLs, versioning, cleanup jobs)

### Common Infrastructure (src/common/)

- `guards/`: JwtAuthGuard, RolesGuard
- `decorators/`: @CurrentUser, @Roles, @Public
- `filters/`: HttpExceptionFilter (global)
- `interceptors/`: TransformInterceptor (global)
- `pipes/`: ValidationPipe
- `dto/`: PaginationDto, ResponseDto

### Configuration (src/config/)

Environment-based configuration files:
- `database.config.ts`: PostgreSQL connection
- `jwt.config.ts`: JWT settings
- `redis.config.ts`: Redis connection
- `app.config.ts`: Application settings

Config loaded via `ConfigModule.forRoot()` with `.env.local` and `.env` files.

## Key Patterns

### Nested Controllers

Modules expose both standalone and nested REST controllers:
```typescript
// Standalone: /api/v1/historias-usuario
HistoriaUsuarioController

// Nested: /api/v1/sprints/:sprintId/historias-usuario
SprintHistoriasUsuarioController
```

### Entity Relationships

Planning hierarchy flows downward: PGD → OEI → OGD → OEGD → AccionEstrategica

Agile hierarchy: Proyecto → Epica → HistoriaUsuario → Tarea → Subtarea

### Storage Module

Uses MinIO for file storage with a presigned URL flow:
1. Request upload URL via `POST /upload/request-url`
2. Upload directly to MinIO
3. Confirm via `POST /upload/confirm`

Redis caches presigned URLs and tracks pending uploads. Cron jobs handle cleanup.

## Database

PostgreSQL with TypeORM. Entities use decorators for validation and auto-loading is enabled. All entities should be placed in `entities/` folders within their respective modules..
