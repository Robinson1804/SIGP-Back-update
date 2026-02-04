import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Actividad } from '../../poi/actividades/entities/actividad.entity';
import { Tarea } from '../../agile/tareas/entities/tarea.entity';
import { Subtarea } from '../../agile/subtareas/entities/subtarea.entity';
import { TareaAsignado } from '../../agile/tareas/entities/tarea-asignado.entity';
import { Asignacion } from '../../rrhh/asignaciones/entities/asignacion.entity';
import { TareaTipo, TareaEstado, TareaPrioridad } from '../../agile/tareas/enums/tarea.enum';
import {
  DashboardActividadDto,
  MetricasKanbanDto,
  ThroughputSemanalDto,
  EquipoActividadMiembroDto,
  TiposTrabajoDto,
  ResumenPrioridadDto,
  ActividadRecienteItemDto,
} from '../dto/dashboard-actividad.dto';

@Injectable()
export class DashboardActividadService {
  constructor(
    @InjectRepository(Actividad)
    private readonly actividadRepository: Repository<Actividad>,
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(Subtarea)
    private readonly subtareaRepository: Repository<Subtarea>,
    @InjectRepository(TareaAsignado)
    private readonly tareaAsignadoRepository: Repository<TareaAsignado>,
    @InjectRepository(Asignacion)
    private readonly asignacionRepository: Repository<Asignacion>,
  ) {}

  async getDashboard(actividadId: number): Promise<DashboardActividadDto> {
    const actividad = await this.actividadRepository.findOne({
      where: { id: actividadId },
    });

    if (!actividad) {
      throw new NotFoundException(`Actividad con ID ${actividadId} no encontrada`);
    }

    const [metricasKanban, tareasPorEstado, throughputData, equipo, tiposTrabajo, resumenPrioridad, actividadReciente] =
      await Promise.all([
        this.calcularMetricasKanban(actividadId),
        this.getTareasPorEstado(actividadId),
        this.getThroughput(actividadId),
        this.getEquipoConTareas(actividadId),
        this.getTiposTrabajo(actividadId),
        this.getResumenPrioridad(actividadId),
        this.getActividadReciente(actividadId),
      ]);

    const totalTareas = Object.values(tareasPorEstado).reduce((a, b) => a + b, 0);
    const tareasCompletadas = tareasPorEstado[TareaEstado.FINALIZADO] || 0;
    const progreso = totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0;

    // Convertir nuevo formato a formato legacy para compatibilidad
    const throughputSemanal = throughputData.periodos.map(p => ({
      semana: p.periodoLabel,
      completadas: p.tareasCompletadas,
    }));

    return {
      actividad: {
        id: actividad.id,
        codigo: actividad.codigo,
        nombre: actividad.nombre,
        estado: actividad.estado,
        progreso,
      },
      metricasKanban,
      tareasPorEstado,
      throughputSemanal,
      equipo,
      tiposTrabajo,
      resumenPrioridad,
      actividadReciente,
    };
  }

