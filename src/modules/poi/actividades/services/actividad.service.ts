import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Actividad } from '../entities/actividad.entity';
import { CreateActividadDto } from '../dto/create-actividad.dto';
import { UpdateActividadDto } from '../dto/update-actividad.dto';
import { ActividadEstado } from '../enums/actividad-estado.enum';
import { Tarea } from '../../../agile/tareas/entities/tarea.entity';
import { TareaEstado, TareaTipo } from '../../../agile/tareas/enums/tarea.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Role } from '../../../../common/constants/roles.constant';

export interface ActividadMetricas {
  leadTime: number | null;       // Días promedio desde creación hasta completado
  cycleTime: number | null;      // Días promedio desde inicio progreso hasta completado
  throughput: number;            // Tareas completadas en última semana
  wipActual: number;             // Tareas actualmente en progreso
  totalTareas: number;
  tareasPorHacer: number;
  tareasEnProgreso: number;
  tareasCompletadas: number;
  porcentajeCompletado: number;
}

@Injectable()
export class ActividadService {
  constructor(
    @InjectRepository(Actividad)
    private readonly actividadRepository: Repository<Actividad>,
    @InjectRepository(Tarea)
    private readonly tareaRepository: Repository<Tarea>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
  ) {}

  /**
   * Obtiene los IDs de todos los usuarios con rol PMO activos
   */
  private async getPmoUserIds(): Promise<number[]> {
    const pmoUsers = await this.usuarioRepository.find({
      where: { rol: Role.PMO, activo: true },
      select: ['id'],
    });
    return pmoUsers.map(u => u.id);
  }

