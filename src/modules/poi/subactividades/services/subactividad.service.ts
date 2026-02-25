import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subactividad } from '../entities/subactividad.entity';
import { Actividad } from '../../actividades/entities/actividad.entity';
import { CreateSubactividadDto } from '../dto/create-subactividad.dto';
import { UpdateSubactividadDto } from '../dto/update-subactividad.dto';
import { ActividadEstado } from '../../actividades/enums/actividad-estado.enum';
import { Tarea } from '../../../agile/tareas/entities/tarea.entity';
import { TareaEstado, TareaTipo } from '../../../agile/tareas/enums/tarea.enum';
import { NotificacionService } from '../../../notificaciones/services/notificacion.service';
import { TipoNotificacion } from '../../../notificaciones/enums/tipo-notificacion.enum';
import { Usuario } from '../../../auth/entities/usuario.entity';
import { Role } from '../../../../common/constants/roles.constant';

export interface SubactividadMetricas {
  leadTime: number | null;
  cycleTime: number | null;
  throughput: number;
  wipActual: number;
  totalTareas: number;
  tareasPorHacer: number;
  tareasEnProgreso: number;
  tareasCompletadas: number;
  porcentajeCompletado: number;
}

@Injectable()
export class SubactividadService {
  constructor(
    @InjectRepository(Subactividad)
    private readonly subactividadRepo: Repository<Subactividad>,
    @InjectRepository(Actividad)
    private readonly actividadRepo: Repository<Actividad>,
    @InjectRepository(Tarea)
    private readonly tareaRepo: Repository<Tarea>,
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    @Inject(forwardRef(() => NotificacionService))
    private readonly notificacionService: NotificacionService,
  ) {}

  private async getPmoUserIds(): Promise<number[]> {
    const pmoUsers = await this.usuarioRepo.find({
      where: { rol: Role.PMO, activo: true },
      select: ['id'],
    });
    return pmoUsers.map(u => u.id);
  }

  /**
   * Genera el siguiente código para una subactividad de una actividad padre.
   * Formato: SUBACT-001, SUBACT-002, ...
   */
  async getNextCodigo(actividadPadreId: number): Promise<string> {
    const subactividades = await this.subactividadRepo.find({
      where: { actividadPadreId },
      select: ['codigo'],
    });

    let maxNum = 0;
    for (const sub of subactividades) {
      const match = sub.codigo.match(/SUBACT-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `SUBACT-${String(maxNum + 1).padStart(3, '0')}`;
  }

  async create(dto: CreateSubactividadDto, userId?: number): Promise<Subactividad> {
    // Verificar que la actividad padre exista
    const actividadPadre = await this.actividadRepo.findOne({
      where: { id: dto.actividadPadreId, activo: true },
    });

    if (!actividadPadre) {
      throw new NotFoundException(`Actividad con ID ${dto.actividadPadreId} no encontrada`);
    }

    // Validar años: deben ser subconjunto de los años del padre
    if (dto.anios && dto.anios.length > 0 && actividadPadre.anios && actividadPadre.anios.length > 0) {
      const aniosInvalidos = dto.anios.filter(a => !actividadPadre.anios.includes(a));
      if (aniosInvalidos.length > 0) {
        throw new BadRequestException(
          `Los años ${aniosInvalidos.join(', ')} no son válidos. Deben ser subconjunto de los años de la actividad padre: ${actividadPadre.anios.join(', ')}`
        );
      }
    }

    const codigo = await this.getNextCodigo(dto.actividadPadreId);

    const subactividad = this.subactividadRepo.create({
      ...dto,
      codigo,
      metodoGestion: 'Kanban',
      // Heredar del padre si no se especifican
      clasificacion: dto.clasificacion ?? actividadPadre.clasificacion,
      accionEstrategicaId: dto.accionEstrategicaId ?? actividadPadre.accionEstrategicaId,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.subactividadRepo.save(subactividad);

    // Auto-transición: Pendiente → En desarrollo cuando se crea una subactividad
    if (actividadPadre.estado === ActividadEstado.PENDIENTE) {
        await this.actividadRepo.update(actividadPadre.id, {
            estado: ActividadEstado.EN_DESARROLLO,
            updatedBy: userId,
        });
    }

    // Notificar coordinador si fue asignado
    if (dto.coordinadorId && dto.coordinadorId !== userId) {
      const destinatarios: number[] = [dto.coordinadorId];
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatarios.includes(pmoId)) destinatarios.push(pmoId);
      }
      await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, destinatarios, {
        titulo: `Subactividad asignada ${saved.codigo}: ${saved.nombre}`,
        descripcion: `Se ha asignado como Coordinador de la subactividad "${saved.nombre}"`,
        entidadTipo: 'Subactividad',
        entidadId: saved.id,
        actividadId: dto.actividadPadreId,
        urlAccion: `/poi/subactividad/detalles?id=${saved.id}`,
      });
    }

    // Notificar gestor si fue asignado
    if (dto.gestorId && dto.gestorId !== userId && dto.gestorId !== dto.coordinadorId) {
      const destinatarios: number[] = [dto.gestorId];
      const pmoIds = await this.getPmoUserIds();
      for (const pmoId of pmoIds) {
        if (pmoId !== userId && !destinatarios.includes(pmoId)) destinatarios.push(pmoId);
      }
      await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, destinatarios, {
        titulo: `Subactividad asignada ${saved.codigo}: ${saved.nombre}`,
        descripcion: `Se ha asignado como Gestor de la subactividad "${saved.nombre}"`,
        entidadTipo: 'Subactividad',
        entidadId: saved.id,
        actividadId: dto.actividadPadreId,
        urlAccion: `/poi/subactividad/detalles?id=${saved.id}`,
      });
    }

    return saved;
  }

