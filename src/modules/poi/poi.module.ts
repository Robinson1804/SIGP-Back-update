import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Proyecto } from './proyectos/entities/proyecto.entity';
import { Actividad } from './actividades/entities/actividad.entity';
import { Subproyecto } from './subproyectos/entities/subproyecto.entity';
import { Documento } from './documentos/entities/documento.entity';
import { Acta } from './actas/entities/acta.entity';
import { Requerimiento } from './requerimientos/entities/requerimiento.entity';
import { Cronograma, TareaCronograma } from './cronogramas/entities';
import { InformeSprint } from './informes-sprint/entities/informe-sprint.entity';
import { InformeActividad } from './informes-actividad/entities/informe-actividad.entity';

// Services
import { ProyectoService } from './proyectos/services/proyecto.service';
import { ActividadService } from './actividades/services/actividad.service';
import { SubproyectoService } from './subproyectos/services/subproyecto.service';
import { DocumentoService } from './documentos/services/documento.service';
import { ActaService } from './actas/services/acta.service';
import { RequerimientoService } from './requerimientos/services/requerimiento.service';
import { CronogramaService, TareaCronogramaService } from './cronogramas/services';
import { InformeSprintService } from './informes-sprint/services/informe-sprint.service';
import { InformeActividadService } from './informes-actividad/services/informe-actividad.service';

// Controllers
import {
  ProyectoController,
  AccionEstrategicaProyectosController,
} from './proyectos/controllers/proyecto.controller';
import { ActividadController } from './actividades/controllers/actividad.controller';
import {
  SubproyectoController,
  ProyectoSubproyectosController,
} from './subproyectos/controllers/subproyecto.controller';
import {
  DocumentoController,
  ProyectoDocumentosController,
  SubproyectoDocumentosController,
} from './documentos/controllers/documento.controller';
import {
  ActaController,
  ProyectoActasController,
} from './actas/controllers/acta.controller';
import {
  RequerimientoController,
  ProyectoRequerimientosController,
} from './requerimientos/controllers/requerimiento.controller';
import {
  CronogramaController,
  ProyectoCronogramasController,
  TareaCronogramaController,
  CronogramaTareasController,
} from './cronogramas/controllers/cronograma.controller';
import {
  InformeSprintController,
  ProyectoInformesSprintController,
} from './informes-sprint/controllers/informe-sprint.controller';
import {
  InformeActividadController,
  ActividadInformesController,
} from './informes-actividad/controllers/informe-actividad.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Proyecto,
      Actividad,
      Subproyecto,
      Documento,
      Acta,
      Requerimiento,
      Cronograma,
      TareaCronograma,
      InformeSprint,
      InformeActividad,
    ]),
  ],
  controllers: [
    // Proyectos
    ProyectoController,
    AccionEstrategicaProyectosController,
    // Actividades
    ActividadController,
    // Subproyectos
    SubproyectoController,
    ProyectoSubproyectosController,
    // Documentos
    DocumentoController,
    ProyectoDocumentosController,
    SubproyectoDocumentosController,
    // Actas
    ActaController,
    ProyectoActasController,
    // Requerimientos
    RequerimientoController,
    ProyectoRequerimientosController,
    // Cronogramas
    CronogramaController,
    ProyectoCronogramasController,
    TareaCronogramaController,
    CronogramaTareasController,
    // Informes Sprint
    InformeSprintController,
    ProyectoInformesSprintController,
    // Informes Actividad
    InformeActividadController,
    ActividadInformesController,
  ],
  providers: [
    ProyectoService,
    ActividadService,
    SubproyectoService,
    DocumentoService,
    ActaService,
    RequerimientoService,
    CronogramaService,
    TareaCronogramaService,
    InformeSprintService,
    InformeActividadService,
  ],
  exports: [
    ProyectoService,
    ActividadService,
    SubproyectoService,
    DocumentoService,
    ActaService,
    RequerimientoService,
    CronogramaService,
    TareaCronogramaService,
    InformeSprintService,
    InformeActividadService,
  ],
})
export class PoiModule {}