  /**
   * Genera el siguiente código de actividad disponible (ACT N°X)
   */
  private async generateCodigo(): Promise<string> {
    const actividades = await this.actividadRepository.find({
      select: ['codigo'],
    });

    let maxNum = 0;
    for (const actividad of actividades) {
      const match = actividad.codigo.match(/ACT\s*N°(\d+)/i) || actividad.codigo.match(/ACT-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `ACT N°${maxNum + 1}`;
  }

  /**
   * Obtener el siguiente código disponible para actividades
   */
  async getNextCodigo(): Promise<string> {
    return this.generateCodigo();
  }

  async create(createDto: CreateActividadDto, userId?: number): Promise<Actividad> {
    // Si no se proporciona código, generar uno automáticamente
    const codigo = createDto.codigo || await this.generateCodigo();

    const existing = await this.actividadRepository.findOne({
      where: { codigo },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una actividad con el código ${codigo}`);
    }

    const actividad = this.actividadRepository.create({
      ...createDto,
      codigo,
      metodoGestion: 'Kanban',
      createdBy: userId,
      updatedBy: userId,
    });

    const actividadGuardada = await this.actividadRepository.save(actividad);

    // Notificar al coordinador y PMOs si se le asigna la actividad
    if (createDto.coordinadorId && createDto.coordinadorId !== userId) {
      const destinatariosCoord: number[] = [createDto.coordinadorId];

      // Agregar PMOs para que vean la asignación
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosCoord.includes(pmoId)) {
          destinatariosCoord.push(pmoId);
        }
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS, // Activity assignments use 'Proyectos' type
        destinatariosCoord,
        {
          titulo: `Actividad asignada ${actividadGuardada.codigo}: ${actividadGuardada.nombre}`,
          descripcion: `Se ha asignado como Coordinador de la actividad "${actividadGuardada.nombre}"`,
          entidadTipo: 'Actividad',
          entidadId: actividadGuardada.id,
          actividadId: actividadGuardada.id,
          urlAccion: `/poi/actividad/detalles?id=${actividadGuardada.id}`,
        },
      );
    }

    // Notificar al gestor y PMOs si se le asigna
    if (createDto.gestorId && createDto.gestorId !== userId && createDto.gestorId !== createDto.coordinadorId) {
      const destinatariosGestor: number[] = [createDto.gestorId];

      // Agregar PMOs
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosGestor.includes(pmoId)) {
          destinatariosGestor.push(pmoId);
        }
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS, // Activity assignments use 'Proyectos' type
        destinatariosGestor,
        {
          titulo: `Actividad asignada ${actividadGuardada.codigo}: ${actividadGuardada.nombre}`,
          descripcion: `Se ha asignado como Gestor de la actividad "${actividadGuardada.nombre}"`,
          entidadTipo: 'Actividad',
          entidadId: actividadGuardada.id,
          actividadId: actividadGuardada.id,
          urlAccion: `/poi/actividad/detalles?id=${actividadGuardada.id}`,
        },
      );
    }

    return actividadGuardada;
  }

  async findAll(filters?: {
    estado?: ActividadEstado;
    coordinadorId?: number;
    gestorId?: number;
    accionEstrategicaId?: number;
    activo?: boolean;
    pgdId?: number;
    responsableUsuarioId?: number;
  }): Promise<Actividad[]> {
    const queryBuilder = this.actividadRepository
      .createQueryBuilder('actividad')
      .leftJoinAndSelect('actividad.coordinador', 'coordinador')
      .leftJoinAndSelect('actividad.gestor', 'gestor')
      .leftJoinAndSelect('actividad.accionEstrategica', 'ae')
      .orderBy('actividad.createdAt', 'DESC');

    if (filters?.estado) {
      queryBuilder.andWhere('actividad.estado = :estado', { estado: filters.estado });
    }

    if (filters?.coordinadorId) {
      queryBuilder.andWhere('actividad.coordinadorId = :coordinadorId', { coordinadorId: filters.coordinadorId });
    }

    if (filters?.gestorId) {
      queryBuilder.andWhere('actividad.gestorId = :gestorId', { gestorId: filters.gestorId });
    }

    if (filters?.accionEstrategicaId) {
      queryBuilder.andWhere('actividad.accionEstrategicaId = :accionEstrategicaId', { accionEstrategicaId: filters.accionEstrategicaId });
    }

    // Filtrar por PGD a través de la cadena: Actividad -> AE -> OEGD -> OGD -> PGD
    if (filters?.pgdId) {
      queryBuilder
        .leftJoin('ae.oegd', 'oegd')
        .leftJoin('oegd.ogd', 'ogd')
        .andWhere('ogd.pgdId = :pgdId', { pgdId: filters.pgdId });
    }

    if (filters?.responsableUsuarioId) {
      queryBuilder.andWhere(`actividad.id IN (
        SELECT a.actividad_id FROM rrhh.asignaciones a
        INNER JOIN rrhh.personal p ON p.id = a.personal_id
        WHERE p.usuario_id = :responsableUsuarioId
        AND a.tipo_asignacion = 'Actividad'
        AND a.activo = true
      )`, { responsableUsuarioId: filters.responsableUsuarioId });
    }

    if (filters?.activo !== undefined) {
      queryBuilder.andWhere('actividad.activo = :activo', { activo: filters.activo });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number): Promise<Actividad> {
    const actividad = await this.actividadRepository.findOne({
      where: { id },
      relations: ['coordinador', 'gestor', 'accionEstrategica'],
    });

    if (!actividad) {
      throw new NotFoundException(`Actividad con ID ${id} no encontrada`);
    }

    return actividad;
  }

  async update(id: number, updateDto: UpdateActividadDto, userId?: number): Promise<Actividad> {
    const actividad = await this.findOne(id);

    // Capturar valores anteriores para notificaciones
    const coordinadorAnterior = actividad.coordinadorId;
    const gestorAnterior = actividad.gestorId;

    Object.assign(actividad, updateDto, { updatedBy: userId });
    const actividadActualizada = await this.actividadRepository.save(actividad);

    // Notificar al nuevo coordinador y PMOs si cambió
    if (updateDto.coordinadorId && updateDto.coordinadorId !== coordinadorAnterior && updateDto.coordinadorId !== userId) {
      const destinatariosCoord: number[] = [updateDto.coordinadorId];

      // Agregar PMOs para que vean la asignación
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosCoord.includes(pmoId)) {
          destinatariosCoord.push(pmoId);
        }
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS, // Activity assignments use 'Proyectos' type
        destinatariosCoord,
        {
          titulo: `Actividad asignada ${actividadActualizada.codigo}: ${actividadActualizada.nombre}`,
          descripcion: `Se ha asignado como Coordinador de la actividad "${actividadActualizada.nombre}"`,
          entidadTipo: 'Actividad',
          entidadId: actividadActualizada.id,
          actividadId: actividadActualizada.id,
          urlAccion: `/poi/actividad/detalles?id=${actividadActualizada.id}`,
        },
      );
    }

    // Notificar al nuevo gestor y PMOs si cambió
    if (updateDto.gestorId && updateDto.gestorId !== gestorAnterior && updateDto.gestorId !== userId) {
      const destinatariosGestor: number[] = [updateDto.gestorId];

      // Agregar PMOs
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatariosGestor.includes(pmoId)) {
          destinatariosGestor.push(pmoId);
        }
      }

      await this.notificacionService.notificarMultiples(
        TipoNotificacion.PROYECTOS, // Activity assignments use 'Proyectos' type
        destinatariosGestor,
        {
          titulo: `Actividad asignada ${actividadActualizada.codigo}: ${actividadActualizada.nombre}`,
          descripcion: `Se ha asignado como Gestor de la actividad "${actividadActualizada.nombre}"`,
          entidadTipo: 'Actividad',
          entidadId: actividadActualizada.id,
          actividadId: actividadActualizada.id,
          urlAccion: `/poi/actividad/detalles?id=${actividadActualizada.id}`,
        },
      );
    }

    return actividadActualizada;
  }

  async remove(id: number, userId?: number): Promise<Actividad> {
    const actividad = await this.findOne(id);
    actividad.activo = false;
    actividad.updatedBy = userId;
    return this.actividadRepository.save(actividad);
  }

  async findByAccionEstrategica(accionEstrategicaId: number): Promise<Actividad[]> {
    return this.actividadRepository.find({
      where: { accionEstrategicaId, activo: true },
      order: { codigo: 'ASC' },
    });
  }

  /**
   * Calcula métricas Kanban para una actividad
   * - Lead Time: tiempo promedio desde creación hasta completado
   * - Cycle Time: tiempo promedio desde inicio de progreso hasta completado
   * - Throughput: tareas completadas en la última semana
   * - WIP: tareas actualmente en progreso
   */
  async getMetricas(actividadId: number): Promise<ActividadMetricas> {
    // Verificar que la actividad existe
    await this.findOne(actividadId);

    // Obtener todas las tareas KANBAN de la actividad
    const tareas = await this.tareaRepository.find({
      where: {
        actividadId,
        tipo: TareaTipo.KANBAN,
        activo: true,
      },
    });

    const totalTareas = tareas.length;
    const tareasPorHacer = tareas.filter(t => t.estado === TareaEstado.POR_HACER).length;
    const tareasEnProgreso = tareas.filter(t => t.estado === TareaEstado.EN_PROGRESO).length;
    const tareasCompletadas = tareas.filter(t => t.estado === TareaEstado.FINALIZADO).length;
    const wipActual = tareasEnProgreso;

    // Calcular porcentaje completado
    const porcentajeCompletado = totalTareas > 0
      ? Math.round((tareasCompletadas / totalTareas) * 100)
      : 0;

    // Calcular Lead Time (createdAt -> fechaCompletado)
    const tareasConLeadTime = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO && t.fechaCompletado && t.createdAt
    );
    let leadTime: number | null = null;
    if (tareasConLeadTime.length > 0) {
      const totalLeadTimeMs = tareasConLeadTime.reduce((sum, t) => {
        const completado = new Date(t.fechaCompletado).getTime();
        const creado = new Date(t.createdAt).getTime();
        return sum + (completado - creado);
      }, 0);
      const avgLeadTimeMs = totalLeadTimeMs / tareasConLeadTime.length;
      leadTime = Math.round((avgLeadTimeMs / (1000 * 60 * 60 * 24)) * 10) / 10; // días con 1 decimal
    }

    // Calcular Cycle Time (fechaInicioProgreso -> fechaCompletado)
    const tareasConCycleTime = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO && t.fechaCompletado && t.fechaInicioProgreso
    );
    let cycleTime: number | null = null;
    if (tareasConCycleTime.length > 0) {
      const totalCycleTimeMs = tareasConCycleTime.reduce((sum, t) => {
        const completado = new Date(t.fechaCompletado).getTime();
        const inicioProg = new Date(t.fechaInicioProgreso).getTime();
        return sum + (completado - inicioProg);
      }, 0);
      const avgCycleTimeMs = totalCycleTimeMs / tareasConCycleTime.length;
      cycleTime = Math.round((avgCycleTimeMs / (1000 * 60 * 60 * 24)) * 10) / 10; // días con 1 decimal
    }

    // Calcular Throughput (tareas completadas en última semana)
    const unaSemanasAtras = new Date();
    unaSemanasAtras.setDate(unaSemanasAtras.getDate() - 7);
    const throughput = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO &&
      t.fechaCompletado &&
      new Date(t.fechaCompletado) >= unaSemanasAtras
    ).length;

    return {
      leadTime,
      cycleTime,
      throughput,
      wipActual,
      totalTareas,
      tareasPorHacer,
      tareasEnProgreso,
      tareasCompletadas,
      porcentajeCompletado,
    };
  }
}