  async findByActividad(actividadPadreId: number): Promise<(Subactividad & { tareasCount: number; tareasEnProgreso: number; tareasCompletadas: number })[]> {
    const subactividades = await this.subactividadRepo.find({
      where: { actividadPadreId, activo: true },
      relations: ['coordinador', 'gestor', 'actividadPadre'],
      order: { codigo: 'ASC' },
    });

    if (subactividades.length === 0) return [];

    // Obtener conteos de tareas en una sola consulta agrupada por subactividadId
    const subIds = subactividades.map(s => s.id);
    const conteosRaw: { subactividad_id: string; total: string; en_progreso: string; completadas: string }[] =
      await this.tareaRepo.createQueryBuilder('t')
        .select('t.subactividad_id', 'subactividad_id')
        .addSelect('COUNT(t.id)', 'total')
        .addSelect(`SUM(CASE WHEN t.estado = '${TareaEstado.EN_PROGRESO}' THEN 1 ELSE 0 END)`, 'en_progreso')
        .addSelect(`SUM(CASE WHEN t.estado = '${TareaEstado.FINALIZADO}' THEN 1 ELSE 0 END)`, 'completadas')
        .where('t.subactividad_id IN (:...ids)', { ids: subIds })
        .andWhere('t.activo = true')
        .andWhere('t.tipo = :tipo', { tipo: TareaTipo.KANBAN })
        .groupBy('t.subactividad_id')
        .getRawMany();

    const conteosMap = new Map<number, { total: number; enProgreso: number; completadas: number }>();
    for (const row of conteosRaw) {
      conteosMap.set(Number(row.subactividad_id), {
        total: parseInt(row.total, 10),
        enProgreso: parseInt(row.en_progreso, 10),
        completadas: parseInt(row.completadas, 10),
      });
    }

    return subactividades.map(sub => {
      const conteo = conteosMap.get(sub.id) ?? { total: 0, enProgreso: 0, completadas: 0 };
      return Object.assign(sub, {
        tareasCount: conteo.total,
        tareasEnProgreso: conteo.enProgreso,
        tareasCompletadas: conteo.completadas,
      });
    });
  }

  async findOne(id: number): Promise<Subactividad> {
    const subactividad = await this.subactividadRepo.findOne({
      where: { id },
      relations: ['coordinador', 'gestor', 'actividadPadre', 'accionEstrategica'],
    });

    if (!subactividad) {
      throw new NotFoundException(`Subactividad con ID ${id} no encontrada`);
    }

    return subactividad;
  }

