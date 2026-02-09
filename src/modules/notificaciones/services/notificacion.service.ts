import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from '../entities/notificacion.entity';
import { TipoNotificacion } from '../enums/tipo-notificacion.enum';
import { ConteoResponseDto } from '../dto/conteo-response.dto';
import { NotificacionesGateway } from '../gateways/notificaciones.gateway';
import { Role } from '../../../common/constants/roles.constant';

interface FindAllFilters {
  leida?: boolean;
  tipo?: TipoNotificacion;
  page?: number;
  limit?: number;
  proyectoId?: number;
  actividadId?: number;
  entidadId?: number;
}

interface NotificarData {
  titulo: string;
  descripcion: string;
  entidadTipo?: string;
  entidadId?: number;
  proyectoId?: number;
  actividadId?: number;
  urlAccion?: string;
  observacion?: string; // Observación/comentario de PMO o PATROCINADOR
}

@Injectable()
export class NotificacionService {
  constructor(
    @InjectRepository(Notificacion)
    private readonly notificacionRepository: Repository<Notificacion>,
    @Inject(forwardRef(() => NotificacionesGateway))
    private readonly gateway: NotificacionesGateway,
  ) {}

  async findAll(
    usuarioId: number,
    filters: FindAllFilters = {},
    userRole?: string,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { leida, tipo, page = 1, limit = 20, proyectoId, actividadId, entidadId } = filters;

    const queryBuilder = this.notificacionRepository
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.proyecto', 'proyecto')
      .leftJoinAndSelect('n.actividad', 'actividad');

    // PMO sees all notifications, others see only their own
    if (userRole !== Role.PMO) {
      queryBuilder.where('n.destinatarioId = :usuarioId', { usuarioId });
    }

    queryBuilder.andWhere('n.activo = true');

    if (leida !== undefined) {
      queryBuilder.andWhere('n.leida = :leida', { leida });
    }

    // DESARROLLADOR sees TAREAS, IMPLEMENTADOR only sees subtasks
    if (userRole === Role.DESARROLLADOR) {
      queryBuilder.andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.TAREAS });
    } else if (userRole === Role.IMPLEMENTADOR) {
      queryBuilder.andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.TAREAS });
      queryBuilder.andWhere('n.entidadTipo = :entidadTipo', { entidadTipo: 'subtarea' });
    } else if (tipo) {
      queryBuilder.andWhere('n.tipo = :tipo', { tipo });
    }

    if (proyectoId) {
      queryBuilder.andWhere('n.proyectoId = :proyectoId', { proyectoId });
    }

    if (actividadId) {
      queryBuilder.andWhere('n.actividadId = :actividadId', { actividadId });
    }

    if (entidadId) {
      queryBuilder.andWhere('n.entidadId = :entidadId', { entidadId });
    }

    queryBuilder
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [notificaciones, total] = await queryBuilder.getManyAndCount();

    // Enriquecer notificaciones con datos actuales del proyecto/actividad
    const data = notificaciones.map((n) => {
      const result: any = { ...n };
      // Si hay proyecto asociado, agregar nombre y código actual
      if (n.proyecto) {
        result.entidadNombre = n.proyecto.nombre;
        result.proyectoCodigo = n.proyecto.codigo;
        result.proyectoNombre = n.proyecto.nombre;
      }
      // Si hay actividad asociada, agregar nombre y código actual
      if ((n as any).actividad) {
        result.actividadCodigo = (n as any).actividad.codigo;
        result.actividadNombre = (n as any).actividad.nombre;
        if (!result.entidadNombre) {
          result.entidadNombre = (n as any).actividad.nombre;
        }
      }
      // Limpiar los objetos para no enviar datos innecesarios
      delete result.proyecto;
      delete result.actividad;
      return result;
    });

    return { data, total, page, limit };
  }

  async findOne(id: number, usuarioId: number): Promise<Notificacion> {
    const notificacion = await this.notificacionRepository.findOne({
      where: { id, destinatarioId: usuarioId, activo: true },
    });

    if (!notificacion) {
      throw new NotFoundException(`Notificación con ID ${id} no encontrada`);
    }

    return notificacion;
  }

  async getConteo(usuarioId: number, userRole?: string): Promise<ConteoResponseDto> {
    const where: any = { destinatarioId: usuarioId, leida: false, activo: true };

    // DESARROLLADOR sees all TAREAS, IMPLEMENTADOR only sees subtasks
    if (userRole === Role.DESARROLLADOR) {
      where.tipo = TipoNotificacion.TAREAS;
    } else if (userRole === Role.IMPLEMENTADOR) {
      where.tipo = TipoNotificacion.TAREAS;
      where.entidadTipo = 'subtarea';
    }

    const notificaciones = await this.notificacionRepository.find({
      where,
      select: ['tipo'],
    });

    const porTipo = {
      Proyectos: 0,
      Sprints: 0,
      Retrasos: 0,
      Validaciones: 0,
      Aprobaciones: 0,
      Tareas: 0,
      Documentos: 0,
      Sistema: 0,
    };

    notificaciones.forEach((n) => {
      if (porTipo[n.tipo] !== undefined) {
        porTipo[n.tipo]++;
      }
    });

    return {
      total: notificaciones.length,
      porTipo,
    };
  }

  async marcarLeida(id: number, usuarioId: number): Promise<Notificacion> {
    const notificacion = await this.findOne(id, usuarioId);

    if (!notificacion.leida) {
      notificacion.leida = true;
      notificacion.fechaLeida = new Date();
      await this.notificacionRepository.save(notificacion);
    }

    return notificacion;
  }

  async marcarTodasLeidas(usuarioId: number): Promise<{ actualizadas: number }> {
    const result = await this.notificacionRepository.update(
      { destinatarioId: usuarioId, leida: false, activo: true },
      { leida: true, fechaLeida: new Date() },
    );

    return { actualizadas: result.affected || 0 };
  }

  async remove(id: number, usuarioId: number): Promise<void> {
    const notificacion = await this.findOne(id, usuarioId);
    notificacion.activo = false;
    await this.notificacionRepository.save(notificacion);
  }

  async removeAdmin(id: number): Promise<void> {
    const notificacion = await this.notificacionRepository.findOne({ where: { id } });
    if (!notificacion) {
      throw new NotFoundException(`Notificación #${id} no encontrada`);
    }
    notificacion.activo = false;
    await this.notificacionRepository.save(notificacion);
  }

  // ==========================================
  // Agrupación por proyecto y sprint
  // ==========================================

  async findGroupedByProyecto(usuarioId: number, pgdId?: number, userRole?: string): Promise<{
    proyectoId: number;
    proyectoCodigo: string;
    proyectoNombre: string;
    total: number;
    noLeidas: number;
  }[]> {
    const qb = this.notificacionRepository
      .createQueryBuilder('n')
      .innerJoin('n.proyecto', 'p')
      .select('p.id', 'proyectoId')
      .addSelect('p.codigo', 'proyectoCodigo')
      .addSelect('p.nombre', 'proyectoNombre')
      .addSelect('COUNT(n.id)', 'total')
      .addSelect('COUNT(CASE WHEN n.leida = false THEN 1 END)', 'noLeidas');

    // PMO sees all active projects with notifications
    if (userRole === Role.PMO) {
      qb.where('n.activo = true')
        .andWhere('p.activo = true');
    } else if (userRole === Role.COORDINADOR) {
      // COORDINADOR sees projects where they are coordinador or scrum_master
      qb.where('n.activo = true')
        .andWhere('p.activo = true')
        .andWhere('(p.coordinador_id = :usuarioId OR p.scrum_master_id = :usuarioId)', { usuarioId });
    } else if (userRole === Role.SCRUM_MASTER) {
      // SCRUM_MASTER sees projects where they are scrum_master
      qb.where('n.activo = true')
        .andWhere('p.activo = true')
        .andWhere('p.scrum_master_id = :usuarioId', { usuarioId });
    } else {
      qb.where('n.destinatarioId = :usuarioId', { usuarioId })
        .andWhere('n.activo = true');

      // DESARROLLADOR only sees TAREAS notifications
      if (userRole === Role.DESARROLLADOR) {
        qb.andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.TAREAS });
      }
    }

    if (pgdId) {
      qb.innerJoin('p.accionEstrategica', 'ae')
        .innerJoin('ae.oegd', 'oegd')
        .innerJoin('oegd.ogd', 'ogd')
        .andWhere('ogd.pgdId = :pgdId', { pgdId });
    }

    const results = await qb
      .groupBy('p.id')
      .addGroupBy('p.codigo')
      .addGroupBy('p.nombre')
      .orderBy('MAX(n.createdAt)', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      proyectoId: parseInt(r.proyectoId, 10),
      proyectoCodigo: r.proyectoCodigo,
      proyectoNombre: r.proyectoNombre,
      total: parseInt(r.total, 10),
      noLeidas: parseInt(r.noLeidas, 10),
    }));
  }

  /**
   * Get notification counts by section for a specific project (PMO view).
   * Sections: Asignaciones (PROYECTOS), Sprints, Aprobaciones, Validaciones
   */
  async getSeccionCountsByProyecto(usuarioId: number, proyectoId: number, userRole?: string): Promise<{
    asignaciones: { total: number; noLeidas: number };
    sprints: { total: number; noLeidas: number };
    aprobaciones: { total: number; noLeidas: number };
    validaciones: { total: number; noLeidas: number };
  }> {
    const secciones = [
      { key: 'asignaciones', tipo: TipoNotificacion.PROYECTOS },
      { key: 'sprints', tipo: TipoNotificacion.SPRINTS },
      { key: 'aprobaciones', tipo: TipoNotificacion.APROBACIONES },
      { key: 'validaciones', tipo: TipoNotificacion.VALIDACIONES },
    ] as const;

    const result: Record<string, { total: number; noLeidas: number }> = {};

    await Promise.all(
      secciones.map(async ({ key, tipo }) => {
        // PMO, COORDINADOR, and SCRUM_MASTER see all notifications for the project
        const whereTotal = (userRole === Role.PMO || userRole === Role.COORDINADOR || userRole === Role.SCRUM_MASTER)
          ? { proyectoId, tipo, activo: true }
          : { destinatarioId: usuarioId, proyectoId, tipo, activo: true };

        const whereNoLeidas = (userRole === Role.PMO || userRole === Role.COORDINADOR || userRole === Role.SCRUM_MASTER)
          ? { proyectoId, tipo, activo: true, leida: false }
          : { destinatarioId: usuarioId, proyectoId, tipo, activo: true, leida: false };

        const [total, noLeidas] = await Promise.all([
          this.notificacionRepository.count({ where: whereTotal }),
          this.notificacionRepository.count({ where: whereNoLeidas }),
        ]);
        result[key] = { total, noLeidas };
      }),
    );

    return {
      asignaciones: result.asignaciones,
      sprints: result.sprints,
      aprobaciones: result.aprobaciones,
      validaciones: result.validaciones,
    };
  }

  /**
   * Group notifications by activity (PMO view - Actividades tab).
   */
  async findGroupedByActividad(usuarioId: number, pgdId?: number, userRole?: string): Promise<{
    actividadId: number;
    actividadCodigo: string;
    actividadNombre: string;
    total: number;
    noLeidas: number;
  }[]> {
    const qb = this.notificacionRepository
      .createQueryBuilder('n')
      .innerJoin('n.actividad', 'a')
      .select('a.id', 'actividadId')
      .addSelect('a.codigo', 'actividadCodigo')
      .addSelect('a.nombre', 'actividadNombre')
      .addSelect('COUNT(n.id)', 'total')
      .addSelect('COUNT(CASE WHEN n.leida = false THEN 1 END)', 'noLeidas');

    // PMO sees all active activities with notifications
    if (userRole === Role.PMO) {
      qb.where('n.activo = true')
        .andWhere('n.actividadId IS NOT NULL')
        .andWhere('a.activo = true');
    } else if (userRole === Role.COORDINADOR) {
      // COORDINADOR sees activities where they are coordinador or gestor
      qb.where('n.activo = true')
        .andWhere('n.actividadId IS NOT NULL')
        .andWhere('a.activo = true')
        .andWhere('(a.coordinador_id = :usuarioId OR a.gestor_id = :usuarioId)', { usuarioId });
    } else if (userRole === Role.IMPLEMENTADOR) {
      // IMPLEMENTADOR only sees subtask notifications (not regular tasks)
      qb.where('n.destinatarioId = :usuarioId', { usuarioId })
        .andWhere('n.activo = true')
        .andWhere('n.actividadId IS NOT NULL')
        .andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.TAREAS })
        .andWhere('n.entidadTipo = :entidadTipo', { entidadTipo: 'subtarea' });
    } else {
      qb.where('n.destinatarioId = :usuarioId', { usuarioId })
        .andWhere('n.activo = true')
        .andWhere('n.actividadId IS NOT NULL');
    }

    if (pgdId) {
      qb.innerJoin('a.accionEstrategica', 'ae')
        .innerJoin('ae.oegd', 'oegd')
        .innerJoin('oegd.ogd', 'ogd')
        .andWhere('ogd.pgdId = :pgdId', { pgdId });
    }

    const results = await qb
      .groupBy('a.id')
      .addGroupBy('a.codigo')
      .addGroupBy('a.nombre')
      .orderBy('MAX(n.createdAt)', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      actividadId: parseInt(r.actividadId, 10),
      actividadCodigo: r.actividadCodigo,
      actividadNombre: r.actividadNombre,
      total: parseInt(r.total, 10),
      noLeidas: parseInt(r.noLeidas, 10),
    }));
  }

  /**
   * Get notification counts by section for a specific activity (PMO view).
   * Sections: Asignaciones (activity assignments), Tareas (task notifications)
   */
  async getSeccionCountsByActividad(usuarioId: number, actividadId: number, userRole?: string): Promise<{
    asignaciones: { total: number; noLeidas: number };
    tareas: { total: number; noLeidas: number };
  }> {
    const secciones = [
      { key: 'asignaciones', tipo: TipoNotificacion.PROYECTOS }, // Activity assignments use PROYECTOS type
      { key: 'tareas', tipo: TipoNotificacion.TAREAS },
    ] as const;

    const result: Record<string, { total: number; noLeidas: number }> = {};

    await Promise.all(
      secciones.map(async ({ key, tipo }) => {
        // PMO and COORDINADOR see all notifications for the activity
        const whereTotal = (userRole === Role.PMO || userRole === Role.COORDINADOR)
          ? { actividadId, tipo, activo: true }
          : { destinatarioId: usuarioId, actividadId, tipo, activo: true };

        const whereNoLeidas = (userRole === Role.PMO || userRole === Role.COORDINADOR)
          ? { actividadId, tipo, activo: true, leida: false }
          : { destinatarioId: usuarioId, actividadId, tipo, activo: true, leida: false };

        const [total, noLeidas] = await Promise.all([
          this.notificacionRepository.count({ where: whereTotal }),
          this.notificacionRepository.count({ where: whereNoLeidas }),
        ]);
        result[key] = { total, noLeidas };
      }),
    );

    return {
      asignaciones: result.asignaciones,
      tareas: result.tareas,
    };
  }

  async marcarTodasLeidasPorActividad(actividadId: number, usuarioId: number): Promise<{ actualizadas: number }> {
    const result = await this.notificacionRepository.update(
      { destinatarioId: usuarioId, actividadId, leida: false, activo: true },
      { leida: true, fechaLeida: new Date() },
    );

    return { actualizadas: result.affected || 0 };
  }

  async softDeleteByActividades(actividadIds: number[], usuarioId: number): Promise<{ eliminadas: number }> {
    const result = await this.notificacionRepository
      .createQueryBuilder()
      .update(Notificacion)
      .set({ activo: false })
      .where('actividadId IN (:...actividadIds)', { actividadIds })
      .andWhere('destinatarioId = :usuarioId', { usuarioId })
      .execute();

    return { eliminadas: result.affected || 0 };
  }

  async findGroupedBySprint(usuarioId: number, proyectoId: number, userRole?: string): Promise<{
    sprintId: number;
    sprintNombre: string;
    total: number;
    noLeidas: number;
  }[]> {
    const qb = this.notificacionRepository
      .createQueryBuilder('n')
      .innerJoin('agile.sprints', 's', 's.id = n.entidadId')
      .select('s.id', 'sprintId')
      .addSelect('s.nombre', 'sprintNombre')
      .addSelect('COUNT(n.id)', 'total')
      .addSelect('COUNT(CASE WHEN n.leida = false THEN 1 END)', 'noLeidas');

    // PMO sees all sprint notifications for the project
    if (userRole === Role.PMO) {
      qb.where('n.proyectoId = :proyectoId', { proyectoId })
        .andWhere('n.activo = true')
        .andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.SPRINTS });
    } else {
      qb.where('n.destinatarioId = :usuarioId', { usuarioId })
        .andWhere('n.proyectoId = :proyectoId', { proyectoId })
        .andWhere('n.activo = true')
        .andWhere('n.tipo = :tipo', { tipo: TipoNotificacion.SPRINTS });
    }

    const results = await qb
      .groupBy('s.id')
      .addGroupBy('s.nombre')
      .orderBy('MAX(n.createdAt)', 'DESC')
      .getRawMany();

    return results.map((r) => ({
      sprintId: parseInt(r.sprintId, 10),
      sprintNombre: r.sprintNombre,
      total: parseInt(r.total, 10),
      noLeidas: parseInt(r.noLeidas, 10),
    }));
  }

  // ==========================================
  // Soft delete masivo
  // ==========================================

  async softDeleteBulk(ids: number[], usuarioId: number): Promise<{ eliminadas: number }> {
    const result = await this.notificacionRepository
      .createQueryBuilder()
      .update(Notificacion)
      .set({ activo: false })
      .where('id IN (:...ids)', { ids })
      .andWhere('destinatarioId = :usuarioId', { usuarioId })
      .execute();

    return { eliminadas: result.affected || 0 };
  }

  async softDeleteByProyectos(proyectoIds: number[], usuarioId: number): Promise<{ eliminadas: number }> {
    const result = await this.notificacionRepository
      .createQueryBuilder()
      .update(Notificacion)
      .set({ activo: false })
      .where('proyectoId IN (:...proyectoIds)', { proyectoIds })
      .andWhere('destinatarioId = :usuarioId', { usuarioId })
      .execute();

    return { eliminadas: result.affected || 0 };
  }

  async marcarTodasLeidasPorProyecto(proyectoId: number, usuarioId: number): Promise<{ actualizadas: number }> {
    const result = await this.notificacionRepository.update(
      { destinatarioId: usuarioId, proyectoId, leida: false, activo: true },
      { leida: true, fechaLeida: new Date() },
    );

    return { actualizadas: result.affected || 0 };
  }

  // ==========================================
  // Métodos de creación de notificaciones
  // ==========================================

  /**
   * Método para crear notificaciones desde otros módulos.
   * Uso:
   * ```typescript
   * await notificacionService.notificar(
   *   TipoNotificacion.PROYECTOS,
   *   coordinadorId,
   *   {
   *     titulo: 'Nuevo proyecto asignado',
   *     descripcion: `Se te ha asignado el proyecto ${proyecto.nombre}`,
   *     entidadTipo: 'Proyecto',
   *     entidadId: proyecto.id,
   *     proyectoId: proyecto.id,
   *     urlAccion: `/proyectos/${proyecto.id}`,
   *   }
   * );
   * ```
   */
  async notificar(
    tipo: TipoNotificacion,
    destinatarioId: number,
    data: NotificarData,
  ): Promise<Notificacion> {
    const notificacion = this.notificacionRepository.create({
      tipo,
      destinatarioId,
      titulo: data.titulo,
      descripcion: data.descripcion,
      entidadTipo: data.entidadTipo,
      entidadId: data.entidadId,
      proyectoId: data.proyectoId,
      actividadId: data.actividadId,
      urlAccion: data.urlAccion,
      observacion: data.observacion,
    });

    const saved = await this.notificacionRepository.save(notificacion);

    // Emitir via WebSocket si el gateway esta disponible
    if (this.gateway) {
      this.gateway.emitToUser(destinatarioId, saved);
      // Actualizar conteo
      const conteo = await this.getConteo(destinatarioId);
      this.gateway.emitCountUpdate(destinatarioId, conteo);
    }

    return saved;
  }

  /**
   * Método para enviar notificaciones a múltiples destinatarios.
   */
  async notificarMultiples(
    tipo: TipoNotificacion,
    destinatarioIds: number[],
    data: NotificarData,
  ): Promise<Notificacion[]> {
    const notificaciones = destinatarioIds.map((destinatarioId) =>
      this.notificacionRepository.create({
        tipo,
        destinatarioId,
        titulo: data.titulo,
        descripcion: data.descripcion,
        entidadTipo: data.entidadTipo,
        entidadId: data.entidadId,
        proyectoId: data.proyectoId,
        actividadId: data.actividadId,
        urlAccion: data.urlAccion,
      }),
    );

    const saved = await this.notificacionRepository.save(notificaciones);

    // Emitir via WebSocket a cada destinatario
    if (this.gateway) {
      for (const notificacion of saved) {
        this.gateway.emitToUser(notificacion.destinatarioId, notificacion);
        const conteo = await this.getConteo(notificacion.destinatarioId);
        this.gateway.emitCountUpdate(notificacion.destinatarioId, conteo);
      }
    }

    return saved;
  }

  /**
   * Emitir evento de tarea actualizada (para tablero Kanban)
   */
  emitTaskUpdate(proyectoId: number, event: string, data: any): void {
    if (this.gateway) {
      this.gateway.emitTaskUpdate(proyectoId, event, data);
    }
  }

  /**
   * Emitir evento de sprint actualizado
   */
  emitSprintUpdate(proyectoId: number, data: any): void {
    if (this.gateway) {
      this.gateway.emitSprintUpdate(proyectoId, data);
    }
  }
}
