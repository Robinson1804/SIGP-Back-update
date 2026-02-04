export class ActividadInfoDto {
  id: number;
  codigo: string;
  nombre: string;
  estado: string;
  progreso: number;
}

export class MetricasKanbanDto {
  leadTime: number;
  cycleTime: number;
  throughput: number;
}

export class ThroughputSemanalDto {
  semana: string;
  completadas: number;
}

export class EquipoActividadMiembroDto {
  personalId: number;
  usuarioId?: number;
  nombre: string;
  rol: string;
  dedicacion: number;
  tareasAsignadas?: number;
  tareasCompletadas?: number;
}

export class TiposTrabajoDto {
  totalTareas: number;
  totalSubtareas: number;
}

export class ResumenPrioridadDto {
  alta: number;
  media: number;
  baja: number;
}

export class ActividadRecienteItemDto {
  id: number;
  tipo: 'tarea_creada' | 'subtarea_creada' | 'cambio_estado' | 'asignacion';
  descripcion: string;
  fecha: Date;
  usuarioNombre?: string;
  entidadId: number;
  entidadTipo: 'tarea' | 'subtarea';
  entidadNombre: string;
  detalles?: Record<string, any>;
}

export class DashboardActividadDto {
  actividad: ActividadInfoDto;
  metricasKanban: MetricasKanbanDto;
  tareasPorEstado: Record<string, number>;
  throughputSemanal: ThroughputSemanalDto[];
  equipo: EquipoActividadMiembroDto[];
  tiposTrabajo?: TiposTrabajoDto;
  resumenPrioridad?: ResumenPrioridadDto;
  actividadReciente?: ActividadRecienteItemDto[];
}
