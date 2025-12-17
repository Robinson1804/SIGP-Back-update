import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Epicas
import { Epica } from './epicas/entities/epica.entity';
import { EpicaService } from './epicas/services/epica.service';
import { EpicaController, ProyectoEpicasController } from './epicas/controllers/epica.controller';

// Sprints
import { Sprint } from './sprints/entities/sprint.entity';
import { SprintService } from './sprints/services/sprint.service';
import { SprintController, ProyectoSprintsController } from './sprints/controllers/sprint.controller';

// Historias de Usuario
import { HistoriaUsuario } from './historias-usuario/entities/historia-usuario.entity';
import { CriterioAceptacion } from './historias-usuario/entities/criterio-aceptacion.entity';
import { HuDependencia } from './historias-usuario/entities/hu-dependencia.entity';
import { HuRequerimiento } from './historias-usuario/entities/hu-requerimiento.entity';
import { HistoriaUsuarioService } from './historias-usuario/services/historia-usuario.service';
import { CriterioAceptacionService } from './historias-usuario/services/criterio-aceptacion.service';
import {
  HistoriaUsuarioController,
  ProyectoHistoriasUsuarioController,
  SprintHistoriasUsuarioController,
  EpicaHistoriasUsuarioController,
} from './historias-usuario/controllers/historia-usuario.controller';
import {
  CriterioAceptacionController,
  HuCriteriosAceptacionController,
} from './historias-usuario/controllers/criterio-aceptacion.controller';

// Tareas
import { Tarea, EvidenciaTarea } from './tareas/entities';
import { TareaService } from './tareas/services/tarea.service';
import {
  TareaController,
  HistoriaUsuarioTareasController,
  ActividadTareasController,
} from './tareas/controllers/tarea.controller';

// Subtareas
import { Subtarea } from './subtareas/entities/subtarea.entity';
import { SubtareaService } from './subtareas/services/subtarea.service';
import { SubtareaController, TareaSubtareasController } from './subtareas/controllers/subtarea.controller';

// Daily Meetings
import { DailyMeeting } from './daily-meetings/entities/daily-meeting.entity';
import { DailyParticipante } from './daily-meetings/entities/daily-participante.entity';
import { DailyMeetingService } from './daily-meetings/services/daily-meeting.service';
import {
  DailyMeetingController,
  ProyectoDailyMeetingsController,
  ActividadDailyMeetingsController,
  SprintDailyMeetingsController,
} from './daily-meetings/controllers/daily-meeting.controller';

// Tableros
import { TableroService } from './tableros/services/tablero.service';
import {
  SprintTableroController,
  ActividadTableroController,
  ActividadTableroKanbanController,
} from './tableros/controllers/tablero.controller';

// Common (transversal)
import { Comentario } from './common/entities/comentario.entity';
import { HistorialCambio } from './common/entities/historial-cambio.entity';
import { ComentarioService } from './common/services/comentario.service';
import { HistorialCambioService } from './common/services/historial-cambio.service';
import {
  ComentarioController,
  HuComentariosController,
  TareaComentariosController,
  SubtareaComentariosController,
} from './common/controllers/comentario.controller';
import {
  HistorialCambioController,
  HistoriaUsuarioHistorialController,
  TareaHistorialController,
  SprintHistorialController,
  EpicaHistorialController,
  SubtareaHistorialController,
} from './common/controllers/historial-cambio.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Epicas
      Epica,
      // Sprints
      Sprint,
      // Historias de Usuario
      HistoriaUsuario,
      CriterioAceptacion,
      HuDependencia,
      HuRequerimiento,
      // Tareas
      Tarea,
      EvidenciaTarea,
      // Subtareas
      Subtarea,
      // Daily Meetings
      DailyMeeting,
      DailyParticipante,
      // Common (transversal)
      Comentario,
      HistorialCambio,
    ]),
  ],
  controllers: [
    // Epicas
    EpicaController,
    ProyectoEpicasController,
    // Sprints
    SprintController,
    ProyectoSprintsController,
    // Historias de Usuario
    HistoriaUsuarioController,
    ProyectoHistoriasUsuarioController,
    SprintHistoriasUsuarioController,
    EpicaHistoriasUsuarioController,
    // Criterios de Aceptacion
    CriterioAceptacionController,
    HuCriteriosAceptacionController,
    // Tareas
    TareaController,
    HistoriaUsuarioTareasController,
    ActividadTareasController,
    // Subtareas
    SubtareaController,
    TareaSubtareasController,
    // Daily Meetings
    DailyMeetingController,
    ProyectoDailyMeetingsController,
    ActividadDailyMeetingsController,
    SprintDailyMeetingsController,
    // Tableros
    SprintTableroController,
    ActividadTableroController,
    ActividadTableroKanbanController,
    // Comentarios
    ComentarioController,
    HuComentariosController,
    TareaComentariosController,
    SubtareaComentariosController,
    // Historial de Cambios
    HistorialCambioController,
    HistoriaUsuarioHistorialController,
    TareaHistorialController,
    SprintHistorialController,
    EpicaHistorialController,
    SubtareaHistorialController,
  ],
  providers: [
    // Epicas
    EpicaService,
    // Sprints
    SprintService,
    // Historias de Usuario
    HistoriaUsuarioService,
    CriterioAceptacionService,
    // Tareas
    TareaService,
    // Subtareas
    SubtareaService,
    // Daily Meetings
    DailyMeetingService,
    // Tableros
    TableroService,
    // Comentarios
    ComentarioService,
    // Historial de Cambios
    HistorialCambioService,
  ],
  exports: [
    EpicaService,
    SprintService,
    HistoriaUsuarioService,
    CriterioAceptacionService,
    TareaService,
    SubtareaService,
    DailyMeetingService,
    TableroService,
    ComentarioService,
    HistorialCambioService,
  ],
})
export class AgileModule {}
