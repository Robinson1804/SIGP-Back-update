export class ProyectoInfoDto {
  id: number;
  codigo: string;
  nombre: string;
  estado: string;
  fechaInicio: Date;
  fechaFin: Date;
  progreso: number;
  salud: 'verde' | 'amarillo' | 'rojo';
}

export class SprintActualDto {
  id: number;
  nombre: string;
  fechaInicio: Date;
  fechaFin: Date;
  progreso: number;
  puntosComprometidos: number;
  puntosCompletados: number;
}

export class BurndownPointDto {
  fecha: string;
  puntosRestantes: number;
  puntosIdeales: number;
}

export class VelocidadSprintDto {
  sprint: string;
  puntos: number;
}

export class ConteoEstadoDto {
  total: number;
  porEstado: Record<string, number>;
}

export class EquipoMiembroDto {
  personalId: number;
  nombre: string;
  rol: string;
  dedicacion: number;
}

export class DashboardProyectoDto {
  proyecto: ProyectoInfoDto;
  sprintActual: SprintActualDto | null;
  burndown: BurndownPointDto[];
  velocidadHistorica: VelocidadSprintDto[];
  historiasUsuario: ConteoEstadoDto;
  tareas: ConteoEstadoDto;
  equipo: EquipoMiembroDto[];
}