  async update(id: number, dto: UpdateSubactividadDto, userId?: number): Promise<Subactividad> {
    const subactividad = await this.findOne(id);

    // Validar años contra la actividad padre si se están actualizando
    if (dto.anios && dto.anios.length > 0) {
      const actividadPadre = await this.actividadRepo.findOne({
        where: { id: subactividad.actividadPadreId },
        select: ['anios'],
      });
      if (actividadPadre?.anios && actividadPadre.anios.length > 0) {
        const aniosInvalidos = dto.anios.filter(a => !actividadPadre.anios.includes(a));
        if (aniosInvalidos.length > 0) {
          throw new BadRequestException(
            `Los años ${aniosInvalidos.join(', ')} no son válidos. Deben ser subconjunto de los años de la actividad padre: ${actividadPadre.anios.join(', ')}`
          );
        }
      }
    }

    // Usar update() directo para evitar que TypeORM use el objeto de relación
    // cacheado (gestor, coordinador) como fuente del FK en lugar del nuevo ID
    await this.subactividadRepo.update(id, { ...(dto as any), updatedBy: userId });
    return this.findOne(id);
  }

  async remove(id: number, userId?: number): Promise<Subactividad> {
    const subactividad = await this.findOne(id);
    subactividad.activo = false;
    subactividad.updatedBy = userId;
    return this.subactividadRepo.save(subactividad);
  }

  async getTareas(subactividadId: number): Promise<Tarea[]> {
    await this.findOne(subactividadId);
    return this.tareaRepo.find({
      where: { subactividadId, activo: true, tipo: TareaTipo.KANBAN },
      order: { createdAt: 'ASC' },
    });
  }

  async verificarTareasFinalizadas(subactividadId: number): Promise<{
    todasFinalizadas: boolean;
    totalTareas: number;
    tareasFinalizadas: number;
  }> {
    const tareas = await this.tareaRepo.find({
      where: { subactividadId, activo: true, tipo: TareaTipo.KANBAN },
      select: ['id', 'estado'],
    });

    const totalTareas = tareas.length;
    const tareasFinalizadas = tareas.filter(t => t.estado === TareaEstado.FINALIZADO).length;
    const todasFinalizadas = totalTareas > 0 && tareasFinalizadas === totalTareas;

    return { todasFinalizadas, totalTareas, tareasFinalizadas };
  }

  async finalizarSubactividad(subactividadId: number, userId?: number): Promise<Subactividad> {
    const subactividad = await this.subactividadRepo.findOne({ where: { id: subactividadId } });

    if (!subactividad) {
      throw new NotFoundException('Subactividad no encontrada');
    }

    if (subactividad.estado === ActividadEstado.FINALIZADO) {
      throw new BadRequestException('La subactividad ya está finalizada');
    }

    // Verificar que todas las tareas estén finalizadas
    const tareas = await this.tareaRepo.find({
      where: { subactividadId, activo: true, tipo: TareaTipo.KANBAN },
      select: ['id', 'estado'],
    });

    const tareasNoFinalizadas = tareas.filter(t => t.estado !== TareaEstado.FINALIZADO);
    if (tareasNoFinalizadas.length > 0) {
      throw new BadRequestException(
        `No se puede finalizar la subactividad porque aún hay ${tareasNoFinalizadas.length} tarea(s) pendiente(s)`
      );
    }

    subactividad.estado = ActividadEstado.FINALIZADO;
    subactividad.updatedBy = userId;
    const finalizada = await this.subactividadRepo.save(subactividad);

    console.log(`[Subactividad ${subactividad.codigo}] Finalizada manualmente por usuario ${userId}`);

    // Notificar coordinador y gestor
    const destinatarios = [subactividad.coordinadorId, subactividad.gestorId].filter(
      (id): id is number => id !== null && id !== undefined,
    );
    if (destinatarios.length > 0) {
      await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, destinatarios, {
        titulo: `Subactividad finalizada: ${subactividad.codigo}`,
        descripcion: `La subactividad "${subactividad.nombre}" ha sido finalizada. Todas las tareas están completadas.`,
        entidadTipo: 'Subactividad',
        entidadId: subactividad.id,
        actividadId: subactividad.actividadPadreId,
        urlAccion: `/poi/subactividad/detalles?id=${subactividad.id}`,
      });
    }

    // Verificar si todas las subactividades de la actividad padre están finalizadas
    await this.verificarSubactividadesCompletadas(subactividad.actividadPadreId, userId);