  async calcularMetricasKanban(actividadId: number): Promise<MetricasKanbanDto> {
    const tareasCompletadas = await this.tareaRepository.find({
      where: {
        actividadId,
        tipo: TareaTipo.KANBAN,
        estado: TareaEstado.FINALIZADO,
        activo: true,
      },
      select: ['id', 'createdAt', 'updatedAt', 'fechaInicioProgreso', 'fechaCompletado'],
    });

    // Lead Time: tiempo desde creación hasta completado (promedio en días)
    // Cycle Time: tiempo desde inicio de progreso hasta completado (preciso)
    let leadTimeTotal = 0;
    let cycleTimeTotal = 0;
    let leadTimeCount = 0;
    let cycleTimeCount = 0;

    for (const tarea of tareasCompletadas) {
      const createdAt = new Date(tarea.createdAt);
      // Usar fechaCompletado si está disponible, sino updatedAt (fallback)
      const completedAt = tarea.fechaCompletado
        ? new Date(tarea.fechaCompletado)
        : new Date(tarea.updatedAt);

      // Lead Time: desde creación hasta completado
      const leadTimeDias =
        (completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      leadTimeTotal += leadTimeDias;
      leadTimeCount++;

      // Cycle Time preciso: desde inicio de progreso hasta completado
      if (tarea.fechaInicioProgreso) {
        const startedAt = new Date(tarea.fechaInicioProgreso);
        const cycleTimeDias =
          (completedAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
        cycleTimeTotal += cycleTimeDias;
        cycleTimeCount++;
      } else {
        // Fallback: aproximar cycle time como 70% del lead time
        cycleTimeTotal += leadTimeDias * 0.7;
        cycleTimeCount++;
      }
    }

    const leadTime = leadTimeCount > 0
      ? Math.round((leadTimeTotal / leadTimeCount) * 10) / 10
      : 0;
    const cycleTime = cycleTimeCount > 0
      ? Math.round((cycleTimeTotal / cycleTimeCount) * 10) / 10
      : 0;

    // Throughput: tareas completadas en la última semana
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const tareasUltimaSemana = tareasCompletadas.filter((t) => {
      const completedAt = t.fechaCompletado
        ? new Date(t.fechaCompletado)
        : new Date(t.updatedAt);
      return completedAt >= hace7Dias;
    }).length;

    return {
      leadTime,
      cycleTime,
      throughput: tareasUltimaSemana,
    };
  }

  private async getTareasPorEstado(actividadId: number): Promise<Record<string, number>> {
    const tareas = await this.tareaRepository.find({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
      select: ['id', 'estado'],
    });

    const porEstado: Record<string, number> = {};
    for (const tarea of tareas) {
      porEstado[tarea.estado] = (porEstado[tarea.estado] || 0) + 1;
    }

    return porEstado;
  }

  async getThroughput(actividadId: number): Promise<{
    actividadId: number;
    throughputPromedio: number;
    periodos: Array<{
      periodo: string;
      periodoLabel: string;
      tareasCompletadas: number;
      subtareasCompletadas: number;
    }>;
  }> {
    const tareasCompletadas = await this.tareaRepository.find({
      where: {
        actividadId,
        tipo: TareaTipo.KANBAN,
        estado: TareaEstado.FINALIZADO,
        activo: true,
      },
      select: ['id', 'updatedAt', 'fechaCompletado'],
    });

    // Agrupar por semana (últimas 8 semanas incluyendo la actual)
    const ahora = new Date();
    const periodos: Array<{
      periodo: string;
      periodoLabel: string;
      tareasCompletadas: number;
      subtareasCompletadas: number;
    }> = [];

    let totalCompletadas = 0;

    for (let i = 7; i >= 0; i--) {
      const finSemana = new Date(ahora);
      finSemana.setDate(ahora.getDate() - (7 * i));
      finSemana.setHours(23, 59, 59, 999);

      const inicioSemana = new Date(ahora);
      inicioSemana.setDate(ahora.getDate() - (7 * (i + 1)) + 1);
      inicioSemana.setHours(0, 0, 0, 0);

      // Formato de periodo: año-Wxx
      const weekNum = Math.ceil((ahora.getDate() - i * 7) / 7);
      const periodo = `${ahora.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      const periodoLabel = i === 0 ? 'Esta semana' : `Semana -${i}`;

      const completadasEnSemana = tareasCompletadas.filter((t) => {
        const fecha = t.fechaCompletado
          ? new Date(t.fechaCompletado)
          : new Date(t.updatedAt);
        return fecha >= inicioSemana && fecha <= finSemana;
      }).length;

      totalCompletadas += completadasEnSemana;

      periodos.push({
        periodo,
        periodoLabel,
        tareasCompletadas: completadasEnSemana,
        subtareasCompletadas: 0, // TODO: implementar conteo de subtareas
      });
    }

    const throughputPromedio = periodos.length > 0 ? totalCompletadas / periodos.length : 0;

    return {
      actividadId,
      throughputPromedio: Math.round(throughputPromedio * 10) / 10,
      periodos,
    };
  }

  private async getEquipo(actividadId: number): Promise<EquipoActividadMiembroDto[]> {
    const asignaciones = await this.asignacionRepository.find({
      where: { actividadId, activo: true },
      relations: ['personal'],
    });

    return asignaciones.map((a) => ({
      personalId: a.personalId,
      nombre: a.personal
        ? `${a.personal.nombres} ${a.personal.apellidos}`
        : 'Sin nombre',
      rol: a.rolEquipo || 'Miembro',
      dedicacion: Number(a.porcentajeDedicacion),
    }));
  }

  private async getEquipoConTareas(actividadId: number): Promise<EquipoActividadMiembroDto[]> {
    const asignaciones = await this.asignacionRepository.find({
      where: { actividadId, activo: true },
      relations: ['personal', 'personal.usuario'],
    });

    // Obtener todas las tareas de la actividad
    const tareas = await this.tareaRepository.find({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
      relations: ['asignados'],
    });

    // Crear mapa de tareas por usuarioId
    const tareasAsignadasPorUsuario: Record<number, number> = {};
    const tareasCompletadasPorUsuario: Record<number, number> = {};

    for (const tarea of tareas) {
      if (tarea.asignados) {
        for (const asignado of tarea.asignados) {
          if (asignado.activo) {
            tareasAsignadasPorUsuario[asignado.usuarioId] = (tareasAsignadasPorUsuario[asignado.usuarioId] || 0) + 1;
            if (tarea.estado === TareaEstado.FINALIZADO) {
              tareasCompletadasPorUsuario[asignado.usuarioId] = (tareasCompletadasPorUsuario[asignado.usuarioId] || 0) + 1;
            }
          }
        }
      }
    }

    return asignaciones.map((a) => {
      const usuarioId = a.personal?.usuario?.id;
      return {
        personalId: a.personalId,
        usuarioId,
        nombre: a.personal
          ? `${a.personal.nombres} ${a.personal.apellidos}`
          : 'Sin nombre',
        rol: a.rolEquipo || 'Miembro',
        dedicacion: Number(a.porcentajeDedicacion),
        tareasAsignadas: usuarioId ? tareasAsignadasPorUsuario[usuarioId] || 0 : 0,
        tareasCompletadas: usuarioId ? tareasCompletadasPorUsuario[usuarioId] || 0 : 0,
      };
    });
  }

  private async getTiposTrabajo(actividadId: number): Promise<TiposTrabajoDto> {
    // Contar tareas
    const totalTareas = await this.tareaRepository.count({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
    });

    // Obtener IDs de tareas de la actividad
    const tareas = await this.tareaRepository.find({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
      select: ['id'],
    });
    const tareaIds = tareas.map(t => t.id);

    // Contar subtareas de esas tareas
    let totalSubtareas = 0;
    if (tareaIds.length > 0) {
      totalSubtareas = await this.subtareaRepository
        .createQueryBuilder('subtarea')
        .where('subtarea.tareaId IN (:...tareaIds)', { tareaIds })
        .andWhere('subtarea.activo = :activo', { activo: true })
        .getCount();
    }

    return { totalTareas, totalSubtareas };
  }

  private async getResumenPrioridad(actividadId: number): Promise<ResumenPrioridadDto> {
    const tareas = await this.tareaRepository.find({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
      select: ['id', 'prioridad'],
    });

    const resumen: ResumenPrioridadDto = { alta: 0, media: 0, baja: 0 };

    for (const tarea of tareas) {
      switch (tarea.prioridad) {
        case TareaPrioridad.ALTA:
          resumen.alta++;
          break;
        case TareaPrioridad.MEDIA:
          resumen.media++;
          break;
        case TareaPrioridad.BAJA:
          resumen.baja++;
          break;
      }
    }

    return resumen;
  }

  private async getActividadReciente(actividadId: number): Promise<ActividadRecienteItemDto[]> {
    const actividades: ActividadRecienteItemDto[] = [];
    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    // 1. Tareas creadas recientemente
    const tareasRecientes = await this.tareaRepository.find({
      where: {
        actividadId,
        tipo: TareaTipo.KANBAN,
        activo: true,
        createdAt: MoreThanOrEqual(hace7Dias),
      },
      relations: ['creator'],
      order: { createdAt: 'DESC' },
      take: 10,
    });

    for (const tarea of tareasRecientes) {
      actividades.push({
        id: actividades.length + 1,
        tipo: 'tarea_creada',
        descripcion: `Nueva tarea creada: ${tarea.nombre}`,
        fecha: tarea.createdAt,
        usuarioNombre: tarea.creator
          ? `${tarea.creator.nombre || ''} ${tarea.creator.apellido || ''}`.trim() || tarea.creator.email
          : undefined,
        entidadId: tarea.id,
        entidadTipo: 'tarea',
        entidadNombre: tarea.nombre,
      });
    }

    // 2. Tareas completadas recientemente
    const tareasCompletadas = await this.tareaRepository.find({
      where: {
        actividadId,
        tipo: TareaTipo.KANBAN,
        estado: TareaEstado.FINALIZADO,
        activo: true,
      },
      order: { updatedAt: 'DESC' },
      take: 10,
    });

    for (const tarea of tareasCompletadas) {
      const fechaCompletado = tarea.fechaCompletado || tarea.updatedAt;
      if (fechaCompletado >= hace7Dias) {
        actividades.push({
          id: actividades.length + 1,
          tipo: 'cambio_estado',
          descripcion: `Tarea completada: ${tarea.nombre}`,
          fecha: fechaCompletado,
          entidadId: tarea.id,
          entidadTipo: 'tarea',
          entidadNombre: tarea.nombre,
          detalles: { estadoAnterior: 'En progreso', estadoNuevo: 'Finalizado' },
        });
      }
    }

    // 3. Asignaciones recientes
    const asignacionesRecientes = await this.tareaAsignadoRepository.find({
      where: {
        activo: true,
        asignadoEn: MoreThanOrEqual(hace7Dias),
      },
      relations: ['tarea', 'usuario'],
      order: { asignadoEn: 'DESC' },
      take: 10,
    });

    for (const asignacion of asignacionesRecientes) {
      // Verificar que la tarea pertenece a esta actividad
      if (asignacion.tarea && asignacion.tarea.actividadId === actividadId) {
        actividades.push({
          id: actividades.length + 1,
          tipo: 'asignacion',
          descripcion: `${asignacion.usuario?.nombre || 'Usuario'} asignado a: ${asignacion.tarea.nombre}`,
          fecha: asignacion.asignadoEn,
          usuarioNombre: asignacion.usuario
            ? `${asignacion.usuario.nombre || ''} ${asignacion.usuario.apellido || ''}`.trim()
            : undefined,
          entidadId: asignacion.tarea.id,
          entidadTipo: 'tarea',
          entidadNombre: asignacion.tarea.nombre,
        });
      }
    }

    // 4. Subtareas creadas recientemente
    const tareas = await this.tareaRepository.find({
      where: { actividadId, tipo: TareaTipo.KANBAN, activo: true },
      select: ['id'],
    });
    const tareaIds = tareas.map(t => t.id);

    if (tareaIds.length > 0) {
      const subtareasRecientes = await this.subtareaRepository
        .createQueryBuilder('subtarea')
        .leftJoinAndSelect('subtarea.tarea', 'tarea')
        .leftJoinAndSelect('subtarea.creator', 'creator')
        .where('subtarea.tareaId IN (:...tareaIds)', { tareaIds })
        .andWhere('subtarea.activo = :activo', { activo: true })
        .andWhere('subtarea.createdAt >= :fecha', { fecha: hace7Dias })
        .orderBy('subtarea.createdAt', 'DESC')
        .take(10)
        .getMany();

      for (const subtarea of subtareasRecientes) {
        actividades.push({
          id: actividades.length + 1,
          tipo: 'subtarea_creada',
          descripcion: `Nueva subtarea: ${subtarea.nombre} (en ${subtarea.tarea?.nombre || 'tarea'})`,
          fecha: subtarea.createdAt,
          usuarioNombre: subtarea.creator
            ? `${subtarea.creator.nombre || ''} ${subtarea.creator.apellido || ''}`.trim() || subtarea.creator.email
            : undefined,
          entidadId: subtarea.id,
          entidadTipo: 'subtarea',
          entidadNombre: subtarea.nombre,
        });
      }
    }

    // Ordenar por fecha descendente y limitar a 20 items
    actividades.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return actividades.slice(0, 20);
  }
}