    return finalizada;
  }

  /**
   * Verifica si todas las subactividades de una actividad están finalizadas.
   * Si es así, notifica para que el usuario confirme manualmente la finalización.
   */
  private async verificarSubactividadesCompletadas(actividadPadreId: number, userId?: number): Promise<void> {
    const subactividades = await this.subactividadRepo.find({
      where: { actividadPadreId, activo: true },
      select: ['id', 'estado'],
    });

    if (subactividades.length === 0) return;

    const todasFinalizadas = subactividades.every(s => s.estado === ActividadEstado.FINALIZADO);
    if (!todasFinalizadas) return;

    // Solo notificar — la finalización de la actividad padre requiere confirmación manual del usuario
    const actividad = await this.actividadRepo.findOne({
      where: { id: actividadPadreId },
      select: ['id', 'codigo', 'nombre', 'estado', 'coordinadorId', 'gestorId'],
    });

    if (!actividad || actividad.estado === ActividadEstado.FINALIZADO) return;

    console.log(`[Actividad ${actividad.codigo}] Todas sus subactividades están finalizadas. En espera de confirmación del usuario.`);

    // Notificar coordinador y PMOs de la actividad padre
    const destinatarios = [actividad.coordinadorId, actividad.gestorId].filter(
      (id): id is number => id !== null && id !== undefined,
    );
    const pmoIds = await this.getPmoUserIds();
    for (const pmoId of pmoIds) {
      if (!destinatarios.includes(pmoId)) destinatarios.push(pmoId);
    }

    if (destinatarios.length > 0) {
      await this.notificacionService.notificarMultiples(TipoNotificacion.PROYECTOS, destinatarios, {
        titulo: `Listo para finalizar: ${actividad.codigo}`,
        descripcion: `Todas las subactividades de "${actividad.nombre}" están completadas. Se requiere confirmación para finalizar la actividad.`,
        entidadTipo: 'Actividad',
        entidadId: actividad.id,
        actividadId: actividad.id,
        urlAccion: `/poi/actividad/detalles?id=${actividad.id}`,
      });
    }
  }

  async getMetricas(subactividadId: number): Promise<SubactividadMetricas> {
    await this.findOne(subactividadId);

    const tareas = await this.tareaRepo.find({
      where: { subactividadId, tipo: TareaTipo.KANBAN, activo: true },
    });

    const totalTareas = tareas.length;
    const tareasPorHacer = tareas.filter(t => t.estado === TareaEstado.POR_HACER).length;
    const tareasEnProgreso = tareas.filter(t => t.estado === TareaEstado.EN_PROGRESO).length;
    const tareasCompletadas = tareas.filter(t => t.estado === TareaEstado.FINALIZADO).length;
    const wipActual = tareasEnProgreso;

    const porcentajeCompletado = totalTareas > 0
      ? Math.round((tareasCompletadas / totalTareas) * 100)
      : 0;

    // Lead Time
    const tareasConLeadTime = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO && t.fechaCompletado && t.createdAt
    );
    let leadTime: number | null = null;
    if (tareasConLeadTime.length > 0) {
      const totalMs = tareasConLeadTime.reduce((sum, t) => {
        return sum + (new Date(t.fechaCompletado).getTime() - new Date(t.createdAt).getTime());
      }, 0);
      leadTime = Math.round((totalMs / tareasConLeadTime.length / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // Cycle Time
    const tareasConCycleTime = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO && t.fechaCompletado && t.fechaInicioProgreso
    );
    let cycleTime: number | null = null;
    if (tareasConCycleTime.length > 0) {
      const totalMs = tareasConCycleTime.reduce((sum, t) => {
        return sum + (new Date(t.fechaCompletado).getTime() - new Date(t.fechaInicioProgreso).getTime());
      }, 0);
      cycleTime = Math.round((totalMs / tareasConCycleTime.length / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // Throughput (últimos 7 días)
    const semanaAtras = new Date();
    semanaAtras.setDate(semanaAtras.getDate() - 7);
    const throughput = tareas.filter(t =>
      t.estado === TareaEstado.FINALIZADO && t.fechaCompletado && new Date(t.fechaCompletado) >= semanaAtras
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
